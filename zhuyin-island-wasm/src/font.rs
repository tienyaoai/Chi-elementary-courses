use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{CanvasRenderingContext2d, Document, HtmlCanvasElement};

const LOAD_SPEC: &str = "16px \"BpmfHuninn\"";
const DRAW_FONT: &str = "48px \"BpmfHuninn\", sans-serif";
const FALLBACK_FONT: &str = "48px sans-serif";

/// True only when BpmfHuninn is loaded **and** IVS variation selectors change glyph metrics.
pub async fn bpmf_font_ready() -> bool {
    let Some(window) = web_sys::window() else {
        return false;
    };
    let Some(document) = window.document() else {
        return false;
    };
    let fonts = document.fonts();
    if JsFuture::from(fonts.load(LOAD_SPEC)).await.is_err() {
        return false;
    }
    if !fonts.check(LOAD_SPEC).unwrap_or(false) {
        return false;
    }
    ivs_renders(&document)
}

fn ivs_renders(document: &Document) -> bool {
    let Some(value) = ivs_probe(document) else {
        return false;
    };
    value
}

fn ivs_probe(document: &Document) -> Option<bool> {
    let Ok(canvas_el) = document.create_element("canvas") else {
        return None;
    };
    let Ok(canvas) = canvas_el.dyn_into::<HtmlCanvasElement>() else {
        return None;
    };
    canvas.set_width(1);
    canvas.set_height(1);
    let Some(ctx) = canvas
        .get_context("2d")
        .ok()
        .flatten()
        .and_then(|ctx| ctx.dyn_into::<CanvasRenderingContext2d>().ok())
    else {
        return None;
    };
    ctx.set_font(FALLBACK_FONT);
    let sans_w = ctx.measure_text("媽").ok()?.width();
    ctx.set_font(DRAW_FONT);
    let plain_w = ctx.measure_text("媽").ok()?.width();
    let ivs = char::from_u32(0xe01e1).unwrap_or(' ');
    let ivs_w = ctx.measure_text(&format!("媽{ivs}")).ok()?.width();
    let font_face_diff = (plain_w - sans_w).abs() > 0.35;
    let ivs_diff = (ivs_w - plain_w).abs() > 0.35;
    Some(font_face_diff && ivs_diff)
}
