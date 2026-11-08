use gloo::storage::{LocalStorage, Storage};
use serde::{Deserialize, Serialize};

pub const STORAGE_KEY: &str = "zhuzhu-guoyu-island-v1";

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Progress {
    #[serde(default = "default_true")]
    pub sound: bool,
    #[serde(default)]
    pub intro_seen: bool,
    #[serde(default)]
    pub stamps: Vec<String>,
    #[serde(default)]
    pub best: std::collections::HashMap<String, u8>,
}

fn default_true() -> bool {
    true
}

impl Progress {
    pub fn load() -> Self {
        LocalStorage::get(STORAGE_KEY).unwrap_or_default()
    }

    pub fn save(&self) {
        let _ = LocalStorage::set(STORAGE_KEY, self);
    }
}

pub type Mode = &'static str;
