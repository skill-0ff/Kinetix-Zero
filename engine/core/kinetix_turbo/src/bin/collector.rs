use anyhow::{Context, Result};
use mongodb::{bson::doc, options::ClientOptions, Client, Collection};
use prost::Message;
use ring::{
    aead::{Nonce, UnboundKey, CHACHA20_POLY1305},
};
use x25519_dalek::{PublicKey, StaticSecret};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::Path,
    sync::Arc,
    time::Duration,
};
use std::sync::atomic::{AtomicUsize, AtomicU64, Ordering};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::RwLock,
    time::Instant,
};
use dashmap::DashMap;

pub struct CollectorMetrics {
    pub start_time: Instant,
    pub total_bytes_received: AtomicU64,
    pub total_packets_received: AtomicU64,
    pub total_events_received: AtomicU64,
    pub total_handshakes: AtomicU64,
    pub total_unauthorized: AtomicU64,
}

impl CollectorMetrics {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
            total_bytes_received: AtomicU64::new(0),
            total_packets_received: AtomicU64::new(0),
            total_events_received: AtomicU64::new(0),
            total_handshakes: AtomicU64::new(0),
            total_unauthorized: AtomicU64::new(0),
        }
    }
}

pub struct SessionManager {
    pub pending_sessions: DashMap<String, Instant>,
    pub online_sessions: DashMap<String, Instant>,
    pub pending_count: AtomicUsize,
    pub online_count: AtomicUsize,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            pending_sessions: DashMap::new(),
            online_sessions: DashMap::new(),
            pending_count: AtomicUsize::new(0),
            online_count: AtomicUsize::new(0),
        }
    }

    pub async fn prune_sessions(&self, config: Arc<RwLock<Config>>, mongo: &Option<Client>) {
        let (pending_timeout, online_timeout) = {
            let lock = config.read().await;
            (
                Duration::from_secs(lock.session_policy.pending_timeout_sec),
                Duration::from_secs(lock.session_policy.online_timeout_sec),
            )
        };

        let mut to_offline = Vec::new();

        // 1. Prune Pending
        self.pending_sessions.retain(|host_id, start_time| {
            if start_time.elapsed() > pending_timeout {
                to_offline.push(host_id.clone());
                self.pending_count.fetch_sub(1, Ordering::SeqCst);
                false
            } else { true }
        });

        // 2. Prune Online
        self.online_sessions.retain(|host_id, last_seen| {
            if last_seen.elapsed() > online_timeout {
                to_offline.push(host_id.clone());
                self.online_count.fetch_sub(1, Ordering::SeqCst);
                false
            } else { true }
        });

        // 3. Update MongoDB
        if !to_offline.is_empty() {
            if let Some(client) = mongo {
                let agents = client.database("kinetix").collection::<mongodb::bson::Document>("agents");
                for host_id in to_offline {
                    println!("   [SESSION] Agent {} timed out -> OFFLINE", host_id);
                    let _ = agents.update_one(
                        doc! { "host_id": host_id },
                        doc! { "$set": { "status": "offline" } },
                        None
                    ).await;
                }
            }
        }
    }
}

// Auto-generated protobuf code
pub mod kinetix {
    include!(concat!(env!("OUT_DIR"), "/kinetix.rs"));
}

use kinetix::{HandshakeRequest, HandshakeResponse, AgentAuthRequest, HandshakePayload, KinetixPacket};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub ddos_threshold: u64,
    pub mongo_uri: String,
    pub redis: RedisConfig,
    pub session_policy: SessionPolicy,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionPolicy {
    pub pending_timeout_sec: u64,
    pub online_timeout_sec: u64,
    pub max_pending_agents: usize,
    pub max_online_agents: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RedisConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
}

pub struct CollectorState {
    pub config: Arc<RwLock<Config>>,
    pub server_secret: StaticSecret,
    pub server_public_key: PublicKey,
    pub mongo_client: Option<Client>, // Made optional for fail-safe dev mode
    pub session_manager: SessionManager,
    pub metrics: CollectorMetrics,
}

