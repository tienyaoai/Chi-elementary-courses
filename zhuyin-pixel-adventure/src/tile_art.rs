use crate::world::{self, TILE};
use web_sys::CanvasRenderingContext2d;

pub fn draw_tile(ctx: &CanvasRenderingContext2d, tx: usize, ty: usize, t: u8) {
    let x = tx as f64 * TILE as f64;
    let y = ty as f64 * TILE as f64;
    let s = TILE as f64;
    match t {
        0 => draw_grass(ctx, x, y, s, tx, ty),
        2 => draw_path(ctx, x, y, s, tx, ty),
        1 => draw_rock(ctx, x, y, s),
        6 => draw_tree(ctx, x, y, s),
        7 => draw_water(ctx, x, y, s, tx, ty),
        8 => draw_flower(ctx, x, y, s),
        3 => draw_school(ctx, x, y, s),
        4 => draw_lighthouse(ctx, x, y, s, true),
        5 => draw_workshop(ctx, x, y, s, true),
        _ => draw_grass(ctx, x, y, s, tx, ty),
    }
}

fn draw_grass(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    let base = if (tx + ty) % 2 == 0 { "#7ad84f" } else { "#6ecc45" };
    ctx.set_fill_style(&base.into());
    ctx.fill_rect(x, y, s, s);
    ctx.set_fill_style(&"#5bb83a".into());
    let dots = [(4.0, 6.0), (14.0, 16.0), (18.0, 8.0)];
    for (dx, dy) in dots {
        if (tx + ty + dx as usize) % 3 == 0 {
            ctx.fill_rect(x + dx, y + dy, 2.0, 2.0);
        }
    }
}

fn draw_path(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    ctx.set_fill_style(&"#e8c878".into());
    ctx.fill_rect(x, y, s, s);
    ctx.set_fill_style(&"#d4ae62".into());
    for i in 0..3 {
        let px = x + 4.0 + (i as f64) * 6.0 + ((tx + ty + i) % 2) as f64;
        let py = y + 8.0 + ((tx + i) % 3) as f64 * 4.0;
        ctx.fill_rect(px, py, 4.0, 3.0);
    }
}

fn draw_rock(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64) {
    ctx.set_fill_style(&"#5a4a3a".into());
    ctx.fill_rect(x, y, s, s);
    ctx.set_fill_style(&"#6d5d4d".into());
    ctx.fill_rect(x + 2.0, y + 2.0, s - 4.0, s - 6.0);
}

fn draw_tree(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64) {
    draw_grass(ctx, x, y, s, 0, 0);
    ctx.set_fill_style(&"#6b3e1e".into());
    ctx.fill_rect(x + s / 2.0 - 3.0, y + 14.0, 6.0, 10.0);
    ctx.set_fill_style(&"#2d8a3e".into());
    ctx.fill_rect(x + 4.0, y + 4.0, s - 8.0, 12.0);
    ctx.set_fill_style(&"#3dac4a".into());
    ctx.fill_rect(x + 6.0, y + 2.0, s - 12.0, 8.0);
}

fn draw_water(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, tx: usize, ty: usize) {
    let shade = if (tx + ty) % 2 == 0 { "#4fa8e8" } else { "#3d96d8" };
    ctx.set_fill_style(&shade.into());
    ctx.fill_rect(x, y, s, s);
    ctx.set_fill_style(&"#7ec8ff".into());
    let wave = ((tx + ty) % 4) as f64 * 3.0;
    ctx.fill_rect(x + 2.0, y + 10.0 + wave, s - 4.0, 2.0);
}

fn draw_flower(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64) {
    draw_grass(ctx, x, y, s, 0, 0);
    ctx.set_fill_style(&"#ff6b9d".into());
    ctx.fill_rect(x + 10.0, y + 10.0, 4.0, 4.0);
    ctx.set_fill_style(&"#ffe066".into());
    ctx.fill_rect(x + 11.0, y + 11.0, 2.0, 2.0);
}

fn draw_school(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64) {
    draw_path(ctx, x, y, s, 0, 0);
    ctx.set_fill_style(&"#f5f5f5".into());
    ctx.fill_rect(x + 2.0, y + 8.0, s - 4.0, s - 10.0);
    ctx.set_fill_style(&"#e85c4a".into());
    ctx.fill_rect(x + 2.0, y + 3.0, s - 4.0, 7.0);
    ctx.set_fill_style(&"#8b4513".into());
    ctx.fill_rect(x + 9.0, y + 12.0, 6.0, 10.0);
    ctx.set_fill_style(&"#ffd15a".into());
    ctx.fill_rect(x + 4.0, y + 11.0, 4.0, 4.0);
}

fn draw_lighthouse(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, locked: bool) {
    draw_path(ctx, x, y, s, 0, 0);
    let body = if locked { "#a8b4c8" } else { "#dfe8f8" };
    ctx.set_fill_style(&body.into());
    ctx.fill_rect(x + 7.0, y + 6.0, 10.0, s - 8.0);
    ctx.set_fill_style(&"#6a7a90".into());
    ctx.fill_rect(x + 5.0, y + 4.0, 14.0, 5.0);
    if locked {
        ctx.set_fill_style(&"#fff".into());
        ctx.fill_rect(x + 10.0, y + 12.0, 4.0, 5.0);
    }
}

fn draw_workshop(ctx: &CanvasRenderingContext2d, x: f64, y: f64, s: f64, locked: bool) {
    draw_path(ctx, x, y, s, 0, 0);
    ctx.set_fill_style(&"#c9a0dc".into());
    ctx.fill_rect(x + 3.0, y + 10.0, s - 6.0, s - 12.0);
    ctx.set_fill_style(&"#9b6ec4".into());
    ctx.fill_rect(x + 3.0, y + 5.0, s - 6.0, 7.0);
    if locked {
        ctx.set_fill_style(&"#ffeb3b".into());
        ctx.fill_rect(x + 10.0, y + 13.0, 4.0, 4.0);
    }
}

pub fn draw_all(ctx: &CanvasRenderingContext2d) {
    for ty in 0..world::MAP_H {
        for tx in 0..world::MAP_W {
            let t = world::tile_at(tx as i32, ty as i32);
            draw_tile(ctx, tx, ty, t);
        }
    }
}
