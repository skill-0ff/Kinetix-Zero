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
const S_UDP_WINDOW_SIZE: u32 = 32;
const S_UDP_WINDOW_RETRIES: u32 = 5;

// Direction Bit: Separates client/server nonce spaces
const S_UDP_DIR_BIT: u64 = 1u64 << 63;
const S_UDP_SEQ_MASK: u64 = !(1u64 << 63);

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
    is_server: bool,
    recovery_started_at: Option<Instant>,
    window_start_seq: u64,
    next_send_seq: u64,
    last_recv_seq: u64,
    recv_window_buffer: Vec<u64>,
    expected_window_size: u8,
    last_acked_window: u64,
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
    global_acks: Arc<DashMap<(SocketAddr, u64), PendingPacket>>,
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
        let seq = rand::random::<u64>() & S_UDP_SEQ_MASK; // Client: bit 63 always 0
        
        let mut packet = Vec::with_capacity(41);
        packet.push(FLAGS_INIT);
        packet.extend_from_slice(&seq.to_be_bytes());
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
                if peer_addr == target_addr && len >= 41 && buf[0] == FLAGS_RESP {
                    let recv_seq = u64::from_be_bytes(buf[1..9].try_into().unwrap_or([0u8; 8]));
                    if (recv_seq & S_UDP_SEQ_MASK) == seq { // Strip server's direction bit
                        server_pub_bytes.copy_from_slice(&buf[9..41]);
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

        let mut ad_03 = [0u8; 9];
        ad_03[0] = FLAGS_AUTH_REQ;
        ad_03[1..9].copy_from_slice(&seq.to_be_bytes());
        let encrypted = self.encrypt_payload(&key, seq, &ad_03, &plaintext);
        
        let mut resp_03 = Vec::with_capacity(9 + encrypted.len());
        resp_03.extend_from_slice(&ad_03);
        resp_03.extend_from_slice(&encrypted);

        let mut stage2_success = false;
        let mut auth_ok = false;

        // 🚀 Stage 2: Send 03, Wait 04 (with Adaptive RTO Retries)
        for _ in 0..3 {
            let try_start = Instant::now();
            socket.send_to(&resp_03, target_addr).await?;
            if let Ok(Ok((len, peer_addr))) = tokio::time::timeout(dyn_rto, socket.recv_from(&mut buf)).await {
                if peer_addr == target_addr && len >= 9 && buf[0] == FLAGS_AUTH_RESP {
                    let recv_seq = u64::from_be_bytes(buf[1..9].try_into().unwrap_or([0u8; 8]));
                    if (recv_seq & S_UDP_SEQ_MASK) == seq { // Strip server's direction bit
                        if let Some(decrypted) = self.decrypt_payload(&key, recv_seq, &buf[0..9], &buf[9..len]) {
                            // Check server proof (decrypt with server's full seq including dir bit)
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
            is_server: false, // Client side
            recovery_started_at: None,
            window_start_seq: 1,
            next_send_seq: 2,
            last_recv_seq: seq,
            recv_window_buffer: Vec::new(),
            expected_window_size: S_UDP_WINDOW_SIZE as u8,
            last_acked_window: 2,
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
        if len < 9 { return Ok(None); }
        
        let flags = buf[0];
        let seq = u64::from_be_bytes(buf[1..9].try_into().unwrap_or([0u8; 8]));

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
                if len >= 41 {
                    let agent_pub_bytes: [u8; 32] = buf[9..41].try_into().unwrap_or([0u8; 32]);
                    let agent_public = PublicKey::from(agent_pub_bytes);
                    let collector_secret = EphemeralSecret::random_from_rng(OsRng);
                    let collector_public = PublicKey::from(&collector_secret);
                    let shared = collector_secret.diffie_hellman(&agent_public);
                    
                    if let Some(mut p) = self.pending_peers.get_mut(&addr) {
                        p.shared_secret = Some(*shared.as_bytes());
                    }

                    let server_seq = seq | S_UDP_DIR_BIT; // Server: bit 63 = 1
                    let mut resp = Vec::with_capacity(41);
                    resp.push(FLAGS_RESP);
                    resp.extend_from_slice(&server_seq.to_be_bytes());
                    resp.extend_from_slice(collector_public.as_bytes());
                    let _ = socket.send_to(&resp, addr).await;
                    return Ok(Some(SUDPEvent::HandshakeStarted));
                }
            }
            FLAGS_AUTH_REQ => {
                let handshake_start = Instant::now();
                if self.online_peers.contains_key(&addr) {
                    let server_seq = seq | S_UDP_DIR_BIT; // Server: bit 63 = 1
                    let mut resp = Vec::with_capacity(25);
                    resp.push(FLAGS_AUTH_RESP);
                    resp.extend_from_slice(&server_seq.to_be_bytes());
                    if let Some(peer) = self.online_peers.get_mut(&addr) {
                        let key = self.derive_cipher_key(&peer.shared_secret);
                        let mut ad_04 = [0u8; 9];
                        ad_04[0] = FLAGS_AUTH_RESP;
                        ad_04[1..9].copy_from_slice(&server_seq.to_be_bytes());
                        let encrypted = self.encrypt_payload(&key, server_seq, &ad_04, &[0u8; 1]);
                        resp.extend_from_slice(&encrypted);
                    }
                    let _ = socket.send_to(&resp, addr).await;
                    return Ok(None);
                }

                if len >= 25 {
                    if let Some(p) = self.pending_peers.get_mut(&addr) {
                        if let Some(shared) = p.shared_secret {
                            let key = self.derive_cipher_key(&shared);
                            if let Some(decrypted) = self.decrypt_payload(&key, seq, &buf[0..9], &buf[9..len]) {
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
                                                is_server: true, // Server side
                                                recovery_started_at: None,
                                                window_start_seq: 1,
                                                next_send_seq: 2,
                                                last_recv_seq: seq,
                                                recv_window_buffer: Vec::with_capacity(S_UDP_WINDOW_SIZE as usize),
                                                expected_window_size: S_UDP_WINDOW_SIZE as u8,
                                                last_acked_window: 2,
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
                                        let seq_c = seq | S_UDP_DIR_BIT; // Server: bit 63 = 1
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

                                            // 3. Encrypt and Send (with server direction bit)
                                            let mut resp = Vec::with_capacity(9 + payload_data.len() + 16);
                                            resp.push(FLAGS_AUTH_RESP);
                                            resp.extend_from_slice(&seq_c.to_be_bytes());

                                            let mut ad = [0u8; 9];
                                            ad[0] = FLAGS_AUTH_RESP;
                                            ad[1..9].copy_from_slice(&seq_c.to_be_bytes());

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
                    if let Some(decrypted_payload) = self.decrypt_payload(&key, seq, &buf[0..9], &buf[9..len]) {
                        let actual_data = &decrypted_payload;

                        // 🛰️ DYNAMIC ACK TRIGGER: 
                        // Track last received seq and buffer for the 08 ACK
                        peer.last_recv_seq = seq;
                        peer.recv_window_buffer.push(seq);
                        peer.expected_window_size = 1;

                        if peer.recv_window_buffer.len() >= 1 {
                            // GENERATE AND SEND ENCRYPTED WINDOWED ACK (08)
                            let mut ack_payload = Vec::with_capacity(peer.recv_window_buffer.len() * 8);
                            for s in &peer.recv_window_buffer {
                                ack_payload.extend_from_slice(&s.to_be_bytes());
                            }
                            
                            let mut resp = Vec::with_capacity(9 + ack_payload.len() + 16);
                            let ack_seq = seq; // Use current seq as anchor for ACK
                            let mut ad = [0u8; 9];
                            ad[0] = FLAGS_ACK;
                            ad[1..9].copy_from_slice(&ack_seq.to_be_bytes());
                            
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
                // S-UDP Windowed ACK (Flag 08)
                // ACK seq = (window_idx << 7) | (ack_gen << 2) | 0b01
                // Payload empty  = all packets received (full confirmation)
                // Payload present = list of LOST packet seqs (8 bytes each)
                if let Some(mut peer) = self.online_peers.get_mut(&addr) {
                    let key = self.derive_cipher_key(&peer.shared_secret);
                    if let Some(payload) = self.decrypt_payload(&key, seq, &buf[0..9], &buf[9..len]) {
                        let acked_window = (seq & S_UDP_SEQ_MASK) >> 7; // Strip direction bit
                        let ip = addr.ip();
                        let now = Instant::now();

                        // 🩹 ACK received — connection is alive, cancel recovery mode
                        peer.recovery_started_at = None;

                        if payload.is_empty() {
                            // ✅ FULL ACK: Every packet in this window was received
                            // Clear all global_acks entries belonging to this window
                            let keys_to_remove: Vec<(SocketAddr, u64)> = self.global_acks.iter()
                                .filter(|e| e.key().0 == addr && ((e.key().1 & S_UDP_SEQ_MASK) >> 7) == acked_window)
                                .map(|e| *e.key())
                                .collect();
                            for k in keys_to_remove {
                                self.global_acks.remove(&k);
                            }

                            // Advance last_acked_window (unblocks sender throttle)
                            if acked_window > peer.last_acked_window {
                                peer.last_acked_window = acked_window;
                            }
                        } else if payload.len() % 8 == 0 {
                            // ⚠️ PARTIAL ACK: Payload lists the LOST packet seqs
                            let mut lost_seqs = std::collections::HashSet::new();
                            for chunk in payload.chunks_exact(8) {
                                let lost_seq = u64::from_be_bytes(chunk.try_into().unwrap_or([0u8; 8]));
                                lost_seqs.insert(lost_seq);
                            }

                            // Collect all global_acks entries for this window
                            let window_entries: Vec<(SocketAddr, u64)> = self.global_acks.iter()
                                .filter(|e| e.key().0 == addr && ((e.key().1 & S_UDP_SEQ_MASK) >> 7) == acked_window)
                                .map(|e| *e.key())
                                .collect();

                            // Clear confirmed packets (in this window but NOT in lost list)
                            for k in &window_entries {
                                if !lost_seqs.contains(&k.1) {
                                    self.global_acks.remove(k);
                                }
                            }

                            // 🚤 Retransmit lost packets immediately
                            for lost_seq in &lost_seqs {
                                if let Some(mut pending) = self.global_acks.get_mut(&(addr, *lost_seq)) {
                                    pending.retries += 1;
                                    pending.sent_at = Instant::now();
                                    let _ = socket.send_to(&pending.data, addr).await;
                                }
                            }

                            // last_acked_window NOT advanced — window still incomplete
                        }

                        // 📈 RTO CALIBRATION (valid for both full and partial ACKs)
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
                
                // Group pending packets by (addr, window_idx) — scoped retransmit
                let mut window_groups: std::collections::HashMap<(SocketAddr, u64), Vec<(u64, Instant, u32, bool)>> = std::collections::HashMap::new();
                for entry in ac_re.iter() {
                    let ((addr, seq), pending) = entry.pair();
                    let window_idx = (*seq & S_UDP_SEQ_MASK) >> 7;
                    window_groups.entry((*addr, window_idx)).or_default()
                        .push((*seq, pending.sent_at, pending.retries, pending.last_gasp_tried));
                }

                // Check for 10-minute session kill (per peer)
                let mut dead_peers: Vec<SocketAddr> = Vec::new();
                for entry in oc_re.iter() {
                    if let Some(recovery_start) = entry.recovery_started_at {
                        if recovery_start.elapsed().as_secs() >= 600 {
                            dead_peers.push(*entry.key());
                        }
                    }
                }
                for addr in &dead_peers {
                    oc_re.remove(addr);
                    ac_re.retain(|(a, _), _| a != addr);
                }

                for ((addr, window_idx), packets) in &window_groups {
                    if dead_peers.contains(addr) { continue; }

                    // Adaptive RTO for this peer
                    let ip = addr.ip();
                    let rto = if let Some(rep) = rc_re.get(&ip) {
                        rep.current_rto
                    } else {
                        Duration::from_millis(S_UDP_RTO_DEFAULT)
                    };

                    // Check timeout from LATEST sent_at in this window
                    // (= when we finished sending/resending this window)
                    let latest_sent = packets.iter().map(|p| p.1).max().unwrap();
                    if latest_sent.elapsed() < rto { continue; }

                    let min_retries = packets.iter().map(|p| p.2).min().unwrap_or(0);
                    let any_last_gasp = packets.iter().any(|p| p.3);

                    // Enter recovery mode on first retry
                    if let Some(mut peer) = oc_re.get_mut(addr) {
                        if peer.recovery_started_at.is_none() {
                            peer.recovery_started_at = Some(Instant::now());
                        }

                        let recovery_elapsed = peer.recovery_started_at
                            .map(|t| t.elapsed().as_secs())
                            .unwrap_or(0);

                        if min_retries < S_UDP_WINDOW_RETRIES {
                            // 🚤 NORMAL RETRY: Resend only THIS window
                            for mut entry in ac_re.iter_mut() {
                                let ((a, s), pending) = entry.pair_mut();
                                let w = (*s & S_UDP_SEQ_MASK) >> 7;
                                if *a == *addr && w == *window_idx && pending.retries < S_UDP_WINDOW_RETRIES {
                                    pending.retries += 1;
                                    pending.sent_at = Instant::now();
                                    let _ = socket_re.send_to(&pending.data, *addr).await;
                                }
                            }
                        } else if recovery_elapsed >= 480 && !any_last_gasp {
                            // ⚡ LAST GASP (8 minutes): Resend ALL unACKed windows for this peer
                            for mut entry in ac_re.iter_mut() {
                                let ((a, _), pending) = entry.pair_mut();
                                if *a == *addr {
                                    pending.retries = 0;
                                    pending.last_gasp_tried = true;
                                    pending.sent_at = Instant::now();
                                    let _ = socket_re.send_to(&pending.data, *addr).await;
                                }
                            }
                        }
                        // else: PARKED — retries >= 5, waiting for 8-min mark or ACK
                    }
                }
            }
        });
    }

    fn derive_cipher_key(&self, shared_secret: &[u8; 32]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(shared_secret);
        hasher.finalize().into()
    }

    fn encrypt_payload(&self, key: &[u8; 32], seq: u64, ad: &[u8], plaintext: &[u8]) -> Vec<u8> {
        let cipher = ChaCha20Poly1305::new(key.into());
        let mut nonce_bytes = [0u8; 12];
        nonce_bytes[0..8].copy_from_slice(&seq.to_be_bytes());
        let nonce = Nonce::from_slice(&nonce_bytes);
        let payload = Payload { msg: plaintext, aad: ad };
        cipher.encrypt(nonce, payload).unwrap_or_default()
    }

    fn decrypt_payload(&self, key: &[u8; 32], seq: u64, ad: &[u8], ciphertext: &[u8]) -> Option<Vec<u8>> {
        let cipher = ChaCha20Poly1305::new(key.into());
        let mut nonce_bytes = [0u8; 12];
        nonce_bytes[0..8].copy_from_slice(&seq.to_be_bytes());
        let nonce = Nonce::from_slice(&nonce_bytes);
        let payload = Payload { msg: ciphertext, aad: ad };
        cipher.decrypt(nonce, payload).ok()
    }

    pub async fn send_data(&self, addr: SocketAddr, data: &[u8]) -> Result<()> {
        let chunk_limit = S_UDP_MTU - 25; // -25 bytes overhead
        let total_chunks = (data.len() + chunk_limit - 1) / chunk_limit;
        
        let mut i = 0;
        while i < total_chunks {
            let start = i * chunk_limit;
            let end = (start + chunk_limit).min(data.len());
            let chunk_data = &data[start..end];

            let packet_idx = (i % 32) as u64; 
            
            let mut throttle = false;
            let mut throttled_window_check = 0;

            let mut seq = 0u64;
            let check_addr = addr;
            let mut packet: Vec<u8> = Vec::new();

            // Check throttle BEFORE touching peer state
            if packet_idx == 0 && i != 0 {
                let (pending_window, last_acked) = if let Some(peer) = self.online_peers.get(&addr) {
                    (peer.next_send_seq, peer.last_acked_window)
                } else { return Ok(()); };

                // Rule: At most 1 completed-but-unacked window behind the current.
                // unacked = next_send_seq - last_acked_window
                // If unacked >= 2, block until the oldest past window is confirmed.
                let unacked = pending_window.saturating_sub(last_acked);
                if unacked >= 2 {
                    throttle = true;
                    throttled_window_check = pending_window - 1;
                }
            }

            if throttle {
                loop {
                    let acked = if let Some(peer) = self.online_peers.get(&addr) {
                        peer.last_acked_window
                    } else {
                        return Err(anyhow::anyhow!("Connection lost during send"));
                    };
                    if acked >= throttled_window_check { break; }
                    tokio::time::sleep(Duration::from_millis(2)).await;
                }
                continue; // Re-enter loop, packet_idx==0 again, now increment safely
            }

            {
                if let Some(mut peer) = self.online_peers.get_mut(&addr) {
                    if packet_idx == 0 {
                        peer.next_send_seq += 1;
                    }
                    let window_idx = peer.next_send_seq;
                    let dir_bit: u64 = if peer.is_server { S_UDP_DIR_BIT } else { 0 };

                    let is_end_stream: u64 = if i == total_chunks - 1 { 1 } else { 0 };
                    let is_end_window: u64 = if packet_idx == 31 || is_end_stream == 1 { 1 } else { 0 };

                    seq = dir_bit
                        | (window_idx << 7) 
                        | ((packet_idx & 0x1F) << 2) 
                        | (is_end_window << 1) 
                        | is_end_stream;
                    
                    let key = self.derive_cipher_key(&peer.shared_secret);
                    let mut ad = [0u8; 9];
                    ad[0] = FLAGS_DATA;
                    ad[1..9].copy_from_slice(&seq.to_be_bytes());

                    let encrypted = self.encrypt_payload(&key, seq, &ad, chunk_data);
                    packet = Vec::with_capacity(9 + encrypted.len());
                    packet.extend_from_slice(&ad);
                    packet.extend_from_slice(&encrypted);

                    if is_end_window == 1 {
                        if let Some(mut rep) = self.reputations.get_mut(&addr.ip()) {
                            rep.last_window_sent_at = Some(Instant::now());
                        }
                    }
                } else {
                    return Err(anyhow::anyhow!("Connection lost during send"));
                }
            } // Lock released

            self.global_acks.insert((check_addr, seq), PendingPacket {
                data: packet.clone(),
                sent_at: Instant::now(),
                retries: 0,
                last_gasp_tried: false,
            });

            let socket = if let Some(peer) = self.online_peers.get(&check_addr) {
                Arc::clone(&peer.socket)
            } else { return Err(anyhow::anyhow!("Connection lost during send")); };

            socket.send_to(&packet, check_addr).await?;

            i += 1;
        }

        // 🛑 STREAM DRAIN: Do not return until every packet for this stream is confirmed
        // The background retransmit task handles resending lost packets.
        // If session dies (10-min recovery timeout), return error.
        loop {
            let mut has_pending = false;
            for entry in self.global_acks.iter() {
                if entry.key().0 == addr {
                    has_pending = true;
                    break;
                }
            }
            if !has_pending { break; }

            // Session killed by recovery timeout → return failure
            if !self.online_peers.contains_key(&addr) {
                return Err(anyhow::anyhow!("Connection lost: recovery timeout"));
            }

            tokio::time::sleep(Duration::from_millis(5)).await;
        }

        Ok(())
    }
}
