use crate::world::{self, TILE};
use web_sys::CanvasRenderingContext2d;

pub fn draw_tile(ctx: &CanvasRenderingContext2d, tx: usize, ty: usize, t: u8) {
    let x = tx as f64 * TILE as f64;
    let y = ty as f64 * TILE as f64;
    let s = TILE as f64;
    match t {
        0 => draw_grass(ctx, x, y, s, tx, ty),
        2 => draw_path(ctx, x, y, s, tx, ty),
        1 => draw_rock(ctx, x, y, s, tx, ty),
        6 => draw_tree(ctx, x, y, s, tx, ty),
        7 => draw_water(ctx, x, y, s, tx, ty),
        8 => draw_flower(ctx, x, y, s, tx, ty),
        9 => draw_bridge(ctx, x, y, s, tx, ty),
        3 => draw_school(ctx, x, y, s, tx, ty),
        4 => draw_lighthouse(ctx, x, y, s, tx, ty, true),
        5 => draw_workshop(ctx, x, y, s, tx, ty, true),
        _ => draw_grass(ctx, x, y, s, tx, ty),
    }
    draw_shore_overlay(ctx, x, y, s, tx as i32, ty as i32, t);
}

fn neighbor(tx: i32, ty: i32) -> u8 {
    world::tile_at(tx, ty)
}

fn is_land(t: u8) -> bool {
    matches!(t, 0 | 2 | 3 | 4 | 5 | 6 | 8 | 9)
}

fn draw_shore_overlay(
    ctx: &CanvasRenderingContext2d,
    x: f64,
    y: f64,
    s: f64,
    tx: i32,
    ty: i32,
    self_t: u8,
) {
    if self_t != 7 {
        return;
    }
  let mut shore = false;
    for (dx, dy) in [(0, 1), (0, -1), (1, 0), (-1, 0)] {
        let nt = neighbor(tx + dx, ty + dy);
        if is_land(nt) {
            shore = true;
            break;
        }
    }
    if !shore {
        return;
    }
    ctx.set_fill_style(&"#b8f0a8".into());
    ctx.fill_rect(x + 1.0, y + s - 5.0, s - 2.0, 4.0);
    ctx.set_fill_style(&"#f5ffe8".into());
    for i in 0..3i32 {
        let px = x + 4.0 + (i * 7) as f64;
        ctx.fill_rect(px, y + s - 6.0, 3.0, 2.0);
    }
}

fn draw_grass(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    let base = if (tx + ty) % 2 == 0 { "#7ad84f" } else { "#6ecc45" };
    ctx.set_fill_style(&base.into());
    ctx.fill_rect(x, y, s, s);
    ctx.set_fill_style(&"#5bb83a".into());
    let patches = [(3.0, 5.0, 3.0, 2.0), (s - 8.0, s - 7.0, 4.0, 2.0)];
    for (px, py, pw, ph) in patches {
        if (tx + ty + px as usize) % 2 == 0 {
            ctx.fill_rect(x + px, y + py, pw, ph);
        }
    }
    if (tx * 3 + ty) % 5 == 0 {
        ctx.set_fill_style(&"#8ae85a".into());
        ctx.fill_rect(x + s / 2.0 - 1.0, y + 2.0, 2.0, 4.0);
    }
}

fn draw_path(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    ctx.set_fill_style(&"#e8c878".into());
    ctx.fill_rect(x, y, s, s);
    ctx.set_fill_style(&"#d4ae62".into());
    let n = (s / 8.0) as i32;
    for i in 0..n {
        let px = x + 3.0 + (i as f64) * 7.0 + ((tx + ty + i as usize) % 2) as f64;
        let py = y + 6.0 + ((tx + i as usize) % 3) as f64 * 5.0;
        ctx.fill_rect(px, py, 5.0, 4.0);
    }
    ctx.set_fill_style(&"#c49a52".into());
    ctx.fill_rect(x, y + s - 2.0, s, 2.0);
}

fn draw_rock(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    let water_below = neighbor(tx as i32, ty as i32 + 1) == 7;
    if water_below && neighbor(tx as i32 + 1, ty as i32) == 2 {
        draw_bridge(ctx, x, y, s, tx, ty);
        return;
    }
    ctx.set_fill_style(&"#4a3d32".into());
    ctx.fill_rect(x, y, s, s);
    ctx.set_fill_style(&"#6d5d4d".into());
    ctx.fill_rect(x + 2.0, y + 2.0, s - 4.0, s - 8.0);
    ctx.set_fill_style(&"#3e3228".into());
    for bx in [4.0, s - 10.0] {
        ctx.fill_rect(x + bx, y + 4.0, 6.0, s - 6.0);
    }
}

