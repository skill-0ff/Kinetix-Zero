use kinetix_turbo::s_udp::{Engine, Event, AuthMode};
use tokio::time::{sleep, Duration};
use sha2::{Sha256, Digest};
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("🚀 Starting S-UDP Massive Payload Stress Test...");

    // 1. Initialize Engines
    let server_engine = Engine::new();
    let client_engine = Engine::new();

    // 2. Enable Telemetry on Server
    let mut server_log_rx = server_engine.enable_logging();
    tokio::spawn(async move {
        while let Some(log) = server_log_rx.recv().await {
            // Ignore low-level window updates to prevent spamming the console
            if !log.message.contains("ACK Map:") && !log.message.contains("Shifting Window") {
                println!("[SERVER LOG] {}", log.message);
            }
        }
    });

    // 3. Enable Telemetry on Client
    let mut client_log_rx = client_engine.enable_logging();
    tokio::spawn(async move {
        while let Some(log) = client_log_rx.recv().await {
            if !log.message.contains("ACK Map:") && !log.message.contains("Shifting Window") {
                println!("[CLIENT LOG] {}", log.message);
            }
        }
    });

    let server_addr = "127.0.0.1:9000";
    let client_port = 9001;

    let auth_mode = AuthMode::Tokens {
        peer_token: "test_peer_token".to_string(),
        serv_token: "test_serv_token".to_string(),
    };

    // 4. Start Server Listening
    let mut server_rx = server_engine.listen(server_addr, auth_mode.clone()).await?;
    println!("✅ Server listening on {}", server_addr);

    // 5. Connect Client
    println!("⏳ Client connecting to Server...");
    let mut client_rx = client_engine.connect(server_addr, client_port, auth_mode).await?;

    // Wait for client to connect
    match client_rx.recv().await {
        Some(Event::Connected) => println!("✅ Client successfully connected!"),
        _ => return Err(anyhow::anyhow!("Client failed to connect")),
    }

    // Wait for server to register connection
    match server_rx.recv().await {
        Some(Event::Connected) => println!("✅ Server registered connection!"),
        _ => return Err(anyhow::anyhow!("Server failed to register connection")),
    }

    // 6. Generate 5MB Payload
    let payload_size = 5 * 1024 * 1024;
    println!("📦 Generating {} bytes of payload (simulating 5MB image)...", payload_size);
    let mut payload = vec![0u8; payload_size];
    for i in 0..payload_size {
        payload[i] = (i % 256) as u8; // Deterministic pattern for exact verification
    }

    // Hash payload before sending
    let mut hasher = Sha256::new();
    hasher.update(&payload);
    let original_hash = format!("{:x}", hasher.finalize());
    println!("🔒 Original SHA-256 Hash: {}", original_hash);

    // 7. Send Payload
    println!("🚀 Transmitting 5MB payload via S-UDP Sliding Windows (this will fragment into ~3800 packets)...");
    let target_addr: SocketAddr = server_addr.parse()?;
    
    // Send in background so we don't block
    let client_engine_clone = client_engine.clone();
    let payload_clone = payload.clone();
    tokio::spawn(async move {
        client_engine_clone.send(target_addr, &payload_clone).await.unwrap();
    });

    // 8. Server Awaits Reassembly
    println!("⏳ Server is reassembling chunks in real-time...");
    match server_rx.recv().await {
        Some(Event::Data(report)) => {
            println!("✅ Server fully reassembled payload!");
            println!("   -> Total Bytes: {}", report.total_bytes);
            println!("   -> Total Chunks: {}", report.total_chunks);
            println!("   -> Windows Used: {}", report.windows_used);
            println!("   -> Time Elapsed: {:?}", report.elapsed);

            // Verify Hash
            let mut hasher = Sha256::new();
            hasher.update(&report.payload);
            let recv_hash = format!("{:x}", hasher.finalize());

            if original_hash == recv_hash {
                println!("🎉 SUCCESS: Hashes match perfectly! Zero corruption.");
            } else {
                println!("❌ ERROR: Hashes DO NOT match!");
                println!("Expected: {}", original_hash);
                println!("Received: {}", recv_hash);
            }
        },
        _ => return Err(anyhow::anyhow!("Failed to receive data")),
    }

    // 9. Graceful Disconnect
    println!("🔌 Client sending disconnect...");
    client_engine.disconnect(target_addr, "Test Finished").await?;

    sleep(Duration::from_millis(500)).await;
    println!("🏁 Stress test complete!");

    Ok(())
}
