# S-UDP: Streaming User Datagram Protocol

S-UDP is a mathematically proven, high-performance sliding window protocol built on top of UDP. It brings TCP-like reliability and state-of-the-art cryptography to UDP, enabling massive file transfers and real-time streaming with zero data corruption.

## Features

- **Pipelined Sliding Windows**: Transmit massive payloads instantly. S-UDP automatically fragments your data into UDP chunks, pipelines them through mathematically proven sliding windows, and reassembles them perfectly on the receiving end.
- **MicroCA (Ed25519) Authentication**: Bring Zero-Trust security to UDP. S-UDP uses `ring::signature::Ed25519` to sign sessions using tiny 32-byte keys, completely avoiding the 1400-byte UDP MTU limit that breaks traditional web X.509 certificates.
- **ChaCha20Poly1305 Encryption**: Every single packet is fully encrypted and authenticated.
- **Strict Encapsulation**: The complex protocol geometry is completely hidden. You interact purely through a clean Event Loop pipe.

## Quick Start

### 1. Define your AuthMode
S-UDP allows you to authenticate your sessions using either Pre-Shared Tokens, Ed25519 MicroCAs, or No Authentication at all.

```rust
use s_udp::AuthMode;

// Simple Token-based Auth
let auth = AuthMode::Tokens {
    peer_token: "client_secret_xyz".to_string(),
    serv_token: "server_secret_abc".to_string(),
};
```

### 2. Start the Server
Spawn an S-UDP Engine and listen for incoming connections. The engine handles the 4-way cryptographic handshake automatically.

```rust
use s_udp::{Engine, Event};

#[tokio::main]
async fn main() {
    let server = Engine::new();
    let mut rx = server.listen("0.0.0.0:9000", auth).await.unwrap();

    // The Event Loop
    while let Some(event) = rx.recv().await {
        match event {
            Event::Connected => println!("New Peer Connected!"),
            Event::Data(report) => {
                println!("Received {} bytes in {} windows!", report.total_bytes, report.windows_used);
                // report.payload contains your perfectly reassembled data!
            },
            Event::Disconnected(info) => println!("Peer disconnected: {}", info.reason),
        }
    }
}
```

### 3. Connect & Transmit (Client)
Connecting is just as simple. Once connected, you can blast massive payloads (e.g. a 5 Megabyte file). The engine will automatically fragment it into thousands of UDP packets and push them through the sliding window pipeline.

```rust
let client = Engine::new();
let mut rx = client.connect("127.0.0.1:9000", 9001, auth).await.unwrap();

// Generate a 5 Megabyte Payload
let massive_payload = vec![0u8; 5 * 1024 * 1024];

// Transmit! S-UDP fragments, encrypts, and pipelines it instantly.
client.send("127.0.0.1:9000".parse().unwrap(), &massive_payload).await.unwrap();
```

## Security & Protocol Geometry

S-UDP achieves its speed by maintaining a strict protocol geometry. All UDP payloads are kept tightly under the 1400-byte MTU limit.
* `01 INIT` / `02 RESP`: Diffie-Hellman Key Exchange (X25519)
* `03 AUTH_REQ` / `04 AUTH_RESP`: Encrypted Authentication (Token matching or Ed25519 Signature Verification).
* `05 DATA`: Sliding window streams.
* `06 DISC`: Graceful Disconnect.
* `08 ACK`: Window Acknowledgment Vector Map.

By pushing the limits of mathematical sliding windows and zero-trust authentication, S-UDP is the ultimate streaming protocol for production Rust applications.
