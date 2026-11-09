use crate::grade1::{Grade1Bank, UnitPack};
use crate::map_config::{self, MapOrientation};
use crate::world::detect_orientation;
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
    pub questions_passed: HashSet<String>,
    #[serde(default)]
    pub units_cleared: HashSet<String>,
    #[serde(default)]
    pub units_claimed: HashSet<String>,
    #[serde(default)]
    pub bank_migrated: bool,
    #[serde(default)]
    pub player_x: f32,
    #[serde(default = "default_spawn_x")]
    pub player_y: f32,
}

fn default_true() -> bool {
    true
}

fn default_spawn_x() -> f32 {
    map_config::spawn(MapOrientation::Portrait).0
}

fn default_spawn_y() -> f32 {
    map_config::spawn(MapOrientation::Portrait).1
}

impl Default for PixelProgress {
    fn default() -> Self {
        Self {
            sound: true,
            character_id: String::new(),
            rewards: Vec::new(),
            levels_cleared: HashSet::new(),
            levels_claimed: HashSet::new(),
            questions_passed: HashSet::new(),
            units_cleared: HashSet::new(),
            units_claimed: HashSet::new(),
            bank_migrated: false,
            player_x: default_spawn_x(),
            player_y: default_spawn_y(),
        }
    }
}

impl PixelProgress {
    pub fn load() -> Self {
        let mut p: Self = LocalStorage::get(STORAGE_KEY).unwrap_or_default();
        p.migrate_legacy();
        p
    }

    pub fn save(&self) {
        let _ = LocalStorage::set(STORAGE_KEY, self);
    }

    fn migrate_legacy(&mut self) {
        if !self.bank_migrated {
            if self.levels_cleared.remove("chinese-forest-1") {
                self.units_cleared.insert("G1-S1-U1".to_string());
                if self.levels_claimed.remove("chinese-forest-1") {
                    self.units_claimed.insert("G1-S1-U1".to_string());
                    if !self.rewards.iter().any(|r| r == "star-G1-S1-U1") {
                        self.rewards.push("star-G1-S1-U1".to_string());
                    }
                }
            }
            self.bank_migrated = true;
        }
        self.character_id = map_config::migrate_character_id(&self.character_id);
        if self.player_x < 40.0 && self.player_y < 25.0 {
            let orient = detect_orientation();
            let (sx, sy) = map_config::spawn(orient);
            self.player_x = sx;
            self.player_y = sy;
        }
    }

    pub fn unit_cleared(&self, level_id: &str) -> bool {
        self.units_cleared.contains(level_id)
    }

    pub fn unit_answered_count(&self, unit: &UnitPack) -> usize {
        unit
            .questions
            .iter()
            .filter(|q| self.questions_passed.contains(&q.id))
            .count()
    }

    pub fn mark_unit_cleared(&mut self, level_id: &str) {
        self.units_cleared.insert(level_id.to_string());
    }

    pub fn claim_unit(&mut self, level_id: &str, reward_id: &str) -> bool {
        if !self.units_cleared.contains(level_id) {
            return false;
        }
        if self.units_claimed.contains(level_id) {
            return false;
        }
        self.units_claimed.insert(level_id.to_string());
        if !self.rewards.contains(&reward_id.to_string()) {
            self.rewards.push(reward_id.to_string());
        }
        true
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

pub fn reward_catalog(bank: &Grade1Bank) -> Vec<(String, String, String)> {
    let mut list: Vec<(String, String, String)> = bank
        .units
        .iter()
        .map(|u| {
            (
                u.key.reward_id(),
                format!("{}小星星", u.title),
                u.teacher_subtitle.clone(),
            )
        })
        .collect();
    list.push((
        "ribbon-zh".to_string(),
        "注音緞帶".to_string(),
        "舊版冒險獎勵".to_string(),
    ));
    list.push((
        "cap-pixel".to_string(),
        "像素小帽".to_string(),
        "冒險者紀念配件".to_string(),
    ));
    list
}
