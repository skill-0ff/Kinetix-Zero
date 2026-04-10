use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::time::interval;
use anyhow::{Context, Result};
use dashmap::DashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::net::UdpSocket;
use x25519_dalek::{EphemeralSecret, PublicKey};
use rand::rngs::OsRng;
use chacha20poly1305::{aead::{Aead, KeyInit, Payload}, ChaCha20Poly1305, Nonce};
use sha2::{Sha256, Digest};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CollectorConfig {
    pub idle_timeout_sec: u64,
    pub pending_timeout_sec: u64,
    pub online_timeout_sec: u64,
    pub max_packet_per_second: u64,
    pub max_packet_per_second_per_agent: u64,
    pub max_pending_agents: u64,
    pub max_online_agents: u64,
    pub secrets_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Secrets {
    pub serv_secret: String,
    pub agen_secret: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RudpConfig {
    pub window_size: u32,
    pub mtu: u32,
    pub retries: u32,
    pub retransmit_ms: u64,
}

const RUDP_PORT: u16 = 5001;
const FLAGS_INIT: u8 = 0x01;
const FLAGS_RESP: u8 = 0x02;
const FLAGS_AUTH_REQ: u8 = 0x03;
const FLAGS_AUTH_RESP: u8 = 0x04;
const FLAGS_DATA: u8 = 0x05;
const FLAGS_ACK: u8 = 0x06;

#[derive(Clone)]
struct PendingPacket {
    data: Vec<u8>,
    sent_at: std::time::Instant,
    retries: u32,
}

struct PendingSession {
    shared_secret: Option<[u8; 32]>,
    created_at: std::time::Instant,
}

#[allow(dead_code)]
struct OnlineSession {
    shared_secret: [u8; 32],
    host_id: String,
    last_activity: std::time::Instant,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveLogs {
    pub ddos_evidence: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoragePolicy {
    pub save_logs: SaveLogs,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub forensic_sample_rate: u64,
    pub forensic_sample_mode: String,
    pub mongo_uri: String,
    pub collector: CollectorConfig,
    pub rudp: RudpConfig,
    pub storage_policy: StoragePolicy,
}

/// Strip comments from JSONC (JSON with Comments) text.
/// Supports // and /* ... */ comments.
fn strip_jsonc_comments(text: &str) -> String {
    let mut in_string = false;
    let mut escaped = false;
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_string {
            out.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }

        if ch == '"' {
            in_string = true;
            out.push(ch);
            continue;
        }

        if ch == '/' {
            if let Some(&nxt) = chars.peek() {
                if nxt == '/' {
                    // Line comment
                    chars.next();
                    while let Some(&c) = chars.peek() {
                        if c == '\n' || c == '\r' {
                            break;
                        }
                        chars.next();
                    }
                    continue;
                } else if nxt == '*' {
                    // Block comment
                    chars.next();
                    while let Some(c) = chars.next() {
                        if c == '*' {
                            if let Some(&n) = chars.peek() {
                                if n == '/' {
                                    chars.next();
                                    break;
                                }
                            }
                        }
                    }
                    continue;
                }
            }
        }

        out.push(ch);
    }

    out
}

fn find_config_file() -> Result<PathBuf> {
    // Try common paths relative to the current directory
    let paths = vec![
        "../config.jsonc",           // If run from engine/core/kinetix_turbo
        "config.jsonc",              // If run from engine/core
        "engine/core/config.jsonc",  // If run from project root
    ];

    for p in paths {
        let path = PathBuf::from(p);
        if path.exists() {
            return Ok(path);
        }
    }

    // fallback or error
    Err(anyhow::anyhow!("Configuration file config.jsonc not found in expected locations"))
}

fn load_config(path: &Path) -> Result<AppConfig> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read config file at {:?}", path))?;
    
    let stripped = strip_jsonc_comments(&content);
    
    let config: AppConfig = serde_json::from_str(&stripped)
        .with_context(|| "Failed to parse JSON configuration")?;
    
    Ok(config)
}

fn save_config(path: &Path, config: &AppConfig) -> Result<()> {
    // We want to preserve comments in config.jsonc, so we do a simple string replacement
    // for the "secrets_path" field instead of rewriting the whole file with serde_json.
    let content = fs::read_to_string(path)?;
    let new_path_val = &config.collector.secrets_path;
    
    // Find the secrets_path line and replace its value
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut found = false;
    for line in lines.iter_mut() {
        if let Some(pos) = line.find("\"secrets_path\"") {
            // Find the colon after the key
            if let Some(colon_pos) = line[pos..].find(':') {
                let actual_colon_pos = pos + colon_pos;
                // Find the first and last quotes after the colon
                if let Some(first_quote) = line[actual_colon_pos..].find('"') {
                    let actual_first_quote = actual_colon_pos + first_quote;
                    if let Some(second_quote) = line[actual_first_quote + 1..].find('"') {
                        let actual_second_quote = actual_first_quote + 1 + second_quote;
                        
                        // Replace only the content between the quotes
                        let mut new_line = line[..actual_first_quote + 1].to_string();
                        new_line.push_str(new_path_val);
                        new_line.push_str(&line[actual_second_quote..]);
                        *line = new_line;
                        found = true;
                        break;
                    }
                }
            }
        }
    }

    if found {
        fs::write(path, lines.join("\n"))?;
    } else {
        // Fallback to full rewrite if for some reason the field wasn't found in text form
        let content = serde_json::to_string_pretty(config)?;
        fs::write(path, content)?;
    }
    Ok(())
}

fn generate_random_secret(len: usize) -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ\
                            abcdefghijklmnopqrstuvwxyz\
                            0123456789";
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

fn bootstrap_secrets(config_path: &Path, config: &mut AppConfig) -> Result<Secrets> {
    use std::io::{self, Write};

    // Check if secrets_path is set and file exists
    if !config.collector.secrets_path.is_empty() {
        let p = PathBuf::from(&config.collector.secrets_path);
        if p.exists() {
            let content = fs::read_to_string(&p)?;
            if let Ok(sec) = serde_json::from_str::<Secrets>(&content) {
                return Ok(sec);
            }
        }
    }

    println!("\n\r\x1b[1;36m[🔒 AUTH BOOTSTRAP]\x1b[0m");
    println!("\x1b[1mHandshake secrets not found. Please choose an option:\x1b[0m");
    println!("  [1] Generate new random secrets (saved to collector.key)");
    println!("  [2] Provide path to an existing .key file");
    print!("Selection > ");
    io::stdout().flush()?;

    let mut choice = String::new();
    io::stdin().read_line(&mut choice)?;
    let choice = choice.trim();

    if choice == "1" {
        let sec = Secrets {
            serv_secret: generate_random_secret(48),
            agen_secret: generate_random_secret(48),
        };
        
        // Save to the same directory as the config file
        let mut save_path = config_path.parent().unwrap_or(Path::new(".")).to_path_buf();
        save_path.push("collector.key");
        
        let content = serde_json::to_string_pretty(&sec)?;
        fs::write(&save_path, content)?;
        
        let path_str = save_path.to_string_lossy().to_string().replace("\\", "/");
        config.collector.secrets_path = path_str.clone();
        save_config(config_path, config)?;
        println!("\r\x1b[1;32mGenerated secrets saved to {}\x1b[0m", path_str);
        Ok(sec)
    } else {
        print!("Enter path to .key file > ");
        io::stdout().flush()?;
        let mut path_in = String::new();
        io::stdin().read_line(&mut path_in)?;
        let path_in = path_in.trim().replace("\\", "/");
        
        let content = fs::read_to_string(&path_in)
            .with_context(|| format!("Failed to read secrets at {}", path_in))?;
        let sec: Secrets = serde_json::from_str(&content)
            .with_context(|| "Invalid secrets file format")?;
            
        config.collector.secrets_path = path_in.to_string();
        save_config(config_path, config)?;
        println!("\r\x1b[1;32mSecrets loaded and config updated.\x1b[0m");
        Ok(sec)
    }
}

fn derive_cipher_key(shared_secret: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(shared_secret);
    hasher.finalize().into()
}

fn encrypt_payload(key: &[u8; 32], seq: u32, ad: &[u8], plaintext: &[u8]) -> Vec<u8> {
    let cipher = ChaCha20Poly1305::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    nonce_bytes[0..4].copy_from_slice(&seq.to_be_bytes());
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let payload = Payload { msg: plaintext, aad: ad };
    cipher.encrypt(nonce, payload).unwrap_or_default()
}

fn decrypt_payload(key: &[u8; 32], seq: u32, ad: &[u8], ciphertext: &[u8]) -> Option<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    nonce_bytes[0..4].copy_from_slice(&seq.to_be_bytes());
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let payload = Payload { msg: ciphertext, aad: ad };
    cipher.decrypt(nonce, payload).ok()
}

async fn run_rudp_service(config_handle: Arc<RwLock<AppConfig>>, secrets: Arc<Option<Secrets>>) -> Result<()> {
    let initial_cfg = config_handle.read().await.clone();
    let socket = UdpSocket::bind(format!("0.0.0.0:{}", RUDP_PORT)).await?;
    let socket = Arc::new(socket);
    
    // Tiered Storage Pools
    let pending_peers: Arc<DashMap<SocketAddr, PendingSession>> = Arc::new(DashMap::new());
    let online_peers: Arc<DashMap<SocketAddr, OnlineSession>> = Arc::new(DashMap::new());

    // Global ACK Map (prevents per-agent DashMap overhead)
    let global_acks: Arc<DashMap<(SocketAddr, u32), PendingPacket>> = Arc::new(DashMap::new());

    println!("RUDP Service listening on port {}", RUDP_PORT);

    // Retransmission Task (Global)
    let acks_clone = Arc::clone(&global_acks);
    let socket_clone = Arc::clone(&socket);
    let config_retransmit = Arc::clone(&config_handle);
    tokio::spawn(async move {
        loop {
            let retransmit_cfg = {
                let cfg = config_retransmit.read().await;
                cfg.rudp.clone()
            };
            tokio::time::sleep(Duration::from_millis(retransmit_cfg.retransmit_ms)).await;
            
            let mut expired = Vec::new();
            for mut entry in acks_clone.iter_mut() {
                let ((addr, seq), pending) = entry.pair_mut();
                if pending.sent_at.elapsed().as_millis() >= retransmit_cfg.retransmit_ms as u128 {
                    if pending.retries < retransmit_cfg.retries {
                        pending.retries += 1;
                        pending.sent_at = std::time::Instant::now();
                        let _ = socket_clone.send_to(&pending.data, *addr).await;
                    } else {
                        expired.push((*addr, *seq));
                    }
                }
            }
            for key in expired {
                acks_clone.remove(&key);
            }
        }
    });

    // Cleanup Task (Pending: 1s, Online: 10s)
    let pending_cleanup = Arc::clone(&pending_peers);
    let online_cleanup = Arc::clone(&online_peers);
    let config_gc = Arc::clone(&config_handle);
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            let (p_timeout, o_timeout) = {
                let cfg = config_gc.read().await;
                (cfg.collector.pending_timeout_sec, cfg.collector.online_timeout_sec)
            };
            
            pending_cleanup.retain(|_, p| p.created_at.elapsed().as_secs() < p_timeout);
            online_cleanup.retain(|_, o| o.last_activity.elapsed().as_secs() < o_timeout);
        }
    });

    let mut buf = vec![0u8; initial_cfg.rudp.mtu as usize];
    loop {
        let (len, addr) = socket.recv_from(&mut buf).await?;
        if len < 5 { continue; }

        let current_cfg = config_handle.read().await.clone();

        // Initial connection handling
        if !pending_peers.contains_key(&addr) && !online_peers.contains_key(&addr) {
            // Capacity Enforcement
            if pending_peers.len() >= current_cfg.collector.max_pending_agents as usize {
                continue; 
            }

            pending_peers.insert(addr, PendingSession {
                shared_secret: None,
                created_at: std::time::Instant::now(),
            });
        }

        let seq = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
        let flags = buf[4];

        match flags {
            FLAGS_INIT => {
                // Handshake Init: Payload is 32-byte Agent Public Key
                if len >= 37 {
                    let agent_pub_bytes: [u8; 32] = buf[5..37].try_into().unwrap_or([0u8; 32]);
                    let agent_public = PublicKey::from(agent_pub_bytes);
                    
                    let collector_secret = EphemeralSecret::random_from_rng(OsRng);
                    let collector_public = PublicKey::from(&collector_secret);
                    let shared = collector_secret.diffie_hellman(&agent_public);
                    
                    if let Some(mut p) = pending_peers.get_mut(&addr) {
                        p.shared_secret = Some(*shared.as_bytes());
                    }

                    let mut resp = Vec::with_capacity(37);
                    resp.extend_from_slice(&seq.to_be_bytes());
                    resp.push(FLAGS_RESP);
                    resp.extend_from_slice(collector_public.as_bytes());
                    let _ = socket.send_to(&resp, addr).await;
                }
            }
            FLAGS_AUTH_REQ => {
                // If agent is already online, just resend the Auth-Resp (previous one might be lost)
                if online_peers.contains_key(&addr) {
                    let mut resp = Vec::with_capacity(21);
                    resp.extend_from_slice(&seq.to_be_bytes());
                    resp.push(FLAGS_AUTH_RESP);
                    
                    if let Some(peer) = online_peers.get_mut(&addr) {
                        let key = derive_cipher_key(&peer.shared_secret);
                        let encrypted = encrypt_payload(&key, seq, &buf[0..5], &[0u8; 1]);
                        resp.extend_from_slice(&encrypted);
                    }
                    let _ = socket.send_to(&resp, addr).await;
                    return Ok(());
                }

                // Auth Request: Encrypted payload expected
                if len >= 5 + 16 { // Min 5 bytes header + 16 bytes TAG
                    if let Some(p) = pending_peers.get_mut(&addr) {
                        if let Some(shared) = p.shared_secret {
                            let key = derive_cipher_key(&shared);
                            if let Some(decrypted) = decrypt_payload(&key, seq, &buf[0..5], &buf[5..len]) {
                                // Decrypted Payload: [4-byte ID length][HostID String][48-byte Secret]
                                if decrypted.len() >= 4 {
                                    let id_len = u32::from_be_bytes([decrypted[0], decrypted[1], decrypted[2], decrypted[3]]) as usize;
                                    if decrypted.len() >= 4 + id_len + 48 {
                                        let host_id = String::from_utf8_lossy(&decrypted[4..4 + id_len]).to_string();
                                        let agent_secret = String::from_utf8_lossy(&decrypted[4 + id_len..4 + id_len + 48]).to_string();

                                        let mut auth_ok = false;
                                        if let Some(ref s) = *secrets {
                                            if s.agen_secret == agent_secret { auth_ok = true; }
                                        }

                                        if auth_ok {
                                            drop(p); // Release lock before removal
                                            if let Some((_, p_data)) = pending_peers.remove(&addr) {
                                                if online_peers.len() < current_cfg.collector.max_online_agents as usize {
                                                    online_peers.insert(addr, OnlineSession {
                                                        shared_secret: p_data.shared_secret.unwrap(),
                                                        host_id: host_id.clone(),
                                                        last_activity: std::time::Instant::now(),
                                                    });
                                                    println!("Agent [{}] authenticated (ENCRYPTED) from {}", host_id, addr);
                                                    
                                                    let mut resp = Vec::with_capacity(21);
                                                    resp.extend_from_slice(&seq.to_be_bytes());
                                                    resp.push(FLAGS_AUTH_RESP);
                                                    let encrypted_ack = encrypt_payload(&key, seq, &buf[0..5], &[1u8; 1]);
                                                    resp.extend_from_slice(&encrypted_ack);
                                                    let _ = socket.send_to(&resp, addr).await;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            FLAGS_DATA => {
                if let Some(mut peer) = online_peers.get_mut(&addr) {
                    peer.last_activity = std::time::Instant::now();
                    
                    let key = derive_cipher_key(&peer.shared_secret);
                    if let Some(_decrypted_data) = decrypt_payload(&key, seq, &buf[0..5], &buf[5..len]) {
                        // (Payload processing logic would go here using decrypted_data)
                        
                        let mut ack = Vec::with_capacity(5);
                        ack.extend_from_slice(&seq.to_be_bytes());
                        ack.push(FLAGS_ACK);
                        let _ = socket.send_to(&ack, addr).await;
                    }
                }
            }
            FLAGS_ACK | FLAGS_RESP | FLAGS_AUTH_RESP => {
                global_acks.remove(&(addr, seq));
            }
            _ => {}
        }
    }
}

use crossterm::{
    event::{Event, EventStream, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, Clear, ClearType},
};
use futures_util::StreamExt;

async fn run_interactive_dashboard(config_handle: Arc<RwLock<AppConfig>>) -> Result<()> {
    enable_raw_mode()?;
    let mut reader = EventStream::new();
    let mut interval = interval(Duration::from_secs(5));

    println!("Interactive Dashboard started. Press 'Q' to exit view, Ctrl+C to stop collector.");

    loop {
        tokio::select! {
            _ = interval.tick() => {
                let config = config_handle.read().await;
                execute!(std::io::stdout(), Clear(ClearType::All), crossterm::cursor::MoveTo(0, 0))?;
                print_cyber_dashboard(&config);
                print_dashboard_footer();
            }
            maybe_event = reader.next() => {
                match maybe_event {
                    Some(Ok(Event::Key(key))) => {
                        if key.kind == KeyEventKind::Press {
                            if key.code == KeyCode::Char('q') || key.code == KeyCode::Char('Q') {
                                break;
                            }
                        }
                    }
                    Some(Err(e)) => eprintln!("\rError reading event: {}", e),
                    None => break,
                    _ => {}
                }
            }
        }
    }

    disable_raw_mode()?;
    println!("\rDashboard closed. Returning to terminal.");
    Ok(())
}

fn print_dashboard_footer() {
    let yellow = "\x1b[1;33m";
    let magenta = "\x1b[1;35m";
    let cyan = "\x1b[1;36m";
    let reset = "\x1b[0m";
    let bold = "\x1b[1m";

    println!("{bold}{magenta}======================================{reset}");
    println!("{bold}{cyan}💡 INFO:{reset} Use {bold}[Q]{reset} to close this view | {bold}[Ctrl+C]{reset} to kill collector");
    println!("{bold}{yellow}🔄 Auto-refreshing every 5 seconds...{reset}");
    println!("{bold}{magenta}======================================{reset}");
}

fn print_cyber_dashboard(config: &AppConfig) {
    let cyan = "\x1b[1;36m";
    let green = "\x1b[1;32m";
    let yellow = "\x1b[1;33m";
    let magenta = "\x1b[1;35m";
    let reset = "\x1b[0m";
    let bold = "\x1b[1m";

    println!("\r{bold}{cyan}🚀 [ KINETIX-ZERO COLLECTOR CORE ] 🚀{reset}");
    println!("{bold}{magenta}======================================{reset}");
    
    let ddos_status = if config.storage_policy.save_logs.ddos_evidence {
        format!("{}ACTIVE ✅{}", green, reset)
    } else {
        format!("\x1b[1;31mDISABLED ❌{}", reset)
    };
    println!("{bold}[🚨] DDOS EVIDENCE >> {}{reset}", ddos_status);
    println!("  {cyan}├─ [🔬]{reset} Sample Rate: {yellow}{}{reset}", config.forensic_sample_rate);
    println!("  {cyan}└─ [🎭]{reset} Sample Mode: {yellow}{}{reset}", config.forensic_sample_mode);
    
    println!("{bold}{magenta}--------------------------------------{reset}");
    println!("{bold}[📡] NETWORK LIMITS{reset}");
    println!("  {cyan}>>{reset} Idle Timeout:    {yellow}{}s{reset}", config.collector.idle_timeout_sec);
    println!("  {cyan}>>{reset} Pending Timeout: {yellow}{}s{reset}", config.collector.pending_timeout_sec);
    println!("  {cyan}>>{reset} Online Timeout:  {yellow}{}s{reset}", config.collector.online_timeout_sec);
    println!("  {cyan}>>{reset} Max PPS Total:   {yellow}{}{reset}", config.collector.max_packet_per_second);
    println!("  {cyan}>>{reset} Agent Max PPS:   {yellow}{}{reset}", config.collector.max_packet_per_second_per_agent);
    println!("  {cyan}>>{reset} Max Pending:     {yellow}{}{reset}", config.collector.max_pending_agents);
    println!("  {cyan}>>{reset} Max Online:      {yellow}{}{reset}", config.collector.max_online_agents);
    
    println!("{bold}{magenta}--------------------------------------{reset}");
    println!("{bold}[🛡️] RUDP CONFIG{reset}");
    println!("  {cyan}>>{reset} Window Size:     {yellow}{}{reset}", config.rudp.window_size);
    println!("  {cyan}>>{reset} MTU:             {yellow}{}{reset}", config.rudp.mtu);
    println!("  {cyan}>>{reset} Retries:         {yellow}{}{reset}", config.rudp.retries);
    println!("  {cyan}>>{reset} Retransmit:      {yellow}{}ms{reset}", config.rudp.retransmit_ms);
    
    println!("{bold}{magenta}--------------------------------------{reset}");
    println!("{bold}[🍃] DATABASE URI{reset}");
    
    let uri = &config.mongo_uri;
    let max_line_len = 34;
    if uri.len() <= max_line_len {
        println!("  {cyan}>>{reset} {green}{}{reset}", uri);
    } else {
        let mut start = 0;
        while start < uri.len() {
            let end = std::cmp::min(start + max_line_len, uri.len());
            println!("  {cyan}>>{reset} {green}{}{reset}", &uri[start..end]);
            start = end;
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let show_conf = args.iter().any(|arg| arg == "-conf");

    if !show_conf {
        println!("Kinetix Turbo Collector starting...");
    }

    let config_path = find_config_file()?;
    
    println!("Loading config from: {:?}", config_path);
    let mut initial_config = load_config(&config_path)?;
    
    // Auth Bootstrap
    let mut secrets = None;
    if !show_conf {
        let sec = bootstrap_secrets(&config_path, &mut initial_config)?;
        secrets = Some(sec);
        println!("Authentication secrets verified.");
    }

    let shared_config = Arc::new(RwLock::new(initial_config));
    let shared_secrets = Arc::new(secrets);
    
    // Start RUDP Service in background
    let rudp_shared = Arc::clone(&shared_config);
    let secrets_shared = Arc::clone(&shared_secrets);
    tokio::spawn(async move {
        if let Err(e) = run_rudp_service(rudp_shared, secrets_shared).await {
            eprintln!("RUDP Service error: {}", e);
        }
    });

    if show_conf {
        run_interactive_dashboard(shared_config).await?;
        return Ok(());
    }

    let mut interval = interval(Duration::from_secs(5));
    loop {
        interval.tick().await;
        
        match load_config(&config_path) {
            Ok(new_config) => {
                {
                    let mut w = shared_config.write().await;
                    *w = new_config;
                }
                println!("\n--- Config Refreshed (Global State Updated) ---");
                let reader = shared_config.read().await;
                println!("Forensic Sample Rate: {}", reader.forensic_sample_rate);
            }
            Err(e) => {
                eprintln!("Error refreshing config: {}", e);
            }
        }
    }
}