impl CollectorState {
    pub async fn new(config_path: &str, key_path: &str) -> Result<Self> {
        // 1. Load Initial Config
        let config_data = load_config(config_path)?;
        let config = Arc::new(RwLock::new(config_data));
        
        // 2. Start Config Reloader
        let config_clone = Arc::clone(&config);
        let path_clone = config_path.to_string();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(5)).await;
                match load_config(&path_clone) {
                    Ok(new_config) => {
                        let mut lock = config_clone.write().await;
                        *lock = new_config;
                    }
                    Err(e) => eprintln!("Failed to reload config: {}", e),
                }
            }
        });

        // 3. Load or Generate Server Keys (X25519)
        let (secret, public) = load_or_generate_keys(key_path)?;

        // 4. Initialize MongoDB (with Graceful Fallback)
        let mongo_uri = { config.read().await.mongo_uri.clone() };
        println!("-> Connecting to MongoDB at {}...", mongo_uri);
        
        // Attempt connection with a short timeout
        let mongo_client = match tokio::time::timeout(Duration::from_secs(3), async {
            let options = ClientOptions::parse(&mongo_uri).await?;
            let client = Client::with_options(options)?;
            // Check connection by pinging
            client.database("admin").run_command(doc! {"ping": 1}, None).await?;
            Ok::<Client, anyhow::Error>(client)
        }).await {
            Ok(Ok(client)) => {
                println!("   [OK] MongoDB connected successfully.");
                Some(client)
            },
            _ => {
                println!("   [WARNING] Could not connect to MongoDB. Running in MOCK MODE (Auth will be bypassed).");
                None
            }
        };

        Ok(Self {
            config,
            server_secret: secret,
            server_public_key: public,
            mongo_client,
            session_manager: SessionManager::new(),
            metrics: CollectorMetrics::new(),
        })
    }
}

