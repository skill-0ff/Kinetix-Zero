# S-UDP (Secure UDP)

A reliable, encrypted, and windowed UDP protocol implementation in Rust. S-UDP is designed for high-performance applications that require the speed of UDP with the reliability and security of TCP-like features.

## Features

- **🔐 End-to-End Encryption**: Authenticated encryption using ChaCha20-Poly1305.
- **🤝 Secure Handshake**: X25519 Diffie-Hellman key exchange with peer token validation.
- **🚀 Sliding Window Reliability**: Efficient retransmission with a 32-packet sliding window.
- **📉 Adaptive RTO**: Dynamic Retransmission Timeout calculation based on network conditions.
- **🛡️ Security First**: Physical memory zeroization for sensitive tokens and keys using `zeroize`.
- **📊 Real-time Metrics**: Live progress tracking and detailed transmission reports.

## Installation

Add this to your `Cargo.toml`:

```toml
[dependencies]
s-udp = { path = "path/to/engine/s-udp" }
```

## Quick Start

### Server Example

```rust
use s_udp::{Engine, Event};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let engine = Engine::new();
    let mut rx = engine.listen("0.0.0.0:5001", "client_token".into(), "server_token".into()).await?;

    while let Some(event) = rx.recv().await {
        match event {
            Event::Connected => println!("New client connected!"),
            Event::Data(report) => {
                println!("Received {} bytes from peer", report.total_bytes);
            }
            Event::Disconnected(info) => println!("Client disconnected: {}", info.reason),
        }
    }
    Ok(())
}
```

### Client Example

```rust
use s_udp::{Engine, Event};
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let engine = Engine::new();
    let addr: SocketAddr = "127.0.0.1:5001".parse()?;
    
    let mut rx = engine.connect("127.0.0.1:5001", 0, "client_token".into(), "server_token".into()).await?;
    
    // Send some data
    let report = engine.send(addr, b"Hello S-UDP!").await?;
    println!("Sent {} bytes successfully", report.total_bytes);

    Ok(())
}
```

## Protocol Constants

- **MTU**: 1400 bytes (Safe for most networks)
- **Window Size**: 32 packets
- **Handshake Timeout**: 2 seconds
- **Session Timeout**: 10 minutes

## License

This project is licensed under either of

- [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0)
- [MIT license](http://opensource.org/licenses/MIT)

at your option.
