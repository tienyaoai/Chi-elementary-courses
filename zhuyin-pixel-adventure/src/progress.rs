use crate::world;
use gloo::storage::{LocalStorage, Storage};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const STORAGE_KEY: &str = "zhuzhu-pixel-adventure-v1";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PixelProgress {
    #[serde(default = "default_true")]
    pub sound: bool,
    #[serde(default)]
    pub character_id: String,
    #[serde(default)]
    pub rewards: Vec<String>,
    #[serde(default)]
    pub levels_cleared: HashSet<String>,
    #[serde(default)]
    pub levels_claimed: HashSet<String>,
    #[serde(default)]
    pub player_x: f32,
    #[serde(default = "default_spawn_x")]
    pub player_y: f32,
}

fn default_true() -> bool {
    true
}

fn default_spawn_x() -> f32 {
    world::SPAWN_TILE.0 as f32
}

fn default_spawn_y() -> f32 {
    world::SPAWN_TILE.1 as f32
}

impl Default for PixelProgress {
    fn default() -> Self {
        Self {
            sound: true,
            character_id: String::new(),
            rewards: Vec::new(),
            levels_cleared: HashSet::new(),
            levels_claimed: HashSet::new(),
            player_x: default_spawn_x(),
            player_y: default_spawn_y(),
        }
    }
}

impl PixelProgress {
    pub fn load() -> Self {
        LocalStorage::get(STORAGE_KEY).unwrap_or_default()
    }

    pub fn save(&self) {
        let _ = LocalStorage::set(STORAGE_KEY, self);
    }

    pub fn claim_level(&mut self, level_id: &str, reward_id: &str) -> bool {
        if !self.levels_cleared.contains(level_id) {
            return false;
        }
        if self.levels_claimed.contains(level_id) {
            return false;
        }
        self.levels_claimed.insert(level_id.to_string());
        if !self.rewards.contains(&reward_id.to_string()) {
            self.rewards.push(reward_id.to_string());
        }
        true
    }
}

pub const REWARDS: &[(&str, &str, &str)] = &[
    ("star-zh-1", "國語星星", "通過注音森林第一關"),
    ("ribbon-zh", "注音緞帶", "完成看圖與排句挑戰"),
    ("cap-pixel", "像素小帽", "冒險者紀念配件"),
];
