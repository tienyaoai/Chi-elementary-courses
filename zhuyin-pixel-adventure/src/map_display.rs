use crate::map_config::{layer, MapOrientation};

/// 當視窗較短邊 ≥ 此值（CSS px）時，改為整島縮放模式（見 PR／報告說明）。
pub const FIT_WHOLE_MAP_MIN_SIDE_PX: f64 = 700.0;

pub const LETTERBOX_SEA: &'static str = "#3d8ec4";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MapViewMode {
    FollowCamera,
    FitWholeIsland,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FitMetrics {
    pub mode: MapViewMode,
    pub vw: f32,
    pub vh: f32,
    pub scale: f32,
    pub map_w: f32,
    pub map_h: f32,
    pub orient: MapOrientation,
}

pub fn view_mode(vw: f64, vh: f64) -> MapViewMode {
    let min_side = vw.min(vh);
    if min_side >= FIT_WHOLE_MAP_MIN_SIDE_PX {
        MapViewMode::FitWholeIsland
    } else {
        MapViewMode::FollowCamera
    }
}

pub fn orient_for_viewport(vw: f64, vh: f64, mode: MapViewMode) -> MapOrientation {
    match mode {
        MapViewMode::FollowCamera => {
            if vw >= 900.0 {
                MapOrientation::Landscape
            } else {
                MapOrientation::Portrait
            }
        }
        MapViewMode::FitWholeIsland => {
            if vw >= vh {
                MapOrientation::Landscape
            } else {
                MapOrientation::Portrait
            }
        }
    }
}

pub fn fit_metrics(vw: f32, vh: f32, orient: MapOrientation) -> FitMetrics {
    let lay = layer(orient);
    let map_w = lay.width as f32;
    let map_h = lay.height as f32;
    let mode = view_mode(vw as f64, vh as f64);
    let scale = if mode == MapViewMode::FitWholeIsland {
        (vw / map_w).min(vh / map_h).max(0.01)
    } else {
        1.0
    };
    FitMetrics {
        mode,
        vw,
        vh,
        scale,
        map_w,
        map_h,
        orient,
    }
}

pub fn screen_to_world(local_x: f32, local_y: f32, m: &FitMetrics) -> (f32, f32) {
    match m.mode {
        MapViewMode::FollowCamera => (0.0, 0.0), // caller handles camera
        MapViewMode::FitWholeIsland => {
            let wx = (local_x - m.vw / 2.0) / m.scale + m.map_w / 2.0;
            let wy = (local_y - m.vh / 2.0) / m.scale + m.map_h / 2.0;
            (wx, wy)
        }
    }
}

pub fn world_to_screen(wx: f32, wy: f32, m: &FitMetrics) -> (f32, f32) {
    let sx = m.vw / 2.0 + (wx - m.map_w / 2.0) * m.scale;
    let sy = m.vh / 2.0 + (wy - m.map_h / 2.0) * m.scale;
    (sx, sy)
}

/// 角色在 fit 模式下額外放大，使螢幕高度至少 `min_screen_px`。
/// Follow-camera X: keep the map slice inside the viewport (no letterbox void on sides).
pub fn follow_camera_x(hero_x: f32, vw: f32, map_w: f32) -> f32 {
    let half = vw * 0.5;
    if map_w <= vw {
        return map_w * 0.5;
    }
    hero_x.clamp(half, map_w - half)
}

/// Follow-camera Y: lift around hero, then clamp to map vertical bounds.
pub fn follow_camera_y(hero_y: f32, vh: f32, player_h: f32, map_h: f32) -> f32 {
    const LIFT: f32 = 58.0;
    const MARGIN: f32 = 24.0;
    let half = vh * 0.5;
    if map_h <= vh {
        return map_h * 0.5;
    }
    let lo = half;
    let hi = map_h - half;
    let mut cam = hero_y - LIFT;
    let foot_off = hero_y - cam;
    let top_screen = half + foot_off - player_h;
    if top_screen < MARGIN {
        cam = hero_y - (half - MARGIN - player_h);
    }
    let foot_screen = half + (hero_y - cam);
    if foot_screen > vh - MARGIN {
        cam = hero_y - (half - vh + MARGIN);
    }
    cam.clamp(lo, hi)
}

pub fn player_screen_boost(m: &FitMetrics, player_world_h: f32, min_screen_px: f32) -> f32 {
    if m.mode != MapViewMode::FitWholeIsland {
        return 1.0;
    }
    let on_screen = player_world_h * m.scale;
    if on_screen >= min_screen_px {
        1.0
    } else {
        (min_screen_px / on_screen).min(4.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threshold_follow_phone() {
        assert_eq!(view_mode(390.0, 844.0), MapViewMode::FollowCamera);
    }

    #[test]
    fn threshold_fit_tablet() {
        assert_eq!(view_mode(1024.0, 768.0), MapViewMode::FitWholeIsland);
    }

    #[test]
    fn fit_scale_contains_map() {
        let o = MapOrientation::Landscape;
        let m = fit_metrics(1280.0, 800.0, o);
        assert_eq!(m.mode, MapViewMode::FitWholeIsland);
        assert!(m.scale * m.map_w <= 1280.0 + 0.01);
        assert!(m.scale * m.map_h <= 800.0 + 0.01);
    }

    #[test]
    fn player_boost_floor_at_small_scale() {
        let o = MapOrientation::Landscape;
        let m = fit_metrics(1280.0, 720.0, o);
        let boost = player_screen_boost(&m, 110.0, 64.0);
        let on_screen = 110.0 * m.scale * boost;
        assert!(on_screen >= 63.5, "on_screen={on_screen}");
    }

    #[test]
    fn follow_cam_never_exposes_void() {
        let cam = follow_camera_x(1060.0, 390.0, 1080.0);
        assert!((cam - 885.0).abs() < 0.01);
        let cam_c = follow_camera_x(100.0, 430.0, 1080.0);
        assert!((cam_c - 215.0).abs() < 0.01);
        let narrow = follow_camera_x(900.0, 500.0, 400.0);
        assert!((narrow - 200.0).abs() < 0.01);
    }

    fn roundtrip_screen_world() {
        let o = MapOrientation::Portrait;
        let m = fit_metrics(800.0, 700.0, o);
        let (wx, wy) = (540.0, 1200.0);
        let (sx, sy) = world_to_screen(wx, wy, &m);
        let (wx2, wy2) = screen_to_world(sx, sy, &m);
        assert!((wx - wx2).abs() < 0.5);
        assert!((wy - wy2).abs() < 0.5);
    }
}
