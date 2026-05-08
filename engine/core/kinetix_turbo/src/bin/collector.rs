use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tokio::time::interval;
use anyhow::{Context, Result};
use std::sync::Arc;
use tokio::sync::RwLock;
use kinetix_turbo::{AppConfig, Secrets};
use s_udp::{Engine, Event as SudpEvent};
use prost::Message;
use sysinfo::System;

const SUDP_PORT: u16 = 5001;

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

async fn run_sudp_service(_config_handle: Arc<RwLock<AppConfig>>, _secrets: Arc<Option<Secrets>>, engine: Engine, shared_eps: Arc<AtomicUsize>) -> Result<()> {
    let peer_token = "client_token".to_string();
    let serv_token = "serv_token".to_string();

    let addr_str = format!("0.0.0.0:{}", SUDP_PORT);
    
    // Use S-UDP high-level listen method (handles identity and receive loop automatically)
    let mut rx = engine.listen(&addr_str, peer_token, serv_token).await?;
    println!("S-UDP Service listening securely on {}", addr_str);

    // Demonstration of sending data exclusively through S-UDP
    let engine_tx = engine.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
            interval.tick().await;
            for session in engine_tx.list_sessions() {
                // S-UDP Handles encryption, sliding window, and RTO retransmissions!
                let _ = engine_tx.send(session.peer_addr, b"SERVER_PING_HEARTBEAT").await;
            }
        }
    });

    // Handle high-level events emitted by the S-UDP engine
    while let Some(event) = rx.recv().await {
        match event {
            SudpEvent::Connected => {} // Disabled print to keep dashboard clean
            SudpEvent::Data(report) => {
                let mut cursor = &report.payload[..];
                while cursor.len() > 0 {
                    if let Ok(_parsed) = kinetix_turbo::proto::KinetixPacket::decode_length_delimited(&mut cursor) {
                        shared_eps.fetch_add(1, Ordering::Relaxed);
                    } else {
                        break;
                    }
                }
            }
            SudpEvent::Disconnected(_info) => {} // Disabled print
        }
    }

    Ok(())
}

use crossterm::{
    event::{Event, EventStream, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, Clear, ClearType},
};
use futures_util::StreamExt;

#[derive(PartialEq)]
enum ViewMode {
    Status,
    Config,
}