fn strip_jsonc_comments(json: &str) -> String {
    json.lines()
        .map(|line| {
            // Only strip if // is at the start or preceded by whitespace (naive but works for this config)
            if let Some(pos) = line.find(" //") {
                &line[..pos]
            } else if line.trim_start().starts_with("//") {
                ""
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn load_config(path: &str) -> Result<Config> {
    let content = fs::read_to_string(path).context("Failed to read config file")?;
    let stripped = strip_jsonc_comments(&content);
    let config: Config = serde_json::from_str(&stripped).context("Failed to parse config JSON")?;
    Ok(config)
}

fn load_or_generate_keys(path: &str) -> Result<(StaticSecret, PublicKey)> {
    if Path::new(path).exists() {
        let bytes = fs::read(path)?;
        if bytes.len() != 32 {
            return Err(anyhow::anyhow!("Invalid key file size at {}", path));
        }
        let mut key_bytes = [0u8; 32];
        key_bytes.copy_from_slice(&bytes);
        let secret = StaticSecret::from(key_bytes);
        let public = PublicKey::from(&secret);
        Ok((secret, public))
    } else {
        println!("-> Generating new X25519 server key...");
        let secret = StaticSecret::random_from_rng(rand::thread_rng());
        let public = PublicKey::from(&secret);
        fs::write(path, secret.to_bytes())?;
        Ok((secret, public))
    }
}

async fn handle_handshake(stream: &mut TcpStream, state: Arc<CollectorState>) -> Result<Option<String>> {
    let mut buf = [0u8; 2048];

    // 1. Receive HandshakeRequest
    let n = stream.read(&mut buf).await.context("Failed to read from TCP stream")?;
    if n == 0 { return Ok(None); }
    let req = HandshakeRequest::decode(&buf[..n]).context("Failed to decode HandshakeRequest")?;
    println!("-> Handshake started: host_id={}", req.host_id);

    // 2. Send HandshakeResponse (Server Public Key)
    let resp = HandshakeResponse {
        server_public_key: state.server_public_key.as_bytes().to_vec(),
        status: "OK".to_string(),
    };
    let mut resp_buf = Vec::new();
    resp.encode(&mut resp_buf).context("Failed to encode HandshakeResponse")?;
    stream.write_all(&resp_buf).await.context("Failed to write to TCP stream")?;

    // 3. Receive AgentAuthRequest
    let n = stream.read(&mut buf).await.context("Failed to read AgentAuthRequest")?;
    if n == 0 { return Ok(None); }
    let auth_req = AgentAuthRequest::decode(&buf[..n]).context("Failed to decode AgentAuthRequest")?;

    // 4. Derive Shared Secret (ECDH)
    if auth_req.ephemeral_public_key.len() != 32 {
        return Err(anyhow::anyhow!("Invalid peer public key length"));
    }
    let mut peer_pub_bytes = [0u8; 32];
    peer_pub_bytes.copy_from_slice(&auth_req.ephemeral_public_key);
    let peer_public = PublicKey::from(peer_pub_bytes);
    
    let shared_secret = state.server_secret.diffie_hellman(&peer_public);

    // 5. Decrypt Payload (ChaCha20-Poly1305)
    let unbound_key = UnboundKey::new(&CHACHA20_POLY1305, shared_secret.as_bytes())
        .map_err(|_| anyhow::anyhow!("Invalid key length for AEAD"))?;
    let sealing_key = ring::aead::LessSafeKey::new(unbound_key);
    
    let mut data = auth_req.encrypted_payload.clone();
    let nonce = Nonce::try_assume_unique_for_key(&auth_req.nonce)
        .map_err(|_| anyhow::anyhow!("Invalid nonce"))?;
    
    let decrypted_data = sealing_key.open_in_place(nonce, ring::aead::Aad::empty(), &mut data)
        .map_err(|_| anyhow::anyhow!("Decryption failed"))?;
    
    let payload = HandshakePayload::decode(&decrypted_data[..]).context("Failed to decode HandshakePayload")?;

    // 6. Validate Token (MongoDB or Mock)
    let authenticated = if let Some(ref client) = state.mongo_client {
        let db = client.database("kinetix");
        let agents: Collection<mongodb::bson::Document> = db.collection("agents");
        
        // Check Limits First
        let limit = { state.config.read().await.session_policy.max_pending_agents };
        if state.session_manager.pending_count.load(Ordering::SeqCst) >= limit {
            println!("   [ERROR] Max pending sessions reached. Rejecting {}", payload.host_id);
            return Err(anyhow::anyhow!("Max occupancy reached"));
        }

        let filter = doc! { "host_id": &payload.host_id, "token": &payload.token };
        let agent_doc = agents.find_one(filter, None).await.context("MongoDB find_one failed")?;

        if agent_doc.is_some() {
            println!("   [OK] DB AUTH SUCCESS: {}", payload.host_id);
            agents.update_one(
                doc! { "host_id": &payload.host_id },
                doc! { 
                    "$set": { 
                        "agent_public_key": mongodb::bson::Binary { subtype: mongodb::bson::spec::BinarySubtype::Generic, bytes: payload.agent_public_key },
                        "status": "pending",
                        "last_handshake": mongodb::bson::DateTime::now()
                    } 
                },
                None,
            ).await.context("MongoDB update_one failed")?;
            true
        } else {
            println!("   [FAIL] DB AUTH FAILED: Invalid token for {}", payload.host_id);
            false
        }
    } else {
        println!("   [MOCK] AUTH BYPASSED: Success for {}", payload.host_id);
        true
    };

    if authenticated {
        // Transition to Pending
        state.session_manager.pending_sessions.insert(payload.host_id.clone(), Instant::now());
        state.session_manager.pending_count.fetch_add(1, Ordering::SeqCst);
        state.metrics.total_handshakes.fetch_add(1, Ordering::Relaxed);
        
        stream.write_all(b"AUTH_SUCCESS").await?;
        
        // Return the host_id so the caller can start the persistent message loop
        Ok(Some(payload.host_id))
    } else {
        state.metrics.total_unauthorized.fetch_add(1, Ordering::Relaxed);
        stream.write_all(b"AUTH_FAILED").await?;
        Ok(None)
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    if let Err(e) = run().await {
        eprintln!("Collector Fatal Error: {:?}", e);
        std::process::exit(1);
    }
    Ok(())
}

async fn run() -> Result<()> {
    println!("==========================================");
    println!("   KINETIX COLLECTOR - ENGINE CORE        ");
    println!("==========================================");
    
    // Get the directory of the executable to find data files reliably
    let mut exe_dir = std::env::current_exe().context("Failed to get current exe path")?;
    exe_dir.pop();
    
    let config_path = exe_dir.join("config.jsonc");
    let key_path = exe_dir.join("server.key");
    
    println!("-> Loading config from: {:?}", config_path);
    
    let state = Arc::new(CollectorState::new(
        config_path.to_str().context("Path conversion failed")?, 
        key_path.to_str().context("Path conversion failed")?
    ).await.context("Initialization phase failed")?);
    
    println!("-> Binding TCP listener to 0.0.0.0:5001...");
    let listener = TcpListener::bind("0.0.0.0:5001").await.context("Failed to bind TCP listener")?;
    
    println!("ONLINE - Listening for Handshakes on port 5001");
    println!("------------------------------------------");

    // 1. Background Pruning Task
    let state_cleanup = Arc::clone(&state);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(10)).await;
            state_cleanup.session_manager.prune_sessions(
                Arc::clone(&state_cleanup.config),
                &state_cleanup.mongo_client
            ).await;
        }
    });

    // 2. Metrics Monitor Task (1-Second Refresh)
    let state_metrics = Arc::clone(&state);
    tokio::spawn(async move {
        use sysinfo::{System, Pid};
        let mut sys = System::new_all();
        let pid = Pid::from(std::process::id() as usize);
        
        let mut last_packets = 0u64;
        let mut last_bytes = 0u64;
        let mut last_events = 0u64;

        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            
            // Collect Current Stats
            let p_total = state_metrics.metrics.total_packets_received.load(Ordering::Relaxed);
            let b_total = state_metrics.metrics.total_bytes_received.load(Ordering::Relaxed);
            let e_total = state_metrics.metrics.total_events_received.load(Ordering::Relaxed);
            
            // Calculate Deltas (accurate per second)
            let pps = p_total.saturating_sub(last_packets);
            let mbps = (b_total.saturating_sub(last_bytes) as f64) / (1024.0 * 1024.0);
            let eps = e_total.saturating_sub(last_events);
            
            last_packets = p_total;
            last_bytes = b_total;
            last_events = e_total;

            // System Stats
            sys.refresh_process(pid);
            let (cpu_usage, ram_usage_mb) = if let Some(process) = sys.process(pid) {
                (process.cpu_usage(), process.memory() / (1024 * 1024))
            } else { (0.0, 0) };

            let online = state_metrics.session_manager.online_count.load(Ordering::Relaxed);
            let pending = state_metrics.session_manager.pending_count.load(Ordering::Relaxed);
            let total_h = state_metrics.metrics.total_handshakes.load(Ordering::Relaxed);
            let total_u = state_metrics.metrics.total_unauthorized.load(Ordering::Relaxed);
            let uptime = state_metrics.metrics.start_time.elapsed().as_secs();

            // Display Dashboard
            let dashboard = format!(
"==========================================
       📊 KINETIX CORE DASHBOARD         
==========================================
🚀 Uptime: {}s
💻 CPU: {:.1}% | RAM: {}MB
------------------------------------------
📡 Traffic (Per Second):
   PPS:  {:>8} pkts/s
   MBPS: {:>8.2} MB/s
   EPS:  {:>8} events/s
------------------------------------------
🔐 Security & Session:
   Total Handshakes: {}
   Unauthorized:     {}
   Pending Agents:   {}
   Online Agents:    {}
==========================================\n",
                uptime, cpu_usage, ram_usage_mb, pps, mbps, eps, total_h, total_u, pending, online
            );

            print!("\x1B[2J\x1B[H"); // Clear screen
            print!("{}", dashboard);
            let _ = fs::write("metrics.log", dashboard);
        }
    });

    loop {
        let (mut stream, _addr) = listener.accept().await?;
        state.metrics.total_packets_received.fetch_add(1, Ordering::Relaxed);
        let state_clone = Arc::clone(&state);
        
        tokio::spawn(async move {
            // A. Handshake Phase
            let host_id = match handle_handshake(&mut stream, Arc::clone(&state_clone)).await {
                Ok(Some(id)) => id,
                _ => return, // Handshake failed or limit reached
            };

            // B. Persistent Session Phase
            let mut buf = [0u8; 8192];
            loop {
                match stream.read(&mut buf).await {
                    Ok(0) => break, // Connection closed
                    Ok(n) => {
                        state_clone.metrics.total_bytes_received.fetch_add(n as u64, Ordering::Relaxed);
                        let packet = match KinetixPacket::decode(&buf[..n]) {
                            Ok(p) => p,
                            Err(_) => continue,
                        };

                        // Process the packet and update session state
                        handle_session_packet(&host_id, packet, Arc::clone(&state_clone)).await;
                    }
                    Err(_) => break,
                }
            }
            println!("   [DEBUG] Connection closed for {}", host_id);
        });
    }
}

