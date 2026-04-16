use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::time::interval;
use anyhow::{Context, Result};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::net::UdpSocket;
use kinetix_turbo::{AppConfig, Secrets};
use kinetix_turbo::s_udp::{Engine, Event};

const RUDP_PORT: u16 = 5001;

/// Strip comments from JSONC (JSON with Comments) text.
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
                    chars.next();
                    while let Some(&c) = chars.peek() {
                        if c == '\n' || c == '\r' { break; }
                        chars.next();
                    }
                    continue;
                } else if nxt == '*' {
                    chars.next();
                    while let Some(c) = chars.next() {
                        if c == '*' {
                            if let Some(&n) = chars.peek() {
                                if n == '/' { chars.next(); break; }
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
    let paths = vec!["../config.jsonc", "config.jsonc", "engine/core/config.jsonc"];
    for p in paths {
        let path = PathBuf::from(p);
        if path.exists() { return Ok(path); }
    }
    Err(anyhow::anyhow!("Configuration file config.jsonc not found"))
}

fn load_config(path: &Path) -> Result<AppConfig> {
    let content = fs::read_to_string(path).with_context(|| format!("Failed to read config file at {:?}", path))?;
    let stripped = strip_jsonc_comments(&content);
    let config: AppConfig = serde_json::from_str(&stripped).with_context(|| "Failed to parse JSON configuration")?;
    Ok(config)
}

fn save_config(path: &Path, config: &AppConfig) -> Result<()> {
    let content = fs::read_to_string(path)?;
    let new_path_val = &config.collector.secrets_path;
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut found = false;
    for line in lines.iter_mut() {
        if let Some(pos) = line.find("\"secrets_path\"") {
            if let Some(colon_pos) = line[pos..].find(':') {
                let actual_colon_pos = pos + colon_pos;
                if let Some(first_quote) = line[actual_colon_pos..].find('"') {
                    let actual_first_quote = actual_colon_pos + first_quote;
                    if let Some(second_quote) = line[actual_first_quote + 1..].find('"') {
                        let actual_second_quote = actual_first_quote + 1 + second_quote;
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
    if found { fs::write(path, lines.join("\n"))?; }
    else { fs::write(path, serde_json::to_string_pretty(config)?)?; }
    Ok(())
}

fn generate_random_secret(len: usize) -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..len).map(|_| { let idx = rng.gen_range(0..CHARSET.len()); CHARSET[idx] as char }).collect()
}

fn bootstrap_secrets(config_path: &Path, config: &mut AppConfig) -> Result<Secrets> {
    use std::io::{self, Write};
    if !config.collector.secrets_path.is_empty() {
        let p = PathBuf::from(&config.collector.secrets_path);
        if p.exists() {
            let content = fs::read_to_string(&p)?;
            if let Ok(sec) = serde_json::from_str::<Secrets>(&content) { return Ok(sec); }
        }
    }
    println!("\n\r\x1b[1;36m[🔒 AUTH BOOTSTRAP]\x1b[0m");
    println!("\x1b[1mHandshake secrets not found. Please choose an option:\x1b[0m");
    println!("  [1] Generate new random secrets (saved to collector.key)");
    println!("  [2] Provide path to an existing .key file");
    print!("Selection > "); io::stdout().flush()?;
    let mut choice = String::new(); io::stdin().read_line(&mut choice)?;
    let choice = choice.trim();
    if choice == "1" {
        let sec = Secrets { serv_secret: generate_random_secret(48), agen_secret: generate_random_secret(48) };
        let mut save_path = config_path.parent().unwrap_or(Path::new(".")).to_path_buf();
        save_path.push("collector.key");
        fs::write(&save_path, serde_json::to_string_pretty(&sec)?)?;
        let path_str = save_path.to_string_lossy().to_string().replace("\\", "/");
        config.collector.secrets_path = path_str.clone();
        save_config(config_path, config)?;
        println!("\r\x1b[1;32mGenerated secrets saved to {}\x1b[0m", path_str);
        Ok(sec)
    } else {
        print!("Enter path to .key file > "); io::stdout().flush()?;
        let mut path_in = String::new(); io::stdin().read_line(&mut path_in)?;
        let path_in = path_in.trim().replace("\\", "/");
        let content = fs::read_to_string(&path_in).with_context(|| format!("Failed to read secrets at {}", path_in))?;
        let sec: Secrets = serde_json::from_str(&content).with_context(|| "Invalid secrets file format")?;
        config.collector.secrets_path = path_in.to_string();
        save_config(config_path, config)?;
        println!("\r\x1b[1;32mSecrets loaded and config updated.\x1b[0m");
        Ok(sec)
    }
}

async fn run_rudp_service(config_handle: Arc<RwLock<AppConfig>>, secrets: Arc<Option<Secrets>>) -> Result<()> {
    let socket = UdpSocket::bind(format!("0.0.0.0:{}", RUDP_PORT)).await?;
    let socket = Arc::new(socket);
    
    // Create S-UDP Engine
    let engine = Engine::new(config_handle, secrets);
    engine.start_background_tasks(Arc::clone(&socket)).await;

    println!("S-UDP Service listening on port {}", RUDP_PORT);

    let mut buf = vec![0u8; 1400]; // Standardized S-UDP MTU
    loop {
        let (len, addr) = socket.recv_from(&mut buf).await?;
        match engine.process_packet(&socket, addr, &buf, len).await {
            Ok(Some(event)) => match event {
                Event::Connected => {
                    println!("Agent authenticated via S-UDP from {}", addr);
                }
                Event::Data(payload) => {
                    let _ = payload; // Telemetry logic would go here
                }
            },
            Err(e) => eprintln!("Protocol error for {}: {}", addr, e),
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
    println!("Interactive Dashboard started. Press 'Q' to exit view.");

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
                        if key.kind == KeyEventKind::Press && (key.code == KeyCode::Char('q') || key.code == KeyCode::Char('Q')) {
                            break;
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    disable_raw_mode()?;
    Ok(())
}

fn print_dashboard_footer() {
    println!("\x1b[1;35m======================================\x1b[0m");
    println!("\x1b[1;36m💡 INFO:\x1b[0m Use \x1b[1m[Q]\x1b[0m to exit | \x1b[1m[Ctrl+C]\x1b[0m to kill collector");
    println!("\x1b[1;35m======================================\x1b[0m");
}

fn print_cyber_dashboard(config: &AppConfig) {
    println!("\r\x1b[1;36m🚀 [ KINETIX-ZERO COLLECTOR CORE ] 🚀\x1b[0m");
    println!("\x1b[1;35m======================================\x1b[0m");
    let ddos_status = if config.storage_policy.save_logs.ddos_evidence { "ACTIVE ✅" } else { "DISABLED ❌" };
    println!("\x1b[1m[🚨] DDOS EVIDENCE >> {}\x1b[0m", ddos_status);
    println!("  \x1b[1;36m├─ [🔬]\x1b[0m Sample Rate: {}", config.forensic_sample_rate);
    println!("  \x1b[1;35m--------------------------------------\x1b[0m");
    println!("\x1b[1m[🛡️] S-UDP CONFIG\x1b[0m");
    println!("  >> Pending Handshake: \x1b[1;33m2s\x1b[0m (Fixed)");
    println!("  >> Session Lifetime:  \x1b[1;33m60s\x1b[0m (Fixed)");
    println!("  >> Max Pending:       {}", config.collector.max_pending_agents);
    println!("  >> Max Sessions:      {}", config.collector.max_online_agents);
    println!("\x1b[1;35m======================================\x1b[0m");
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let show_conf = args.iter().any(|arg| arg == "-conf");

    let config_path = find_config_file()?;
    let mut initial_config = load_config(&config_path)?;
    
    let mut secrets = None;
    if !show_conf {
        secrets = Some(bootstrap_secrets(&config_path, &mut initial_config)?);
    }

    let shared_config = Arc::new(RwLock::new(initial_config));
    let shared_secrets = Arc::new(secrets);
    
    let rudp_shared = Arc::clone(&shared_config);
    let secrets_shared = Arc::clone(&shared_secrets);
    tokio::spawn(async move {
        let _ = run_rudp_service(rudp_shared, secrets_shared).await;
    });

    if show_conf {
        run_interactive_dashboard(shared_config).await?;
        return Ok(());
    }

    let mut interval = interval(Duration::from_secs(5));
    loop {
        interval.tick().await;
        if let Ok(new_config) = load_config(&config_path) {
            let mut w = shared_config.write().await;
            *w = new_config;
            println!("\rConfig Refreshed.");
        }
    }
}
