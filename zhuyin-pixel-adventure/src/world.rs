use crate::map_config::{self, landmarks, MapOrientation, Point};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Portal {
    Chinese,
    English,
    Math,
    Treasure,
}

pub fn detect_orientation() -> MapOrientation {
    web_sys::window()
        .and_then(|w| w.inner_width().ok())
        .and_then(|v| v.as_f64())
        .map(|w| {
            if w >= 900.0 {
                MapOrientation::Landscape
            } else {
                MapOrientation::Portrait
            }
        })
        .unwrap_or(MapOrientation::Portrait)
}

pub fn portal_near(px: f32, py: f32, orient: MapOrientation) -> Option<Portal> {
    let lm = landmarks(orient);
    let r = map_config::config().enter_radius as f32;
    let r2 = r * r;
    let checks = [
        (lm.chinese, Portal::Chinese),
        (lm.english, Portal::English),
        (lm.math, Portal::Math),
        (lm.treasure, Portal::Treasure),
    ];
  for (pt, portal) in checks {
        let dx = px - pt.x as f32;
        let dy = py - pt.y as f32;
        if dx * dx + dy * dy <= r2 {
            return Some(portal);
        }
    }
    None
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
