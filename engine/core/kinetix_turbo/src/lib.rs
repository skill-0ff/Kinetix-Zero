use pyo3::prelude::*;
use pyo3::types::PyBytes;
use prost::Message;
use std::collections::HashSet;
use std::time::SystemTime;
use chrono::{DateTime, Utc};

pub mod kinetix {
    include!(concat!(env!("OUT_DIR"), "/kinetix.rs"));
}

use kinetix::{KinetixPacket, kinetix_packet::Payload, kinetix_packet::event::Details};

fn is_public_ipv4(ip: &str) -> bool {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 { return false; }
    
    let o1 = parts[0].parse::<u8>().unwrap_or(0);
    let o2 = parts[1].parse::<u8>().unwrap_or(0);
    
    if o1 == 10 { return false; }
    if o1 == 127 { return false; }
    if o1 == 192 && o2 == 168 { return false; }
    if o1 == 172 && (o2 >= 16 && o2 <= 31) { return false; }
    if o1 == 169 && o2 == 254 { return false; }
    if o1 == 0 || o1 >= 224 { return false; }
    
    true
}

#[pyfunction]
fn process_batch<'py>(py: Python<'py>, raw_batch: Vec<Bound<'py, PyBytes>>) -> PyResult<(Vec<Py<PyBytes>>, HashSet<String>)> {
    let mut cleaned_bytes = Vec::with_capacity(raw_batch.len());
    let mut indicators = HashSet::new();

    let now: DateTime<Utc> = SystemTime::now().into();
    let current_iso_time = now.to_rfc3339();

    for wrapped_data in raw_batch {
        let data = wrapped_data.as_bytes();
        if let Ok(mut pkt) = KinetixPacket::decode(data) {
            // 1. Wipe auth
            pkt.auth = None;
            
            // 2. Inject server_ts
            pkt.server_ts = current_iso_time.clone();

            // 3. Extract Indicators
            if let Some(Payload::Event(event)) = &pkt.payload {
                if let Some(details) = &event.details {
                    match details {
                        Details::ProcessStart(p) => {
                            indicators.insert(p.sha256.clone());
                            indicators.insert(p.parent_sha256.clone());
                        },
                        Details::ProcessKill(p) => {
                            indicators.insert(p.sha256.clone());
                        },
                        Details::FileEvent(f) => {
                            indicators.insert(f.hash.clone());
                        },
                        Details::NetworkConn(n) => {
                            if is_public_ipv4(&n.dst_ip) { indicators.insert(n.dst_ip.clone()); }
                        },
                        Details::AuthLogin(a) => {
                            if is_public_ipv4(&a.src_ip) { indicators.insert(a.src_ip.clone()); }
                        },
                        Details::ModuleLoad(m) => {
                            indicators.insert(m.sha256.clone());
                        },
                        Details::Traffic(t) => {
                            if is_public_ipv4(&t.src_ip) { indicators.insert(t.src_ip.clone()); }
                            if is_public_ipv4(&t.dst_ip) { indicators.insert(t.dst_ip.clone()); }
                        },
                        _ => {}
                    }
                }
            }

            // 4. Re-encode
            let mut buf = Vec::with_capacity(data.len());
            if pkt.encode(&mut buf).is_ok() {
                cleaned_bytes.push(PyBytes::new_bound(py, &buf).into());
            }
        }
    }

    // Clean up empty string (from missing fields in protobuf)
    indicators.remove("");

    Ok((cleaned_bytes, indicators))
}

#[pymodule]
fn kinetix_turbo<'py>(_py: Python<'py>, m: &Bound<'py, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(process_batch, m)?)?;
    Ok(())
}