async fn handle_session_packet(host_id: &str, packet: KinetixPacket, state: Arc<CollectorState>) {
    let sm = &state.session_manager;
    
    // 1. Transition from Pending to Online if needed
    if sm.pending_sessions.remove(host_id).is_some() {
        sm.pending_count.fetch_sub(1, Ordering::SeqCst);
        
        // Check Online Limit
        let limit = { state.config.read().await.session_policy.max_online_agents };
        if sm.online_count.load(Ordering::SeqCst) < limit {
            sm.online_sessions.insert(host_id.to_string(), Instant::now());
            sm.online_count.fetch_add(1, Ordering::SeqCst);
            
            println!("   [SESSION] Agent {} is now ONLINE", host_id);
            
            // Update MongoDB status to online
            if let Some(ref client) = state.mongo_client {
                let _ = client.database("kinetix")
                    .collection::<mongodb::bson::Document>("agents")
                    .update_one(doc! { "host_id": host_id }, doc! { "$set": { "status": "online" } }, None).await;
            }
        }
    } else {
        // Refresh Online Timeout
        if let Some(mut last_seen) = sm.online_sessions.get_mut(host_id) {
            *last_seen = Instant::now();
        }
    }

    // 2. Route the Payload
    if let Some(payload) = packet.payload {
        match payload {
            kinetix::kinetix_packet::Payload::Event(_event) => {
                state.metrics.total_events_received.fetch_add(1, Ordering::Relaxed);
                // println!("   [EVENT] {} sent event type: {}", host_id, event.r#type);
            }
            kinetix::kinetix_packet::Payload::Idle(_) => {
                // Heartbeat received
            }
        }
    }
}
