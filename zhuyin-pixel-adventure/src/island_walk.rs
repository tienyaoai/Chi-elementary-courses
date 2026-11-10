use crate::map_config::{layer, walk_blocked, walk_overrides, MapOrientation};
use gloo_net::http::Request;
use std::cell::RefCell;

#[derive(Clone)]
pub struct WalkMask {
    mw: u32,
    mh: u32,
    step: u32,
    bits: Vec<u8>,
}

impl WalkMask {
    fn from_bytes(data: &[u8]) -> Option<Self> {
        if data.len() < 8 {
            return None;
        }
        let mw = u32::from_le_bytes(data[0..4].try_into().ok()?);
        let mh = u32::from_le_bytes(data[4..8].try_into().ok()?);
        let bits = data[8..].to_vec();
        let step = 4;
        Some(Self { mw, mh, step, bits })
    }

    fn sample(&self, x: f32, y: f32) -> bool {
        let mx = (x / self.step as f32).floor() as i32;
        let my = (y / self.step as f32).floor() as i32;
        if mx < 0 || my < 0 {
            return false;
        }
        let mx = mx as u32;
        let my = my as u32;
        if mx >= self.mw || my >= self.mh {
            return false;
        }
        let i = (my * self.mw + mx) as usize;
        self.bits.get(i / 8).map(|b| b & (1 << (i % 8)) != 0).unwrap_or(false)
    }

    fn too_close_to_water(&self, x: f32, y: f32) -> bool {
        const BUF: f32 = 16.0;
        let cardinals = [(BUF, 0.0), (-BUF, 0.0), (0.0, BUF), (0.0, -BUF)];
        let mut water_hits = 0u8;
        for (dx, dy) in cardinals {
            if !self.sample(x + dx, y + dy) {
                water_hits += 1;
            }
        }
        if !self.sample(x, y) {
            return true;
        }
        water_hits >= 3
    }

    pub fn can_stand(&self, x: f32, y: f32, orient: MapOrientation) -> bool {
        if walk_block_rect(x, y, orient) {
            return false;
        }
        if walk_override(x, y, orient) {
            return true;
        }
        let points = [
            (0.0, 0.0),
            (-10.0, 0.0),
            (10.0, 0.0),
            (0.0, -12.0),
            (0.0, 12.0),
            (-8.0, 8.0),
            (8.0, 8.0),
        ];
        points.iter().all(|(dx, dy)| {
            let px = x + dx;
            let py = y + dy;
            if walk_block_rect(px, py, orient) {
                return false;
            }
            if orient == MapOrientation::Portrait && self.too_close_to_water(px, py) {
                return false;
            }
            if walk_override(px, py, orient) {
                return true;
            }
            self.sample(px, py)
        })
    }
}

fn walk_override(x: f32, y: f32, orient: MapOrientation) -> bool {
    walk_overrides(orient).iter().any(|r| {
        x >= r.x as f32
            && x <= (r.x + r.w) as f32
            && y >= r.y as f32
            && y <= (r.y + r.h) as f32
    })
}

fn walk_block_rect(x: f32, y: f32, orient: MapOrientation) -> bool {
    walk_blocked(orient).iter().any(|r| {
        x >= r.x as f32
            && x <= (r.x + r.w) as f32
            && y >= r.y as f32
            && y <= (r.y + r.h) as f32
    })
}

thread_local! {
    static PORTRAIT: RefCell<Option<WalkMask>> = RefCell::new(None);
    static LANDSCAPE: RefCell<Option<WalkMask>> = RefCell::new(None);
}

pub async fn init_masks() {
    let p_url = format!("/island/{}", layer(MapOrientation::Portrait).walk);
    let l_url = format!("/island/{}", layer(MapOrientation::Landscape).walk);
    if let Ok(resp) = Request::get(&p_url).send().await {
        if let Ok(bytes) = resp.binary().await {
            if let Some(mask) = WalkMask::from_bytes(&bytes) {
                PORTRAIT.with(|c| *c.borrow_mut() = Some(mask));
            }
        }
    }
    if let Ok(resp) = Request::get(&l_url).send().await {
        if let Ok(bytes) = resp.binary().await {
            if let Some(mask) = WalkMask::from_bytes(&bytes) {
                LANDSCAPE.with(|c| *c.borrow_mut() = Some(mask));
            }
        }
    }
}

pub fn masks_ready() -> bool {
    PORTRAIT.with(|p| p.borrow().is_some()) && LANDSCAPE.with(|l| l.borrow().is_some())
}

pub fn can_stand(x: f32, y: f32, orient: MapOrientation) -> bool {
    let ok = match orient {
        MapOrientation::Portrait => PORTRAIT.with(|c| c.borrow().as_ref().map(|m| m.can_stand(x, y, orient))),
        MapOrientation::Landscape => LANDSCAPE.with(|c| c.borrow().as_ref().map(|m| m.can_stand(x, y, orient))),
    };
    ok.unwrap_or(true)
}

pub fn clamp_to_map(x: f32, y: f32, orient: MapOrientation) -> (f32, f32) {
    let lay = layer(orient);
    let w = lay.width as f32;
    let h = lay.height as f32;
    (x.clamp(24.0, w - 24.0), y.clamp(24.0, h - 24.0))
}
