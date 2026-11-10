use crate::map_config::{self, landmarks, MapOrientation, Point};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Portal {
    Chinese,
    English,
    Math,
    Treasure,
}

pub fn detect_orientation() -> MapOrientation {
    window_size().map(|(w, h)| map_orient(w, h)).unwrap_or(MapOrientation::Portrait)
}

pub fn window_size() -> Option<(f64, f64)> {
    let w = web_sys::window()?;
    let ww = w.inner_width().ok()?.as_f64()?;
    let wh = w.inner_height().ok()?.as_f64()?;
    Some((ww, wh))
}

pub fn map_orient(view_w: f64, view_h: f64) -> MapOrientation {
    use crate::map_display::{orient_for_viewport, view_mode};
    let mode = view_mode(view_w, view_h);
    orient_for_viewport(view_w, view_h, mode)
}

pub fn is_map_fit() -> bool {
    use crate::map_display::{view_mode, MapViewMode};
    window_size()
        .map(|(w, h)| view_mode(w, h) == MapViewMode::FitWholeIsland)
        .unwrap_or(false)
}

/// Near a building landmark (wide) — hints only, not door enter.
pub fn portal_near(px: f32, py: f32, orient: MapOrientation) -> Option<Portal> {
    let lm = landmarks(orient);
    let checks: [(&str, crate::map_config::Point, Portal); 4] = [
        ("chinese", lm.chinese, Portal::Chinese),
        ("english", lm.english, Portal::English),
        ("math", lm.math, Portal::Math),
        ("treasure", lm.treasure, Portal::Treasure),
    ];
    let mut best: Option<(Portal, f32)> = None;
    for (key, pt, portal) in checks {
        let r = map_config::enter_radius_for(key);
        let dx = px - pt.x as f32;
        let dy = py - pt.y as f32;
        let d2 = dx * dx + dy * dy;
        if d2 <= r * r {
            if best.map(|(_, bd2)| d2 < bd2).unwrap_or(true) {
                best = Some((portal, d2));
            }
        }
    }
    best.map(|(p, _)| p)
}

/// At the door — speech-bubble enter prompt.
pub fn portal_at_door(px: f32, py: f32, orient: MapOrientation) -> Option<Portal> {
    let checks: [(&str, Portal); 4] = [
        ("chinese", Portal::Chinese),
        ("english", Portal::English),
        ("math", Portal::Math),
        ("treasure", Portal::Treasure),
    ];
    let mut best: Option<(Portal, f32)> = None;
    for (key, portal) in checks {
        let (dx, dy) = map_config::door_point(key, orient);
        let r = map_config::door_radius_for(key);
        let d2 = (px - dx).powi(2) + (py - dy).powi(2);
        if d2 <= r * r {
            if best.map(|(_, bd)| d2 < bd).unwrap_or(true) {
                best = Some((portal, d2));
            }
        }
    }
    best.map(|(p, _)| p)
}

fn portal_landmark_key(p: Portal) -> &'static str {
    match p {
        Portal::Chinese => "chinese",
        Portal::English => "english",
        Portal::Math => "math",
        Portal::Treasure => "treasure",
    }
}

/// Door zone used for Enter/Space and bubble (slightly forgiving at the exact tile).
pub fn portal_for_door_enter(px: f32, py: f32, orient: MapOrientation) -> Option<Portal> {
    if let Some(p) = portal_at_door(px, py, orient) {
        return Some(p);
    }
    let near = portal_near(px, py, orient)?;
    let key = portal_landmark_key(near);
    let (dx, dy) = map_config::door_point(key, orient);
    let r = map_config::door_radius_for(key) * 1.22;
    let d2 = (px - dx).powi(2) + (py - dy).powi(2);
    if d2 <= r * r {
        return Some(near);
    }
    None
}

pub fn door_enterable(portal: Portal) -> bool {
    matches!(portal, Portal::Chinese | Portal::Treasure)
}

pub fn door_prompt_text(portal: Portal) -> String {
    match portal {
        Portal::Chinese => "進入國語學校？".to_string(),
        Portal::Treasure => "進入寶箱收藏？".to_string(),
        Portal::English => "進入英文燈塔？".to_string(),
        Portal::Math => "進入數學工坊？".to_string(),
    }
}

pub struct GateLabel;

impl GateLabel {
    pub fn name(p: Portal) -> &'static str {
        match p {
            Portal::Chinese => "國語學校",
            Portal::English => "英文燈塔",
            Portal::Math => "數學工坊",
            Portal::Treasure => "寶箱收藏",
        }
    }

    pub fn hint(p: Portal) -> &'static str {
        match p {
            Portal::Chinese => "到國語學校屋前，按「進入」開始答題",
            Portal::English | Portal::Math => "這個地方還在蓋，稍後再來",
            Portal::Treasure => "到寶箱前，按「進入」看收藏",
        }
    }

    pub fn enter_label(p: Portal) -> &'static str {
        match p {
            Portal::Chinese => "進入",
            Portal::Treasure => "進入",
            Portal::English | Portal::Math => "即將開放",
        }
    }
}

pub fn landmark_anchor(pt: &Point) -> (f32, f32) {
    (pt.x as f32, pt.y as f32)
}
