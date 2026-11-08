use crate::input::Dir;
use crate::sprites::{color_index, find_character, pixel_grid, PIX_H, PIX_W, PIXEL_SCALE, CANVAS_H, CANVAS_W};
use crate::tile_art::draw_all;
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
    pub portal_near: Option<Portal>,
    pub on_enter: Callback<Portal>,
    pub enter_label: String,
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

    let can_enter = props.portal_near == Some(Portal::Chinese);

    html! {
        <div class="map-frame">
            <canvas ref={canvas_ref} class="pixel-canvas" width={CANVAS_W.to_string()} height={CANVAS_H.to_string()} />
            <div class="action-dock">
                if let Some(portal) = props.portal_near {
                    <p class="map-hint">{ world::GateLabel::hint(portal) }</p>
                } else {
                    <p class="map-hint muted">{"用方向鍵或下方按鈕走到橘色國語小屋前"}</p>
                }
                if can_enter {
                    <button type="button" class="enter-btn pixel-btn primary pulse"
                        onclick={Callback::from({
                            let on_enter = props.on_enter.clone();
                            move |_| on_enter.emit(Portal::Chinese)
                        })}>
                        { props.enter_label.clone() }
                    </button>
                }
            </div>
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
    draw_all(&ctx);
    draw_player(&ctx, character_id, px, py, frame);
}

fn draw_player(ctx: &CanvasRenderingContext2d, character_id: &str, px: f32, py: f32, frame: u8) {
    let ch = find_character(character_id);
    let grid = pixel_grid(character_id, frame);
    let scale = PIXEL_SCALE;
    let ox = px as f64 * TILE as f64 + TILE as f64 / 2.0 - (PIX_W as f64) * scale / 2.0;
    let oy = py as f64 * TILE as f64 + TILE as f64 - (PIX_H as f64) * scale - 2.0;
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
        ctx.fill_rect(ox + x as f64 * scale, oy + y as f64 * scale, scale, scale);
    }
    ctx.set_fill_style(&"#00000044".into());
    ctx.fill_rect(ox + 2.0, py as f64 * TILE as f64 + TILE as f64 - 2.0, PIX_W as f64 * scale - 4.0, 3.0);
}

#[derive(Properties, PartialEq)]
pub struct TouchPadProps {
    pub on_dir: Callback<Dir>,
    pub on_interact: Callback<()>,
}

#[function_component(TouchPad)]
pub fn touch_pad(props: &TouchPadProps) -> Html {
    let emit = |d: Dir| {
        let cb = props.on_dir.clone();
        let interact = props.on_interact.clone();
        Callback::from(move |_| {
            interact.emit(());
            cb.emit(d);
        })
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
        let handle = Interval::new(280, move || on_tick.emit(()));
        move || drop(handle)
    });
}
