use std::net::{SocketAddr, IpAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::sync::RwLock;
use tokio::time::interval;
use zeroize::{Zeroize, ZeroizeOnDrop};
use dashmap::DashMap;
use anyhow::{Result};
use x25519_dalek::{EphemeralSecret, PublicKey};
use rand::rngs::OsRng;
use chacha20poly1305::{aead::{Aead, KeyInit, Payload}, ChaCha20Poly1305, Nonce};
use sha2::{Sha256, Digest};

use crate::Secrets;

// Protocol Constants
pub const FLAGS_INIT: u8 = 0x01;
pub const FLAGS_RESP: u8 = 0x02;
pub const FLAGS_AUTH_REQ: u8 = 0x03;
pub const FLAGS_AUTH_RESP: u8 = 0x04;
pub const FLAGS_DATA: u8 = 0x05;
pub const FLAGS_ACK: u8 = 0x08;

#[allow(dead_code)]
const S_UDP_WINDOW: u32 = 10;
const S_UDP_MTU: usize = 1400;
const S_UDP_RETRIES: u32 = 10;
const S_UDP_RETRANSMIT_MS: u64 = 300; // Default fail-safe
const S_UDP_RTO_MIN: u64 = 50;
const S_UDP_RTO_MAX: u64 = 2000;
const S_UDP_RTO_DEFAULT: u64 = 500;
const S_UDP_REPUTATION_TTL: u64 = 600; // 10 Minutes Persistence
const S_UDP_PENDING_TIMEOUT: u64 = 2;
const S_UDP_SESSION_TIMEOUT: u64 = 600; // 10 Minutes
const S_UDP_WINDOW_SIZE: u32 = 20;
const S_UDP_WINDOW_RETRIES: u32 = 5;

// Security Constants
const S_UDP_FLAG_MIN: u8 = 0x01;
const S_UDP_FLAG_MAX: u8 = 0x08;
const S_UDP_MAX_HANDSHAKES_PER_MIN: u32 = 3;
const S_UDP_INITIAL_BLOCK_MINS: u32 = 3;
const S_UDP_MAX_BLOCK_MINS: u32 = 1440; // 24 Hours

#[derive(Clone)]
struct IPReputation {
    offenses: u32,
    blocked_until: Option<Instant>,
    handshake_count: u32,
    window_start: Instant,
    last_window_sent_at: Option<Instant>,
    srtt: Option<Duration>,
    rttvar: Duration,
    current_rto: Duration,
}

#[derive(Clone)]
#[derive(Zeroize, ZeroizeOnDrop)]
struct SUDPSecurity {
    masked_blob: Vec<u8>,
    random_mask: Vec<u8>,
}

impl SUDPSecurity {
    pub fn new(mut raw_token: Vec<u8>) -> Self {
        let mut random_mask = Vec::with_capacity(raw_token.len());
        for _ in 0..raw_token.len() {
            random_mask.push(rand::random::<u8>());
        }

        let mut masked_blob = Vec::with_capacity(raw_token.len());
        for i in 0..raw_token.len() {
            masked_blob.push(raw_token[i] ^ random_mask[i]);
        }

        // 🛡️ Physical Memory Purge
        raw_token.zeroize();

        Self {
            masked_blob,
            random_mask,
        }
    }

    pub fn verify(&self, incoming: &[u8]) -> bool {
        if incoming.len() != self.masked_blob.len() {
            return false;
        }

        // Ghost Comparison: (Incoming ^ Mask) == Masked_Blob
        for i in 0..incoming.len() {
            if (incoming[i] ^ self.random_mask[i]) != self.masked_blob[i] {
                return false;
            }
        }
        true
    }

    /// Transiently reveal the token for client-side transmission
    pub fn reveal(&self) -> Vec<u8> {
        let mut clear = Vec::with_capacity(self.masked_blob.len());
        for i in 0..self.masked_blob.len() {
            clear.push(self.masked_blob[i] ^ self.random_mask[i]);
        }
        clear
    }
}

struct SUDPIdentity {
    agent: SUDPSecurity,
    server: SUDPSecurity,
}

impl SUDPIdentity {
    pub fn verify_agent(&self, incoming: &[u8]) -> bool {
        self.agent.verify(incoming)
    }

    pub fn reveal_server_proof(&self) -> Vec<u8> {
        self.server.reveal()
    }
}

struct PendingPacket {
    data: Vec<u8>,
    sent_at: Instant,
    retries: u32,
    last_gasp_tried: bool,
}

struct OutgoingHandshake {
    token: SUDPSecurity,
    ephemeral_secret: EphemeralSecret,
    created_at: Instant,
}

struct PendingSession {
    shared_secret: Option<[u8; 32]>,
    created_at: Instant,
}

struct OnlineSession {
    shared_secret: [u8; 32],
    ip_port: String,
    socket: Arc<UdpSocket>,
    last_activity: Instant,
    window_start_seq: u32,
    next_send_seq: u32,
    last_recv_seq: u32,
    recv_window_buffer: Vec<u32>,
    expected_window_size: u8,
}

pub enum SUDPEvent {
    HandshakeStarted,
    Authenticated,
    Data(String, Vec<u8>),
}

#[derive(Clone)]
pub struct SUDPEngine {
    pending_peers: Arc<DashMap<SocketAddr, PendingSession>>,
    online_peers: Arc<DashMap<SocketAddr, OnlineSession>>,
    global_acks: Arc<DashMap<(SocketAddr, u32), PendingPacket>>,
    reputations: Arc<DashMap<IpAddr, IPReputation>>,
    secrets: Arc<Option<Secrets>>,
    identity: Arc<RwLock<Option<SUDPIdentity>>>,
    pending_outbound: Arc<DashMap<SocketAddr, OutgoingHandshake>>,
}

impl SUDPEngine {
    pub fn new(secrets: Secrets) -> Self {
        Self {
            pending_peers: Arc::new(DashMap::new()),
            online_peers: Arc::new(DashMap::new()),
            global_acks: Arc::new(DashMap::new()),
            reputations: Arc::new(DashMap::new()),
            secrets: Arc::new(Some(secrets)),
            identity: Arc::new(RwLock::new(None)),
            pending_outbound: Arc::new(DashMap::new()),
        }
    }
    
    pub async fn listen(&self, addr: &str, agen_token: String, serv_token: String) -> Result<()> {
        let socket = Arc::new(UdpSocket::bind(addr).await?);
        
        {
            let mut id = self.identity.write().await;
            *id = Some(SUDPIdentity {
                agent: SUDPSecurity::new(agen_token.into_bytes()),
                server: SUDPSecurity::new(serv_token.into_bytes()),
            });
        }

        self.start_background_tasks(Arc::clone(&socket)).await;

        println!(" [S-UDP] Standardized Listener Active on: {}", addr);

        let mut buf = [0u8; 2048];
        loop {
            let (len, peer_addr) = socket.recv_from(&mut buf).await?;
            if let Ok(Some(event)) = self.process_packet(&socket, peer_addr, &buf, len).await {
                match event {
                    SUDPEvent::Data(ip_port, data) => {
                        println!(" [S-UDP] Data Received from {}: {} bytes", ip_port, data.len());
                    }
                    SUDPEvent::Authenticated => {
                        println!(" [S-UDP] Session Established!");
                    }
                    _ => {}
                }
            }
        }
    }

    pub async fn connect(&self, addr: &str, src_port: u16, agen_token: String, serv_token: String) -> Result<()> {
        let local_addr = format!("0.0.0.0:{}", src_port);
        let socket = Arc::new(UdpSocket::bind(&local_addr).await?);
        let target_addr: SocketAddr = addr.parse()?;

        // Setup Identity to verify Server Proof during handshake
        {
            let mut id = self.identity.write().await;
            *id = Some(SUDPIdentity {
                agent: SUDPSecurity::new(agen_token.clone().into_bytes()),
                server: SUDPSecurity::new(serv_token.clone().into_bytes()),
            });
        }

        // 🛡️ Initiate Handshake (Flag 01)
        let my_secret = EphemeralSecret::random_from_rng(OsRng);
        let my_public = PublicKey::from(&my_secret);
        let seq = rand::random::<u32>();
        
        let mut packet = Vec::with_capacity(37);
        packet.extend_from_slice(&seq.to_be_bytes());
        packet.push(FLAGS_INIT);
        packet.extend_from_slice(my_public.as_bytes());

        let mut buf = [0u8; 2048];
        let mut dyn_rto = Duration::from_millis(S_UDP_RTO_DEFAULT);
        let mut srtt: Option<Duration> = None;
        let mut rttvar = Duration::from_millis(S_UDP_RTO_DEFAULT / 2);
        let mut stage1_success = false;
        let mut server_pub_bytes = [0u8; 32];

        // 🚀 Stage 1: Send 01, Wait 02 (with Adaptive RTO Retries)
        for _ in 0..3 {
            let try_start = Instant::now();
            socket.send_to(&packet, target_addr).await?;
            if let Ok(Ok((len, peer_addr))) = tokio::time::timeout(dyn_rto, socket.recv_from(&mut buf)).await {
                if peer_addr == target_addr && len >= 37 && buf[4] == FLAGS_RESP {
                    let recv_seq = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
                    if recv_seq == seq {
                        server_pub_bytes.copy_from_slice(&buf[5..37]);
                        stage1_success = true;

                        // 📈 RTO CALIBRATION (Stage 1 ping)
                        let sample = try_start.elapsed();
                        srtt = Some(sample);
                        rttvar = sample / 2;
                        dyn_rto = srtt.unwrap() + (rttvar * 4);
                        dyn_rto = dyn_rto.clamp(
                            Duration::from_millis(S_UDP_RTO_MIN),
                            Duration::from_millis(S_UDP_RTO_MAX)
                        );
                        break;
                    }
                }
            }
        }

        if !stage1_success {
            return Err(anyhow::anyhow!("Server is not responding in stage 1"));
        }

        // Shared secret derivation
        let server_public = PublicKey::from(server_pub_bytes);
        let shared = my_secret.diffie_hellman(&server_public);
        let shared_key = *shared.as_bytes();
        let key = self.derive_cipher_key(&shared_key);

        // Stage 2: Send 03, Wait 04
        let mut token_clear = agen_token.into_bytes();
        let plaintext = token_clear.clone();
        token_clear.zeroize();

        let mut ad_03 = [0u8; 5];
        ad_03[0..4].copy_from_slice(&seq.to_be_bytes());
        ad_03[4] = FLAGS_AUTH_REQ;
        let encrypted = self.encrypt_payload(&key, seq, &ad_03, &plaintext);
        
        let mut resp_03 = Vec::with_capacity(5 + encrypted.len());
        resp_03.extend_from_slice(&ad_03);
        resp_03.extend_from_slice(&encrypted);

        let mut stage2_success = false;
        let mut auth_ok = false;

        // 🚀 Stage 2: Send 03, Wait 04 (with Adaptive RTO Retries)
        for _ in 0..3 {
            let try_start = Instant::now();
            socket.send_to(&resp_03, target_addr).await?;
            if let Ok(Ok((len, peer_addr))) = tokio::time::timeout(dyn_rto, socket.recv_from(&mut buf)).await {
                if peer_addr == target_addr && len >= 5 && buf[4] == FLAGS_AUTH_RESP {
                    let recv_seq = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
                    if recv_seq == seq {
                        if let Some(decrypted) = self.decrypt_payload(&key, seq, &buf[0..5], &buf[5..len]) {
                            // Check server proof
                            let expected_proof = if let Some(id) = self.identity.read().await.as_ref() {
                                Some(id.reveal_server_proof())
                            } else { None };

                            if let Some(mut expected) = expected_proof {
                                if decrypted == expected { auth_ok = true; }
                                expected.zeroize();
                            } else {
                                if decrypted.len() >= 1 && decrypted[0] == 1 { auth_ok = true; }
                            }
                            stage2_success = true;

                            // 📈 RTO CALIBRATION (Stage 2 ping)
                            let raw_sample = try_start.elapsed();
                            // Subtract the Server's mandatory 50ms time-gate from the sample math
                            let sample = if raw_sample > Duration::from_millis(50) {
                                raw_sample - Duration::from_millis(50)
                            } else {
                                Duration::from_millis(1)
                            };

                            let current_srtt = srtt.unwrap();
                            let delta = if sample > current_srtt { sample - current_srtt } else { current_srtt - sample };
                            rttvar = (rttvar.mul_f32(0.75)) + (delta.mul_f32(0.25));
                            srtt = Some((current_srtt.mul_f32(0.875)) + (sample.mul_f32(0.125)));
                            dyn_rto = srtt.unwrap() + (rttvar * 4);
                            dyn_rto = dyn_rto.clamp(
                                Duration::from_millis(S_UDP_RTO_MIN),
                                Duration::from_millis(S_UDP_RTO_MAX)
                            );
                            
                            break;
                        }
                    }
                }
            }
        }

        if !stage2_success {
            return Err(anyhow::anyhow!("Server is not responding in stage 2"));
        }

        if !auth_ok {
            return Err(anyhow::anyhow!("Invalid server proof during stage 2"));
        }

        // Cache established RTO for immediate fast pipeline data bursts!
        self.reputations.insert(target_addr.ip(), IPReputation {
            offenses: 0,
            blocked_until: None,
            handshake_count: 1,
            window_start: Instant::now(),
            last_window_sent_at: None,
            srtt,
            rttvar,
            current_rto: dyn_rto,
        });

        // Successfully Authenticated! Add to online peers
        self.online_peers.insert(target_addr, OnlineSession {
            shared_secret: shared_key,
            ip_port: target_addr.to_string(),
            socket: Arc::clone(&socket),
            last_activity: Instant::now(),
            window_start_seq: 1,
            next_send_seq: 1,
            last_recv_seq: seq,
            recv_window_buffer: Vec::new(),
            expected_window_size: S_UDP_WINDOW_SIZE as u8,
        });

        println!(" [S-UDP] Connection Established with: {}", target_addr);

        // 🚀 Start background tasks ONLY AFTER handshake finishes safely
        self.start_background_tasks(Arc::clone(&socket)).await;

        let engine = self.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 2048];
            while let Ok((len, peer_addr)) = socket.recv_from(&mut buf).await {
                let _ = engine.process_packet(&socket, peer_addr, &buf, len).await;
            }
        });

        Ok(())
    }



    pub async fn process_packet(&self, socket: &Arc<UdpSocket>, addr: SocketAddr, buf: &[u8], len: usize) -> Result<Option<SUDPEvent>> {
        if len < 5 { return Ok(None); }
        
        let seq = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
        let flags = buf[4];

        // 🛡️ Security Filter 1: Flag Range Validation
        if !(S_UDP_FLAG_MIN..=S_UDP_FLAG_MAX).contains(&flags) {
            return Ok(None);
        }

        let ip = addr.ip();
        let now = Instant::now();

        // 🛡️ Security Filter 2: IP Reputation & Adaptive Blocking
        if let Some(mut rep) = self.reputations.get_mut(&ip) {
            // Check if currently blocked
            if let Some(blocked_until) = rep.blocked_until {
                if now < blocked_until {
                    return Ok(None);
                } else {
                    rep.blocked_until = None; // Block expired
                }
            }

            // Handshake Rate Limiting (Flags 01 & 03)
            if flags == FLAGS_INIT || flags == FLAGS_AUTH_REQ {
                if rep.window_start.elapsed().as_secs() >= 60 {
                    rep.window_start = now;
                    rep.handshake_count = 1;
                } else {
                    rep.handshake_count += 1;
                    if rep.handshake_count > S_UDP_MAX_HANDSHAKES_PER_MIN {
                        // 🚩 VIOLATION DETECTED
                        let penalty_mins = (S_UDP_INITIAL_BLOCK_MINS * 2u32.pow(rep.offenses))
                            .min(S_UDP_MAX_BLOCK_MINS);
                        
                        rep.blocked_until = Some(now + Duration::from_secs(penalty_mins as u64 * 60));
                        rep.offenses += 1;
                        return Ok(None);
                    }
                }
            }
        } else if flags == FLAGS_INIT || flags == FLAGS_AUTH_REQ {
            // New IP sending handshake
            self.reputations.insert(ip, IPReputation {
                offenses: 0,
                blocked_until: None,
                handshake_count: 1,
                window_start: now,
                last_window_sent_at: None,
                srtt: None,
                rttvar: Duration::from_millis(S_UDP_RTO_DEFAULT / 2),
                current_rto: Duration::from_millis(S_UDP_RTO_DEFAULT),
            });
        }
        
        // Ensure peer exists (Standard S-UDP Logic)
        if !self.pending_peers.contains_key(&addr) && !self.online_peers.contains_key(&addr) {
            if flags != FLAGS_INIT { return Ok(None); } // Ignore non-init for new peers
            self.pending_peers.insert(addr, PendingSession {
                shared_secret: None,
                created_at: Instant::now(),
            });
        }

        match flags {
            FLAGS_INIT => {
                if len >= 37 {
                    let agent_pub_bytes: [u8; 32] = buf[5..37].try_into().unwrap_or([0u8; 32]);
                    let agent_public = PublicKey::from(agent_pub_bytes);
                    let collector_secret = EphemeralSecret::random_from_rng(OsRng);
                    let collector_public = PublicKey::from(&collector_secret);
                    let shared = collector_secret.diffie_hellman(&agent_public);
                    
                    if let Some(mut p) = self.pending_peers.get_mut(&addr) {
                        p.shared_secret = Some(*shared.as_bytes());
                    }

                    let mut resp = Vec::with_capacity(37);
                    resp.extend_from_slice(&seq.to_be_bytes());
                    resp.push(FLAGS_RESP);
                    resp.extend_from_slice(collector_public.as_bytes());
                    let _ = socket.send_to(&resp, addr).await;
                    return Ok(Some(SUDPEvent::HandshakeStarted));
                }
            }
            FLAGS_AUTH_REQ => {
                let handshake_start = Instant::now();
                if self.online_peers.contains_key(&addr) {
                    let mut resp = Vec::with_capacity(21);
                    resp.extend_from_slice(&seq.to_be_bytes());
                    resp.push(FLAGS_AUTH_RESP);
                    if let Some(peer) = self.online_peers.get_mut(&addr) {
                        let key = self.derive_cipher_key(&peer.shared_secret);
                        let encrypted = self.encrypt_payload(&key, seq, &buf[0..5], &[0u8; 1]);
                        resp.extend_from_slice(&encrypted);
                    }
                    let _ = socket.send_to(&resp, addr).await;
                    return Ok(None);
                }

                if len >= 21 {
                    if let Some(p) = self.pending_peers.get_mut(&addr) {
                        if let Some(shared) = p.shared_secret {
                            let key = self.derive_cipher_key(&shared);
                            if let Some(decrypted) = self.decrypt_payload(&key, seq, &buf[0..5], &buf[5..len]) {
                                if !decrypted.is_empty() {
                                    let agent_token = String::from_utf8_lossy(&decrypted).to_string();
                                    let agent_token = agent_token.trim_matches(char::from(0)).to_string(); // Clean null padding

                                    let mut auth_ok = false;
                                    if let Some(ref id) = *self.identity.read().await {
                                        if id.verify_agent(agent_token.as_bytes()) { auth_ok = true; }
                                    }

                                    drop(p);
                                    if let Some((_, p_data)) = self.pending_peers.remove(&addr) {
                                        let peer_id = addr.to_string();
                                        if auth_ok {
                                            self.online_peers.insert(addr, OnlineSession {
                                                shared_secret: p_data.shared_secret.unwrap(),
                                                ip_port: peer_id.clone(),
                                                socket: Arc::clone(socket),
                                                last_activity: Instant::now(),
                                                window_start_seq: 1,
                                                next_send_seq: 1,
                                                last_recv_seq: seq,
                                                recv_window_buffer: Vec::with_capacity(S_UDP_WINDOW_SIZE as usize),
                                                expected_window_size: S_UDP_WINDOW_SIZE as u8,
                                            });
                                        } else {
                                            let ip_addr = addr.ip();
                                            if let Some(mut rep) = self.reputations.get_mut(&ip_addr) {
                                                let penalty_mins = (S_UDP_INITIAL_BLOCK_MINS * 2u32.pow(rep.offenses))
                                                    .min(S_UDP_MAX_BLOCK_MINS);
                                                rep.blocked_until = Some(Instant::now() + Duration::from_secs(penalty_mins as u64 * 60));
                                                rep.offenses += 1;
                                            }
                                        }
                                        
                                        // 🚀 ASYNC FLAG 04: Unified 50ms Gated Handshake
                                        let engine = self.clone();
                                        let socket = Arc::clone(socket);
                                        let addr_c = addr;
                                        let seq_c = seq;
                                        let key_c = key;

                                        tokio::spawn(async move {
                                            // 1. Determine payload
                                            let mut payload_data = if auth_ok {
                                                if let Some(id) = engine.identity.read().await.as_ref() {
                                                    id.reveal_server_proof()
                                                } else {
                                                    return;
                                                }
                                            } else {
                                                b"invalid_token".to_vec()
                                            };

                                            // 2. 50ms Time-Gate (Relative to handshake start)
                                            let elapsed = handshake_start.elapsed();
                                            if elapsed < Duration::from_millis(50) {
                                                tokio::time::sleep(Duration::from_millis(50) - elapsed).await;
                                            }

                                            // 3. Encrypt and Send
                                            let mut resp = Vec::with_capacity(5 + payload_data.len() + 16);
                                            resp.extend_from_slice(&seq_c.to_be_bytes());
                                            resp.push(FLAGS_AUTH_RESP);

                                            let mut ad = [0u8; 5];
                                            ad[0..4].copy_from_slice(&seq_c.to_be_bytes());
                                            ad[4] = FLAGS_AUTH_RESP;

                                            let encrypted = engine.encrypt_payload(&key_c, seq_c, &ad, &payload_data);
                                            resp.extend_from_slice(&encrypted);

                                            let _ = socket.send_to(&resp, addr_c).await;

                                            // 4. Ghost Zeroize
                                            payload_data.zeroize();
                                        });

                                        if auth_ok {
                                            return Ok(Some(SUDPEvent::Authenticated));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            FLAGS_DATA => {
                if let Some(mut peer) = self.online_peers.get_mut(&addr) {
                    peer.last_activity = Instant::now();
                    let key = self.derive_cipher_key(&peer.shared_secret);
                    let ip_port = peer.ip_port.clone();
                    if let Some(decrypted_payload) = self.decrypt_payload(&key, seq, &buf[0..5], &buf[5..len]) {
                        if decrypted_payload.len() < 2 { return Ok(None); }
                        
                        let _index = decrypted_payload[0];
                        let total = decrypted_payload[1];
                        let actual_data = &decrypted_payload[2..];

                        // 🛰️ DYNAMIC ACK TRIGGER: 
                        // Track last received seq and buffer for the 08 ACK
                        peer.last_recv_seq = seq;
                        peer.recv_window_buffer.push(seq);
                        peer.expected_window_size = total;

                        if peer.recv_window_buffer.len() >= total as usize {
                            // GENERATE AND SEND ENCRYPTED WINDOWED ACK (08)
                            let mut ack_payload = Vec::with_capacity(peer.recv_window_buffer.len() * 4);
                            for s in &peer.recv_window_buffer {
                                ack_payload.extend_from_slice(&s.to_be_bytes());
                            }
                            
                            let mut resp = Vec::with_capacity(5 + ack_payload.len() + 16);
                            let ack_seq = seq; // Use current seq as anchor for ACK
                            let mut ad = [0u8; 5];
                            ad[0..4].copy_from_slice(&ack_seq.to_be_bytes());
                            ad[4] = FLAGS_ACK;
                            
                            let encrypted = self.encrypt_payload(&key, ack_seq, &ad, &ack_payload);
                            resp.extend_from_slice(&ad);
                            resp.extend_from_slice(&encrypted);
                            let _ = socket.send_to(&resp, addr).await;
                            
                            peer.recv_window_buffer.clear();
                        }

                        return Ok(Some(SUDPEvent::Data(ip_port, actual_data.to_vec())));
                    }
                }
            }
            FLAGS_ACK => {
                // S-UDP Windowed ACK (Flag 08): Contains N encrypted sequence numbers
                if let Some(mut peer) = self.online_peers.get_mut(&addr) {
                    let key = self.derive_cipher_key(&peer.shared_secret);
                    if let Some(payload) = self.decrypt_payload(&key, seq, &buf[0..5], &buf[5..len]) {
                        if payload.len() >= 4 && payload.len() % 4 == 0 {
                            let mut confirmed = std::collections::HashSet::new();
                            let ip = addr.ip();
                            let now = Instant::now();

                            let num_confirmed = payload.len() / 4;
                            for i in 0..num_confirmed {
                                let start = i * 4;
                                let confirmed_seq = u32::from_be_bytes([
                                    payload[start], payload[start+1], payload[start+2], payload[start+3]
                                ]);
                                confirmed.insert(confirmed_seq);
                                self.global_acks.remove(&(addr, confirmed_seq));
                            }

                            // 📈 RTO CALIBRATION & SMOOTHING
                            if let Some(mut rep) = self.reputations.get_mut(&ip) {
                                if let Some(last_sent) = rep.last_window_sent_at {
                                    let sample = now.duration_since(last_sent);
                                    
                                    if let Some(srtt) = rep.srtt {
                                        // Continuous Smoothing (Alpha=1/8, Beta=1/4)
                                        let delta = if sample > srtt { sample - srtt } else { srtt - sample };
                                        rep.rttvar = (rep.rttvar.mul_f32(0.75)) + (delta.mul_f32(0.25));
                                        rep.srtt = Some((srtt.mul_f32(0.875)) + (sample.mul_f32(0.125)));
                                    } else {
                                        // First Window Bootstrap
                                        rep.srtt = Some(sample);
                                        rep.rttvar = sample / 2;
                                    }
                                    
                                    // RTO = SRTT + 4 * RTTVAR
                                    let new_rto = rep.srtt.unwrap() + (rep.rttvar * 4);
                                    rep.current_rto = new_rto.clamp(
                                        Duration::from_millis(S_UDP_RTO_MIN),
                                        Duration::from_millis(S_UDP_RTO_MAX)
                                    );
                                    rep.last_window_sent_at = None; // Reset for next window
                                }
                            }

                            // 🏎️ FAST SELECTIVE RETRANSMIT: 
                            // Audit our current window for gaps and resend them instantly!
                            let w_start = peer.window_start_seq;
                            for s in w_start..(w_start + S_UDP_WINDOW_SIZE) {
                                if !confirmed.contains(&s) {
                                    if let Some(mut pending) = self.global_acks.get_mut(&(addr, s)) {
                                        // Still in global_acks means it was sent but not confirmed in this 08
                                        pending.retries += 1;
                                        pending.sent_at = Instant::now();
                                        let _ = socket.send_to(&pending.data, addr).await;
                                    }
                                }
                            }

                            // Advance window if the lowest seq is confirmed
                            while !self.global_acks.contains_key(&(addr, peer.window_start_seq)) && 
                                  peer.window_start_seq <= confirmed.iter().max().cloned().unwrap_or(0) {
                                peer.window_start_seq += 1;
                            }
                        }
                    }
                }
            }

            _ => {}
        }
        Ok(None)
    }

    pub async fn start_background_tasks(&self, socket: Arc<UdpSocket>) {
        let pc_gc = Arc::clone(&self.pending_peers);
        let oc_gc = Arc::clone(&self.online_peers);
        let ac_gc = Arc::clone(&self.global_acks);
        let rc_gc = Arc::clone(&self.reputations);
        
        // GC Task (Standardized Timeouts & Security)
        let pc_gc_c = Arc::clone(&pc_gc);
        let oc_gc_c = Arc::clone(&oc_gc);
        let ac_gc_c = Arc::clone(&ac_gc);
        let _rc_gc = Arc::clone(&rc_gc);
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(1));
            let _ = _rc_gc;
            loop {
                interval.tick().await;
                let now = Instant::now();
                pc_gc_c.retain(|_, p| p.created_at.elapsed().as_secs() < S_UDP_PENDING_TIMEOUT);
                let mut dead_peers = Vec::new();
                oc_gc_c.retain(|addr, o| {
                    if o.last_activity.elapsed().as_secs() < S_UDP_SESSION_TIMEOUT {
                        true
                    } else {
                        dead_peers.push(*addr);
                        false
                    }
                });

                // 🧹 DEEP CLEAN: Wipe all pending packets for dead sessions
                for addr in dead_peers {
                    ac_gc_c.retain(|(peer_addr, _), _| *peer_addr != addr);
                }
                
                // Cleanup Reputation: Only keep blocked IPs or those in an active handshake window
                rc_gc.retain(|_, r| {
                    if let Some(blocked_until) = r.blocked_until {
                        if now < blocked_until { return true; }
                    }
                    r.window_start.elapsed().as_secs() < S_UDP_REPUTATION_TTL
                });
            }
        });

        // Retransmission Task (Windowed)
        let ac_re = Arc::clone(&self.global_acks);
        let oc_re = Arc::clone(&self.online_peers);
        let rc_re = Arc::clone(&self.reputations);
        let socket_re = Arc::clone(&socket);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(S_UDP_RETRANSMIT_MS)).await;
                
                let windows_to_clear_acks = Vec::new();
                
                // Group pending packets by address to check windows
                let mut addr_windows: std::collections::HashMap<SocketAddr, Vec<(u32, Instant, u32)>> = std::collections::HashMap::new();
                for entry in ac_re.iter() {
                    let ((addr, seq), pending) = entry.pair();
                    addr_windows.entry(*addr).or_default().push((*seq, pending.sent_at, pending.retries));
                }

                for (addr, packets) in addr_windows {
                    // Check if there is an adaptive RTO for this IP
                    let ip = addr.ip();
                    let rto = if let Some(rep) = rc_re.get(&ip) {
                        rep.current_rto
                    } else {
                        Duration::from_millis(S_UDP_RTO_DEFAULT)
                    };

                    // Check for "Last Gasp" Trigger (8 minutes of silence)
                    let mut trigger_gasp = false;
                    if let Some(peer) = oc_re.get(&addr) {
                        if peer.last_activity.elapsed().as_secs() >= 480 {
                            trigger_gasp = true;
                        }
                    }

                    // If any packet in the window is older than its current RTO, we re-handle the whole window
                    if let Some(oldest) = packets.iter().min_by_key(|p| p.1) {
                        if oldest.1.elapsed() >= rto {
                            let retry_count = oldest.2;
                            
                            if retry_count < S_UDP_WINDOW_RETRIES {
                                // 🚤 NORMAL BURST: RESEND ALL PACKETS IN THIS WINDOW
                                for mut entry in ac_re.iter_mut() {
                                    let ((a, _), mut pending) = entry.pair_mut();
                                    if *a == addr && pending.retries < S_UDP_WINDOW_RETRIES {
                                        pending.retries += 1;
                                        pending.sent_at = Instant::now();
                                        let _ = socket_re.send_to(&pending.data, addr).await;
                                    }
                                }
                            } else if retry_count < 100 {
                                // 🛑 STAGE 1: PARKED (After 5 failures)
                                for mut entry in ac_re.iter_mut() {
                                    let ((a, _), mut pending) = entry.pair_mut();
                                    if *a == addr && pending.retries == S_UDP_WINDOW_RETRIES {
                                        pending.retries = 100; // Mark as parked
                                    }
                                }
                            } else if retry_count == 100 && trigger_gasp {
                                // ⚡ STAGE 2: THE LAST GASP (At 8 minutes)
                                for mut entry in ac_re.iter_mut() {
                                    let ((a, _), mut pending) = entry.pair_mut();
                                    if *a == addr && pending.retries == 100 && !pending.last_gasp_tried {
                                        pending.retries = 0; // Reset for final 5 tries
                                        pending.last_gasp_tried = true;
                                        pending.sent_at = Instant::now();
                                        let _ = socket_re.send_to(&pending.data, addr).await;
                                    }
                                }
                            } else if retry_count == S_UDP_WINDOW_RETRIES && trigger_gasp {
                                // STAGE 3: FINAL FAILURE (Wait for 10m hard GC)
                            }
                        }
                    }
                }

                for addr in windows_to_clear_acks {
                    // Clear their pending ACKs but DO NOT remove session
                    let keys_to_remove: Vec<(SocketAddr, u32)> = ac_re.iter()
                        .filter(|e| e.key().0 == addr)
                        .map(|e| *e.key())
                        .collect();
                    for k in keys_to_remove { ac_re.remove(&k); }
                }
            }
        });
    }

    fn derive_cipher_key(&self, shared_secret: &[u8; 32]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(shared_secret);
        hasher.finalize().into()
    }

    fn encrypt_payload(&self, key: &[u8; 32], seq: u32, ad: &[u8], plaintext: &[u8]) -> Vec<u8> {
        let cipher = ChaCha20Poly1305::new(key.into());
        let mut nonce_bytes = [0u8; 12];
        nonce_bytes[0..4].copy_from_slice(&seq.to_be_bytes());
        let nonce = Nonce::from_slice(&nonce_bytes);
        let payload = Payload { msg: plaintext, aad: ad };
        cipher.encrypt(nonce, payload).unwrap_or_default()
    }

    fn decrypt_payload(&self, key: &[u8; 32], seq: u32, ad: &[u8], ciphertext: &[u8]) -> Option<Vec<u8>> {
        let cipher = ChaCha20Poly1305::new(key.into());
        let mut nonce_bytes = [0u8; 12];
        nonce_bytes[0..4].copy_from_slice(&seq.to_be_bytes());
        let nonce = Nonce::from_slice(&nonce_bytes);
        let payload = Payload { msg: ciphertext, aad: ad };
        cipher.decrypt(nonce, payload).ok()
    }

    pub async fn send_data(&self, addr: SocketAddr, data: &[u8]) -> Result<()> {
        if let Some(mut peer) = self.online_peers.get_mut(&addr) {
            let total_chunks = (data.len() + (S_UDP_MTU - 2) - 1) / (S_UDP_MTU - 2); // -2 for index/total metadata
            
            for i in 0..total_chunks {
                let start = i * (S_UDP_MTU - 2);
                let end = (start + (S_UDP_MTU - 2)).min(data.len());
                let chunk_data = &data[start..end];

                let seq = peer.next_send_seq;
                peer.next_send_seq += 1;
                
                let key = self.derive_cipher_key(&peer.shared_secret);
                let mut ad = [0u8; 5];
                ad[0..4].copy_from_slice(&seq.to_be_bytes());
                ad[4] = FLAGS_DATA;

                // 📦 Dynamic Metadata: index and total_packets
                let mut plaintext = Vec::with_capacity(2 + chunk_data.len());
                plaintext.push(i as u8);
                plaintext.push(total_chunks as u8);
                plaintext.extend_from_slice(chunk_data);
                
                let encrypted = self.encrypt_payload(&key, seq, &ad, &plaintext);
                let mut packet = Vec::with_capacity(5 + encrypted.len());
                packet.extend_from_slice(&ad);
                packet.extend_from_slice(&encrypted);

                // Record timestamp if it's the last packet of this specific burst (Calibration stopwatch)
                if i == total_chunks - 1 {
                    if let Some(mut rep) = self.reputations.get_mut(&addr.ip()) {
                        rep.last_window_sent_at = Some(Instant::now());
                    }
                }

                self.global_acks.insert((addr, seq), PendingPacket {
                    data: packet.clone(),
                    sent_at: Instant::now(),
                    retries: 0,
                    last_gasp_tried: false,
                });

                peer.socket.send_to(&packet, addr).await?;
            }
        }
        Ok(())
    }
}
