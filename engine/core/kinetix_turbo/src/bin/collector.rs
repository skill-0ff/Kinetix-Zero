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
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::RwLock,
};

// Auto-generated protobuf code
pub mod kinetix {
    include!(concat!(env!("OUT_DIR"), "/kinetix.rs"));
}

use kinetix::{HandshakeRequest, HandshakeResponse, AgentAuthRequest, HandshakePayload};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub ddos_threshold: u64,
    pub mongo_uri: String,
    pub redis: RedisConfig,
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

async fn handle_handshake(mut stream: TcpStream, state: Arc<CollectorState>) -> Result<()> {
    let mut buf = [0u8; 2048];

    // 1. Receive HandshakeRequest
    let n = stream.read(&mut buf).await.context("Failed to read from TCP stream")?;
    if n == 0 { return Ok(()); }
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
    if n == 0 { return Ok(()); }
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
        
        let filter = doc! { "host_id": &payload.host_id, "token": &payload.token };
        let agent_doc = agents.find_one(filter, None).await.context("MongoDB find_one failed")?;

        if agent_doc.is_some() {
            println!("   [OK] DB AUTH SUCCESS: {}", payload.host_id);
            agents.update_one(
                doc! { "host_id": &payload.host_id },
                doc! { "$set": { "agent_public_key": mongodb::bson::Binary { subtype: mongodb::bson::spec::BinarySubtype::Generic, bytes: payload.agent_public_key } } },
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
        stream.write_all(b"AUTH_SUCCESS").await?;
    } else {
        stream.write_all(b"AUTH_FAILED").await?;
    }

    Ok(())
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

    loop {
        let (stream, addr) = listener.accept().await?;
        let state_clone = Arc::clone(&state);
        tokio::spawn(async move {
            if let Err(e) = handle_handshake(stream, state_clone).await {
                eprintln!("   [ERROR] Handshake error with {}: {:?}", addr, e);
            }
        });
    }
}
