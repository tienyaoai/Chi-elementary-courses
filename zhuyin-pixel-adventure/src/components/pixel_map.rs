use crate::input::Dir;
use crate::sprites::{color_index, find_character, pixel_grid, CANVAS_H, CANVAS_W, PIX_H, PIX_W};
use crate::world::{self, Portal, TILE};
use gloo::timers::callback::Interval;
use wasm_bindgen::JsCast;
use web_sys::CanvasRenderingContext2d;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct PixelMapProps {
    pub character_id: String,
    pub px: f32,
    pub py: f32,
    pub frame: u8,
    pub hint: Option<String>,
    pub portal_near: Option<Portal>,
    pub on_enter: Callback<Portal>,
}

#[function_component(PixelMap)]
pub fn pixel_map(props: &PixelMapProps) -> Html {
    let canvas_ref = use_node_ref();

    {
        let canvas_ref = canvas_ref.clone();
        let character_id = props.character_id.clone();
        let px = props.px;
        let py = props.py;
        let frame = props.frame;
        use_effect_with((px, py, frame, character_id), move |deps| {
            let (px, py, frame, character_id) = deps.clone();
            draw_map(&canvas_ref, &character_id, px, py, frame);
            || ()
        });
    }

    html! {
        <div class="map-wrap">
            <canvas ref={canvas_ref} class="pixel-canvas" width={CANVAS_W.to_string()} height={CANVAS_H.to_string()} />
            if let Some(h) = &props.hint {
                <p class="map-hint"><span class="pixel-label">{ h }</span></p>
            }
            if let Some(portal) = props.portal_near {
                <button type="button" class="enter-btn pixel-btn"
                    onclick={Callback::from({
                        let on_enter = props.on_enter.clone();
                        move |_| on_enter.emit(portal)
                    })}>
                    { "進入" }
                </button>
            }
        </div>
    }
}

fn draw_map(canvas_ref: &NodeRef, character_id: &str, px: f32, py: f32, frame: u8) {
    let Some(canvas) = canvas_ref.cast::<web_sys::HtmlCanvasElement>() else {
        return;
    };
    let Some(ctx) = canvas
        .get_context("2d")
        .ok()
        .flatten()
        .and_then(|c| c.dyn_into::<CanvasRenderingContext2d>().ok())
    else {
        return;
    };
    ctx.set_image_smoothing_enabled(false);
    for ty in 0..world::MAP_H {
        for tx in 0..world::MAP_W {
            let t = world::tile_at(tx as i32, ty as i32);
            let color = match t {
                0 => "#6fbf4a",
                1 => "#4a6741",
                2 => "#8ed56a",
                3 => "#e86a3c",
                4 => "#7a8ea3",
                5 => "#7a8ea3",
                _ => "#000",
            };
            ctx.set_fill_style(&color.into());
            let txf = tx as f64 * TILE as f64;
            let tyf = ty as f64 * TILE as f64;
            let sz = TILE as f64;
            ctx.fill_rect(txf, tyf, sz, sz);
            if t == 3 {
                ctx.set_fill_style(&"#fff".into());
                ctx.fill_rect(txf + 4.0, tyf + 4.0, sz - 8.0, sz - 8.0);
                ctx.set_fill_style(&"#c44".into());
                ctx.fill_text("語", txf + 3.0, tyf + 12.0).ok();
            }
            if t == 4 || t == 5 {
                ctx.set_fill_style(&"#dde".into());
                ctx.fill_rect(txf + 3.0, tyf + 3.0, sz - 6.0, sz - 6.0);
            }
        }
    }
    draw_player(&ctx, character_id, px, py, frame);
}

fn draw_player(ctx: &CanvasRenderingContext2d, character_id: &str, px: f32, py: f32, frame: u8) {
    let ch = find_character(character_id);
    let grid = pixel_grid(character_id);
    let ox = px as f64 * TILE as f64 + TILE as f64 / 2.0 - PIX_W as f64 / 2.0;
    let oy =
        py as f64 * TILE as f64 + TILE as f64 - PIX_H as f64 - if frame % 2 == 1 { 1.0 } else { 0.0 };
    let bytes = grid.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if i >= PIX_W * PIX_H {
            break;
        }
        let digit = b.wrapping_sub(b'0');
        if digit == 0 {
            continue;
        }
        let x = i % PIX_W;
        let y = i / PIX_W;
        ctx.set_fill_style(&color_index(&ch.palette, digit).into());
        ctx.fill_rect(ox + x as f64, oy + y as f64, 1.0, 1.0);
    }
}

#[derive(Properties, PartialEq)]
pub struct TouchPadProps {
    pub on_dir: Callback<Dir>,
}

#[function_component(TouchPad)]
pub fn touch_pad(props: &TouchPadProps) -> Html {
    let emit = |d: Dir| {
        let cb = props.on_dir.clone();
        Callback::from(move |_| cb.emit(d))
    };
    html! {
        <div class="touch-pad" aria-label="方向控制">
            <button type="button" class="pad-btn" onclick={emit(Dir::Up)}>{"▲"}</button>
            <div class="pad-row">
                <button type="button" class="pad-btn" onclick={emit(Dir::Left)}>{"◀"}</button>
                <button type="button" class="pad-btn" onclick={emit(Dir::Down)}>{"▼"}</button>
                <button type="button" class="pad-btn" onclick={emit(Dir::Right)}>{"▶"}</button>
            </div>
        </div>
    }
}

pub fn bind_walk_tick(on_tick: Callback<()>) {
    use_effect_with((), move |_| {
        let handle = Interval::new(120, move || on_tick.emit(()));
        move || drop(handle)
    });
}
