use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Clone, Debug, Deserialize)]
pub struct MapLayer {
    pub src: String,
    pub width: u32,
    pub height: u32,
    pub walk: String,
    pub step: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
    #[serde(default)]
    pub x_norm: f32,
    #[serde(default)]
    pub y_norm: f32,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct CharacterEntry {
    pub id: String,
    pub slug: String,
    pub bust: String,
    pub full: String,
    pub short: String,
    #[serde(default)]
    pub zhuyin: String,
    #[serde(default)]
    pub gender: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct WalkRect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MapConfigFile {
    pub portrait: MapLayer,
    pub landscape: MapLayer,
    pub spawn_portrait: Point,
    pub spawn_landscape: Point,
    pub landmarks_portrait: Landmarks,
    pub landmarks_landscape: Landmarks,
    pub landmark_files: LandmarkFiles,
    pub characters: Vec<CharacterEntry>,
    pub enter_radius: u32,
    #[serde(default)]
    pub enter_radius_by_portal: EnterRadiusByPortal,
    #[serde(default)]
    pub walk_overrides_portrait: Vec<WalkRect>,
    #[serde(default)]
    pub walk_overrides_landscape: Vec<WalkRect>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Landmarks {
    pub chinese: Point,
    pub english: Point,
    pub math: Point,
    pub treasure: Point,
}

#[derive(Clone, Debug, Deserialize, Default)]
pub struct EnterRadiusByPortal {
    #[serde(default = "default_enter_chinese")]
    pub chinese: u32,
    #[serde(default = "default_enter_building")]
    pub english: u32,
    #[serde(default = "default_enter_building")]
    pub math: u32,
    #[serde(default = "default_enter_treasure")]
    pub treasure: u32,
}

fn default_enter_chinese() -> u32 {
    140
}
fn default_enter_building() -> u32 {
    120
}
fn default_enter_treasure() -> u32 {
    88
}

pub fn enter_radius_for(portal: &str) -> f32 {
    let c = config();
    let r = match portal {
        "chinese" => c.enter_radius_by_portal.chinese,
        "english" => c.enter_radius_by_portal.english,
        "math" => c.enter_radius_by_portal.math,
        "treasure" => c.enter_radius_by_portal.treasure,
        _ => c.enter_radius,
    };
    if r == 0 {
        c.enter_radius as f32
    } else {
        r as f32
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct LandmarkFiles {
    pub chinese: String,
    pub english: String,
    pub math: String,
    pub treasure: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum MapOrientation {
    Portrait,
    Landscape,
}

pub fn config() -> &'static MapConfigFile {
    static CFG: OnceLock<MapConfigFile> = OnceLock::new();
    CFG.get_or_init(|| {
        serde_json::from_str(include_str!("map_config.json")).expect("map_config.json")
    })
}

pub fn character_by_id(id: &str) -> Option<CharacterEntry> {
    let cfg = config();
    cfg.characters
        .iter()
        .find(|c| c.id == id)
        .cloned()
        .or_else(|| cfg.characters.first().cloned())
}

pub fn character_display_name(id: &str) -> String {
    character_by_id(id)
        .map(|c| c.short.clone())
        .unwrap_or_else(|| "夥伴".to_string())
}

pub fn bust_url(entry: &CharacterEntry) -> String {
    format!("/characters/{}", entry.bust)
}

pub fn full_url(entry: &CharacterEntry) -> String {
    format!("/characters/{}", entry.full)
}

pub fn landmark_url(key: &str) -> String {
    let f = config().landmark_files.clone();
    let name = match key {
        "chinese" => f.chinese,
        "english" => f.english,
        "math" => f.math,
        "treasure" => f.treasure,
        _ => return String::new(),
    };
    format!("/landmarks/{name}")
}

pub fn layer(orient: MapOrientation) -> &'static MapLayer {
    let c = config();
    match orient {
        MapOrientation::Portrait => &c.portrait,
        MapOrientation::Landscape => &c.landscape,
    }
}

pub fn spawn(orient: MapOrientation) -> (f32, f32) {
    let c = config();
    match orient {
        MapOrientation::Portrait => (c.spawn_portrait.x as f32, c.spawn_portrait.y as f32),
        MapOrientation::Landscape => (c.spawn_landscape.x as f32, c.spawn_landscape.y as f32),
    }
}

pub fn walk_overrides(orient: MapOrientation) -> &'static [WalkRect] {
    let c = config();
    match orient {
        MapOrientation::Portrait => &c.walk_overrides_portrait,
        MapOrientation::Landscape => &c.walk_overrides_landscape,
    }
}

pub fn landmarks(orient: MapOrientation) -> &'static Landmarks {
    let c = config();
    match orient {
        MapOrientation::Portrait => &c.landmarks_portrait,
        MapOrientation::Landscape => &c.landmarks_landscape,
    }
}

pub fn migrate_character_id(id: &str) -> String {
    match id {
        "xiaozhu" => "char1".to_string(),
        "xiaolan" => "char2".to_string(),
        "xiaofen" => "char3".to_string(),
        other => other.to_string(),
    }
}

pub fn preload_urls() -> Vec<String> {
    let c = config();
    let mut urls = vec![
        c.portrait.src.clone(),
        c.landscape.src.clone(),
        format!("/island/{}", c.portrait.walk),
        format!("/island/{}", c.landscape.walk),
        landmark_url("chinese"),
        landmark_url("english"),
        landmark_url("math"),
        landmark_url("treasure"),
    ];
    for ch in &c.characters {
        urls.push(bust_url(ch));
        urls.push(full_url(ch));
    }
    urls
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn config_has_twelve_characters() {
        assert_eq!(config().characters.len(), 12);
    }

    #[test]
    fn island_assets_on_disk() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("static");
        let c = config();
        assert!(root.join(c.portrait.src.trim_start_matches('/')).is_file());
        assert!(root.join(c.landscape.src.trim_start_matches('/')).is_file());
        assert!(root.join("island").join(&c.portrait.walk).is_file());
        assert!(root.join("island").join(&c.landscape.walk).is_file());
    }

    #[test]
    fn landmark_and_character_webp_exist() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("static");
        for ch in &config().characters {
            assert!(root.join("characters").join(&ch.bust).is_file(), "{}", ch.bust);
            assert!(root.join("characters").join(&ch.full).is_file(), "{}", ch.full);
        }
        let lf = &config().landmark_files;
        for name in [&lf.chinese, &lf.english, &lf.math, &lf.treasure] {
            assert!(root.join("landmarks").join(name).is_file());
        }
    }
}
