//! Map hero walk-cycle sprite sheet (4×4 frames, 96×128 px each).

pub const FRAME_W: f32 = 96.0;
pub const FRAME_H: f32 = 128.0;
pub const SHEET_COLS: u8 = 4;
pub const SHEET_ROWS: u8 = 4;
pub const WALK_FPS: f32 = 8.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum WalkFacing {
    Down = 0,
    Left = 1,
    Right = 2,
    Up = 3,
}

impl WalkFacing {
    pub fn row(self) -> u8 {
        self as u8
    }
}

pub fn facing_from_velocity(vx: f32, vy: f32) -> WalkFacing {
    if vx.abs() >= vy.abs() {
        if vx < -0.5 {
            WalkFacing::Left
        } else if vx > 0.5 {
            WalkFacing::Right
        } else if vy < -0.5 {
            WalkFacing::Up
        } else {
            WalkFacing::Down
        }
    } else if vy < -0.5 {
        WalkFacing::Up
    } else if vy > 0.5 {
        WalkFacing::Down
    } else if vx < -0.5 {
        WalkFacing::Left
    } else {
        WalkFacing::Right
    }
}

/// Stable facing while an arrow is held (dominant axis), not from collision-sliced velocity.
pub fn facing_from_axis(dx: f32, dy: f32) -> Option<WalkFacing> {
    let ax = dx.abs();
    let ay = dy.abs();
    if ax < 0.01 && ay < 0.01 {
        return None;
    }
    if ax >= ay {
        if dx < 0.0 {
            Some(WalkFacing::Left)
        } else {
            Some(WalkFacing::Right)
        }
    } else if dy < 0.0 {
        Some(WalkFacing::Up)
    } else {
        Some(WalkFacing::Down)
    }
}

pub fn walk_frame_col(phase: f32, moving: bool) -> u8 {
    if !moving {
        return 0;
    }
    (((phase * WALK_FPS).floor() as u32) % 4) as u8
}

pub fn sprite_sheet_style(url: &str, col: u8, row: u8, w: f32, h: f32, extra_transform: &str) -> String {
    let col = col.min(3);
    let row = row.min(3);
    let bx = -(col as f32) * w;
    let by = -(row as f32) * h;
    let sheet_w = w * SHEET_COLS as f32;
    let sheet_h = h * SHEET_ROWS as f32;
    format!(
        "width:{w}px;height:{h}px;background-image:url({url});background-repeat:no-repeat;\
         background-size:{sheet_w}px {sheet_h}px;background-position:{bx}px {by}px;\
         image-rendering:pixelated;transform-origin:center bottom;transform:{extra_transform};",
        w = w,
        h = h,
        url = url,
        sheet_w = sheet_w,
        sheet_h = sheet_h,
        bx = bx,
        by = by,
        extra_transform = extra_transform,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dominant_axis_facing() {
        assert_eq!(facing_from_velocity(-120.0, 10.0), WalkFacing::Left);
        assert_eq!(facing_from_velocity(5.0, -80.0), WalkFacing::Up);
    }
}
