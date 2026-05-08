pub use s_udp;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CollectorConfig {
    pub secrets_path: String,
    pub max_pending_agents: u32,
    pub max_online_agents: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Secrets {
    pub serv_secret: String,
    pub agen_secret: String,
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
    pub storage_policy: StoragePolicy,
}