fn draw_bridge(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    let _ = (tx, ty);
    draw_water(ctx, x, y, s, 0, 0);
    ctx.set_fill_style(&"#a86b3a".into());
    ctx.fill_rect(x + 1.0, y + 6.0, s - 2.0, s - 12.0);
    ctx.set_fill_style(&"#8b5529".into());
    for off in [2.0, s - 6.0] {
        ctx.fill_rect(x + off, y + 5.0, 3.0, s - 10.0);
    }
    ctx.set_fill_style(&"#c4884a".into());
    ctx.fill_rect(x + 1.0, y + s / 2.0 - 2.0, s - 2.0, 4.0);
    ctx.set_fill_style(&"#5d8a48".into());
    ctx.fill_rect(x + 3.0, y + 3.0, s - 6.0, 3.0);
    ctx.fill_rect(x + 3.0, y + s - 6.0, s - 6.0, 3.0);
}

fn draw_tree(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    draw_grass(ctx, x, y, s, tx, ty);
    ctx.set_fill_style(&"#00000022".into());
    ctx.fill_rect(x + s * 0.22, y + s - 4.0, s * 0.56, 3.0);
    ctx.set_fill_style(&"#5c3818".into());
    ctx.fill_rect(x + s / 2.0 - 4.0, y + s * 0.45, 8.0, s * 0.48);
    ctx.set_fill_style(&"#6f4520".into());
    ctx.fill_rect(x + s / 2.0 - 3.0, y + s * 0.5, 6.0, s * 0.4);
    let crown = if (tx + ty) % 2 == 0 { "#2d8a3e" } else { "#267a36" };
    ctx.set_fill_style(&crown.into());
    ctx.fill_rect(x + 3.0, y + 3.0, s - 6.0, s * 0.38);
    ctx.set_fill_style(&"#3dac4a".into());
    ctx.fill_rect(x + 5.0, y + 1.0, s - 10.0, s * 0.22);
    ctx.set_fill_style(&"#45c258".into());
    ctx.fill_rect(x + s * 0.25, y + s * 0.15, s * 0.5, s * 0.2);
}

fn draw_water(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    let shade = if (tx + ty) % 2 == 0 { "#4fa8e8" } else { "#3d96d8" };
    ctx.set_fill_style(&shade.into());
    ctx.fill_rect(x, y, s, s);
    ctx.set_fill_style(&"#7ec8ff".into());
    let wave = ((tx + ty) % 4) as f64 * 2.5;
    ctx.fill_rect(x + 2.0, y + 8.0 + wave, s - 4.0, 2.0);
    ctx.fill_rect(x + 6.0, y + 16.0 + wave * 0.5, s - 10.0, 2.0);
    ctx.set_fill_style(&"#ffffff55".into());
    ctx.fill_rect(x + ((tx + 1) % 3) as f64 * 5.0 + 2.0, y + 4.0, 3.0, 2.0);
}

fn draw_flower(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    draw_grass(ctx, x, y, s, tx, ty);
    ctx.set_fill_style(&"#3a9e3a".into());
    ctx.fill_rect(x + s / 2.0 - 1.0, y + s * 0.5, 2.0, s * 0.35);
    for (dx, dy, col) in [
        (0.0, -6.0, "#ff6b9d"),
        (-5.0, 0.0, "#ff8fbd"),
        (5.0, 0.0, "#ff8fbd"),
        (0.0, 5.0, "#ff8fbd"),
    ] {
        ctx.set_fill_style(&col.into());
        ctx.fill_rect(x + s / 2.0 + dx - 2.0, y + s / 2.0 + dy - 2.0, 4.0, 4.0);
    }
    ctx.set_fill_style(&"#ffe066".into());
    ctx.fill_rect(x + s / 2.0 - 2.0, y + s / 2.0 - 2.0, 4.0, 4.0);
}

