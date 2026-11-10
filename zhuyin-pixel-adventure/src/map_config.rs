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
    #[serde(default)]
    pub walk: String,
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

/// Foot position at building door (smaller than landmark anchor).
pub fn door_point(portal: &str, orient: MapOrientation) -> (f32, f32) {
    let lm = landmarks(orient);
    let (x, y) = match portal {
        "chinese" => (lm.chinese.x, lm.chinese.y),
        "english" => (lm.english.x, lm.english.y),
        "math" => (lm.math.x, lm.math.y),
        "treasure" => (lm.treasure.x, lm.treasure.y),
        _ => return (0.0, 0.0),
    };
    let (dx, dy) = match (portal, orient) {
        ("chinese", MapOrientation::Landscape) => (18.0, 72.0),
        ("chinese", MapOrientation::Portrait) => (8.0, 58.0),
        ("english", MapOrientation::Landscape) => (-22.0, 88.0),
        ("english", MapOrientation::Portrait) => (-12.0, 70.0),
        ("math", MapOrientation::Landscape) => (12.0, 78.0),
        ("math", MapOrientation::Portrait) => (6.0, 62.0),
        ("treasure", MapOrientation::Landscape) => (0.0, 42.0),
        ("treasure", MapOrientation::Portrait) => (0.0, 38.0),
        _ => (0.0, 48.0),
    };
    (x as f32 + dx, y as f32 + dy)
}

pub fn door_radius_for(portal: &str) -> f32 {
    match portal {
        "treasure" => 52.0,
        _ => 58.0,
    }
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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

pub fn walk_url(entry: &CharacterEntry) -> String {
    if entry.walk.is_empty() {
        full_url(entry)
    } else {
        format!("/characters/{}", entry.walk)
    }
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

pub fn opposite(orient: MapOrientation) -> MapOrientation {
    match orient {
        MapOrientation::Portrait => MapOrientation::Landscape,
        MapOrientation::Landscape => MapOrientation::Portrait,
    }
}

/// Keep the same relative spot when switching portrait ↔ landscape maps.
pub fn remap_position(x: f32, y: f32, from: MapOrientation, to: MapOrientation) -> (f32, f32) {
    if from == to {
        return (x, y);
    }
    let from_l = layer(from);
    let to_l = layer(to);
    let nx = (x / from_l.width as f32).clamp(0.0, 1.0);
    let ny = (y / from_l.height as f32).clamp(0.0, 1.0);
    (nx * to_l.width as f32, ny * to_l.height as f32)
}

pub fn position_in_bounds(x: f32, y: f32, orient: MapOrientation) -> bool {
    let lay = layer(orient);
    x >= 0.0 && y >= 0.0 && x <= lay.width as f32 && y <= lay.height as f32
}

/// Progress may still hold portrait-space numbers while the window uses landscape art (or the reverse).
/// Map-space coords for the active window orientation (coercion only; no walk-mask check).
pub fn coords_for_orient(x: f32, y: f32, orient: MapOrientation) -> (f32, f32) {
    coerce_player_coords(x, y, orient)
}

pub fn coerce_player_coords(x: f32, y: f32, orient: MapOrientation) -> (f32, f32) {
    let pw = layer(MapOrientation::Portrait).width as f32;
    let lw = layer(MapOrientation::Landscape);
    let lh = lw.height as f32;
    match orient {
        // Portrait-space Y cannot exceed landscape canvas height.
        MapOrientation::Landscape if y > lh + 8.0 => {
            remap_position(x, y, MapOrientation::Portrait, MapOrientation::Landscape)
        }
        MapOrientation::Portrait if x > pw + 8.0 => {
            remap_position(x, y, MapOrientation::Landscape, MapOrientation::Portrait)
        }
        _ => (x, y),
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
        if !ch.walk.is_empty() {
            urls.push(walk_url(ch));
        }
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
    fn coerce_portrait_progress_on_landscape() {
        let (x, y) = coerce_player_coords(309.0, 1502.0, MapOrientation::Landscape);
        assert!(y <= layer(MapOrientation::Landscape).height as f32);
        assert!(x > 400.0);
    }

    #[test]
    fn landmark_and_character_webp_exist() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("static");
        for ch in &config().characters {
            assert!(root.join("characters").join(&ch.bust).is_file(), "{}", ch.bust);
            assert!(root.join("characters").join(&ch.full).is_file(), "{}", ch.full);
            if !ch.walk.is_empty() {
                assert!(
                    root.join("characters").join(&ch.walk).is_file(),
                    "{}",
                    ch.walk
                );
            }
        }
        let lf = &config().landmark_files;
        for name in [&lf.chinese, &lf.english, &lf.math, &lf.treasure] {
            assert!(root.join("landmarks").join(name).is_file());
        }
    }
}