async fn run_interactive_status(config_handle: Arc<RwLock<AppConfig>>, engine: Engine, shared_eps: Arc<AtomicUsize>) -> Result<()> {
    enable_raw_mode()?;
    let mut reader = EventStream::new();
    let mut interval = interval(Duration::from_secs(1));
    let mut sys = System::new_all();
    let mut mode = ViewMode::Status;

    println!("Interactive Terminal Initialized. [Q] Quit | [C] Config View");
    loop {
        tokio::select! {
            _ = interval.tick() => {
                let config = config_handle.read().await;
                let pid = sysinfo::get_current_pid().expect("Failed to get PID");
                sys.refresh_process(pid);
                let current_eps = shared_eps.swap(0, Ordering::Relaxed);
                
                execute!(std::io::stdout(), Clear(ClearType::All), crossterm::cursor::MoveTo(0, 0))?;
                match mode {
                    ViewMode::Status => {
                        let last_eps = current_eps;
                        print_cyber_status(&config, &engine, last_eps, &sys);
                    },
                    ViewMode::Config => print_config_hud(&config),
                }
            }
            maybe_event = reader.next() => {
                match maybe_event {
                    Some(Ok(Event::Key(key))) => {
                        if key.kind == KeyEventKind::Press {
                            match key.code {
                                KeyCode::Char('q') | KeyCode::Char('Q') => break,
                                KeyCode::Char('c') | KeyCode::Char('C') => {
                                    if mode == ViewMode::Status { mode = ViewMode::Config; }
                                }
                                KeyCode::Esc => {
                                    if mode == ViewMode::Config { mode = ViewMode::Status; }
                                }
                                _ => {}
                            }
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

fn print_config_hud(config: &AppConfig) {
    let aqua = "\x1b[38;5;51m";
    let orange = "\x1b[38;5;208m";
    let white = "\x1b[1;37m";
    let gray = "\x1b[38;5;244m";
    let reset = "\x1b[0m";

    let width: usize = 58; // Internal width between ┃ and ┃

    let print_line = |content: &str, color: &str| {
        let text_len = content.chars().count();
        let padding = width.saturating_sub(text_len + 1); // 1 space at start
        println!("\r{}┃ {}{}{}┃{}{}", aqua, color, content, " ".repeat(padding), aqua, reset);
    };

    println!("\r{}╭──────────────────────────────────────────────────────────╮{}", aqua, reset);
    let header_text = "🛰️  KINETIX CONFIGURATION_MATRIX";
    let status_tag = "[ LIVE ● ]";
    // 60 total width. ┃ (1) + space (1) + text + spaces + tag + space (1) + ┃ (1) = 60
    // text(31) + tag(10) = 41. 60 - 41 - 4 = 15 spaces.
    println!("\r{}┃ {} {}            {} {}┃{}{}", aqua, white, header_text, aqua, status_tag, aqua, reset);
    println!("\r{}┣──────────────────────────────────────────────────────────┫{}", aqua, reset);
    
    print_line(&format!("[ DATABASE_CORE ]"), orange);
    print_line("", "");
    print_line(" MONGO_URI:", white);
    print_line(&format!(" {}", config.mongo_uri), gray);
    
    println!("\r{}┣──────────────────────────────────────────────────────────┫{}", aqua, reset);
    
    print_line(&format!("[ COLLECTOR_NODE ]"), orange);
    print_line("", "");
    print_line(" SECRETS_PATH:", white);
    print_line(&format!(" {}", config.collector.secrets_path), gray);
    print_line("", "");
    
    println!("\r{}╰──────────────────────────────────────────────────────────╯{}", aqua, reset);
    
    println!("\r");
    println!("\r {}[ESC] {}RETURN TO MAIN DASHBOARD  {}|  {}[Q] {}QUIT{}", aqua, white, gray, aqua, white, reset);
}

fn print_cyber_status(_config: &AppConfig, engine: &Engine, eps: usize, sys: &System) {
    let pid = sysinfo::get_current_pid().expect("Failed to get PID");
    let (cpu_usage, mem_used, mem_total, mem_pct) = if let Some(proc) = sys.process(pid) {
        let cpu = proc.cpu_usage();
        let mem = proc.memory() as f64 / 1_048_576.0; 
        let total = sys.total_memory() as f64 / 1_048_576.0;
        let pct = (proc.memory() as f64 / sys.total_memory() as f64) * 100.0;
        (cpu, mem, total, pct)
    } else {
        (0.0, 0.0, 0.0, 0.0)
    };

    let active_sessions = engine.session_count();
    let sessions = engine.list_sessions();
    let mut total_rx = 0;
    let mut total_tx = 0;
    let mut in_recovery = 0;
    
    for s in &sessions {
        total_rx += s.total_bytes_received;
        total_tx += s.total_bytes_sent;
        if s.in_recovery {
            in_recovery += 1;
        }
    }
    
    let cpu_bar = make_bar(cpu_usage as f64, 100.0, 20);
    let mem_bar = make_bar(mem_pct, 100.0, 20);
    
    // Cyberpunk Color Palette (256-color ANSI)
    let aqua = "\x1b[38;5;51m";
    let purple = "\x1b[38;5;93m";
    let yellow = "\x1b[38;5;226m";
    let white = "\x1b[1;37m";
    let gray = "\x1b[38;5;244m";
    let reset = "\x1b[0m";

    println!("\r{}{:>58}{}", purple, "╭──────────────────────────────────────────────────────────╮", reset);
    println!("\r{}│  {}🚀 KINETIX-ZERO // {}COLLECTOR CORE {}[ONLINE]              {}│", purple, aqua, white, yellow, purple);
    println!("\r{}{:>58}{}", purple, "╰──────────────────────────────────────────────────────────╯", reset);
    
    println!("\r");
    println!("\r {}[💻] {}COLLECTOR CPU", yellow, white);
    println!("\r {} {} {:>5.1}%", aqua, cpu_bar, cpu_usage);
    
    println!("\r");
    println!("\r {}[🧠] {}COLLECTOR RAM", yellow, white);
    println!("\r {} {} {:>5.1}% ({:.1} MB / {:.0} MB)", aqua, mem_bar, mem_pct, mem_used, mem_total);
    
    println!("\r");
    println!("\r {}{}╾────────────────────────────────────────────────────────╼{}", gray, gray, reset);
    
    println!("\r  {}⚡ LIVE TRAFFIC:  {} [ {}{} EPS{} ]", white, reset, yellow, eps, reset);
    println!("\r  {}🌐 ACTIVE AGENTS: {} [ {}{} ]", white, reset, yellow, active_sessions);
    
    let (status_text, status_color) = if in_recovery > 0 { 
        (format!("RECOVERY: {} ACTIVE", in_recovery), "\x1b[38;5;196m") 
    } else { 
        ("STABLE ✓".to_string(), "\x1b[38;5;46m") 
    };
    println!("\r  {}📈 NETWORK:       {} [ {}{} ]", white, reset, status_color, status_text);
    
    println!("\r {}{}╾────────────────────────────────────────────────────────╼{}", gray, gray, reset);
    
    println!("\r  {}⬇ RX: {:.1} MB  {}|  {}⬆ TX: {:.1} MB", aqua, total_rx as f64 / 1_048_576.0, gray, aqua, total_tx as f64 / 1_048_576.0);
    println!("\r");
    println!("\r \x1b[38;5;240m[Q] Quit | [C] Config | [Ctrl+C] Kill\x1b[0m");
}

fn make_bar(val: f64, max: f64, len: usize) -> String {
    let pct = (val / max).clamp(0.0, 1.0);
    let filled = (pct * len as f64).round() as usize;
    let empty = len.saturating_sub(filled);
    format!("{}{}", "▰".repeat(filled), "▱".repeat(empty))
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let show_status = args.iter().any(|arg| arg == "-status");

    let config_path = find_config_file()?;
    let mut initial_config = load_config(&config_path)?;
    
    let mut secrets = None;
    if !show_status {
        secrets = Some(bootstrap_secrets(&config_path, &mut initial_config)?);
    }

    let shared_config = Arc::new(RwLock::new(initial_config));
    let shared_secrets = Arc::new(secrets);
    let shared_eps = Arc::new(AtomicUsize::new(0));
    
    let engine = Engine::new();
    
    let sudp_shared = Arc::clone(&shared_config);
    let secrets_shared = Arc::clone(&shared_secrets);
    let engine_service = engine.clone();
    let eps_service = Arc::clone(&shared_eps);
    tokio::spawn(async move {
        let _ = run_sudp_service(sudp_shared, secrets_shared, engine_service, eps_service).await;
    });

    if show_status {
        run_interactive_status(shared_config, engine, shared_eps).await?;
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
