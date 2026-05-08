pub use s_udp;

pub mod proto {
    include!(concat!(env!("OUT_DIR"), "/kinetix.rs"));
}
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CollectorConfig {
    pub secrets_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Secrets {
    pub serv_secret: String,
    pub agen_secret: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub mongo_uri: String,
    pub collector: CollectorConfig,
}
