use web_sys::CanvasRenderingContext2d;

use crate::pixel_art_catalog::{lookup, SceneArt};

const OUTLINE: &str = "#1a1a2e";
const BG: &str = "#e8f4ff";
const GRID: i32 = 32;
const SCALE: f64 = 4.0;

pub fn art_supported(desc: &str) -> bool {
    lookup(desc).is_some()
}

pub fn draw_scene(ctx: &CanvasRenderingContext2d, desc: &str, w: f64, h: f64) {
    let Some(art) = lookup(desc) else {
        return;
    };
    ctx.set_image_smoothing_enabled(false);
    ctx.set_fill_style(&BG.into());
    ctx.fill_rect(0.0, 0.0, w, h);
    draw_catalog_sprite(ctx, art, w, h);
}

fn draw_catalog_sprite(ctx: &CanvasRenderingContext2d, art: &SceneArt, w: f64, h: f64) {
    let sprite = GRID as f64 * SCALE;
    let ox = (w - sprite) / 2.0;
    let oy = (h - sprite) / 2.0;
    for y in 0..GRID {
        for x in 0..GRID {
            let idx = (y * GRID + x) as usize;
            let v = art.pixels[idx];
            if v == 0 {
                continue;
            }
            let color = pixel_color(art, v);
            ctx.set_fill_style(&color.into());
            ctx.fill_rect(
                ox + x as f64 * SCALE,
                oy + y as f64 * SCALE,
                SCALE,
                SCALE,
            );
        }
    }
}

fn pixel_color(art: &SceneArt, v: u8) -> &'static str {
    match v {
        1 => OUTLINE,
        2 => art.palette[0],
        3 => art.palette[1],
        4 => art.palette[2],
        _ => OUTLINE,
    }
}