fn draw_school(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    if world::tile_at(tx as i32 - 1, ty as i32) == 3 {
        return;
    }
    draw_path(ctx, x, y, s, tx, ty);
    let twin = world::tile_at(tx as i32 + 1, ty as i32) == 3;
    let w = if twin { s * 2.0 } else { s };
    ctx.set_fill_style(&"#f8f4ef".into());
    ctx.fill_rect(x + 2.0, y + 10.0, w - 4.0, s - 12.0);
    ctx.set_fill_style(&"#e85c4a".into());
    ctx.fill_rect(x + 1.0, y + 3.0, w - 2.0, 9.0);
    ctx.set_fill_style(&"#cf4538".into());
    ctx.fill_rect(x + w / 2.0 - 1.0, y + 2.0, 2.0, 3.0);
    ctx.set_fill_style(&"#8b4513".into());
    ctx.fill_rect(x + (if twin { s * 0.55 } else { s * 0.35 }), y + 14.0, s * 0.28, s - 16.0);
    ctx.set_fill_style(&"#6eb5ff".into());
    let mut wins = vec![s * 0.15];
    if twin {
        wins.push(s * 1.1);
    }
    for wx in wins {
        ctx.fill_rect(x + wx, y + 13.0, 7.0, 7.0);
        ctx.set_stroke_style(&"#5a4030".into());
        ctx.stroke_rect(x + wx, y + 13.0, 7.0, 7.0);
    }
    ctx.set_fill_style(&"#ffd15a".into());
    ctx.fill_rect(x + 4.0, y + 12.0, 9.0, 7.0);
    ctx.set_fill_style(&"#fff".into());
    ctx.fill_rect(x + s * (if twin { 0.72 } else { 0.38 }) - 2.0, y + 7.0, 10.0, 8.0);
    ctx.set_fill_style(&"#c0392b".into());
    ctx.fill_rect(x + s * (if twin { 0.72 } else { 0.38 }), y + 8.0, 2.0, 6.0);
    ctx.fill_rect(x + s * (if twin { 0.72 } else { 0.38 }) + 5.0, y + 8.0, 2.0, 6.0);
}

fn draw_lighthouse(
    ctx: &CanvasRenderingContext2d,
    x: f64,
    y: f64,
    s: f64,
    tx: usize,
    ty: usize,
    locked: bool,
) {
    let _ = (tx, ty);
    draw_grass(ctx, x, y, s, tx, ty);
    ctx.set_fill_style(&"#dfe8f0".into());
    ctx.fill_rect(x + s * 0.3, y + 6.0, s * 0.4, s - 8.0);
    for stripe in 0..4 {
        let sy = y + 8.0 + stripe as f64 * 5.0;
        ctx.set_fill_style(&if stripe % 2 == 0 { "#c44d4d" } else { "#f5f5f5" }.into());
        ctx.fill_rect(x + s * 0.32, sy, s * 0.36, 4.0);
    }
    ctx.set_fill_style(&"#6a7a90".into());
    ctx.fill_rect(x + s * 0.24, y + 4.0, s * 0.52, 5.0);
    ctx.set_fill_style(&"#ffec80".into());
    ctx.fill_rect(x + s * 0.34, y + 5.0, s * 0.32, 3.0);
    if locked {
        ctx.set_fill_style(&"#8899aa".into());
        ctx.fill_rect(x + s * 0.38, y + s * 0.35, s * 0.24, s * 0.2);
        ctx.set_fill_style(&"#fff".into());
        ctx.fill_rect(x + s * 0.44, y + s * 0.42, 3.0, 5.0);
    }
    ctx.set_fill_style(&"#2a4a8a".into());
    ctx.fill_rect(x + s * 0.38, y + s * 0.58, s * 0.22, 6.0);
}

fn draw_workshop(
    ctx: &CanvasRenderingContext2d,
    x: f64,
    y: f64,
    s: f64,
    tx: usize,
    ty: usize,
    locked: bool,
) {
    let _ = (tx, ty);
    draw_grass(ctx, x, y, s, tx, ty);
    ctx.set_fill_style(&"#c9a0dc".into());
    ctx.fill_rect(x + 4.0, y + s * 0.42, s - 8.0, s * 0.5);
    ctx.set_fill_style(&"#9b6ec4".into());
    ctx.fill_rect(x + 3.0, y + s * 0.28, s - 6.0, s * 0.18);
    ctx.set_fill_style(&"#5a4678".into());
    ctx.fill_rect(x + s * 0.38, y + 8.0, s * 0.2, s * 0.35);
    if locked {
        ctx.set_fill_style(&"#ffeb3b".into());
        ctx.fill_rect(x + s * 0.38, y + s * 0.48, 8.0, 6.0);
    }
    ctx.set_fill_style(&"#fff".into());
    ctx.fill_rect(x + s * 0.22, y + s * 0.48, 5.0, 4.0);
    ctx.set_fill_style(&"#c9a0dc".into());
    ctx.fill_rect(x + s * 0.24, y + s * 0.5, 1.0, 2.0);
    ctx.fill_rect(x + s * 0.26, y + s * 0.5, 1.0, 2.0);
}

pub fn draw_all(ctx: &CanvasRenderingContext2d) {
    for ty in 0..world::MAP_H {
        for tx in 0..world::MAP_W {
            let t = world::tile_at(tx as i32, ty as i32);
            draw_tile(ctx, tx, ty, t);
        }
    }
}
