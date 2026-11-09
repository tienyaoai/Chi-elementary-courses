use crate::pixel_art_images::draw_scene;
use wasm_bindgen::JsCast;
use yew::prelude::*;

const SIZE: u32 = 128;

#[derive(Properties, PartialEq)]
pub struct PixelPictureProps {
    pub description: String,
    #[prop_or(false)]
    pub compact: bool,
    #[prop_or(false)]
    pub large: bool,
}

#[function_component(PixelPicture)]
pub fn pixel_picture(props: &PixelPictureProps) -> Html {
    let canvas_ref = use_node_ref();
    {
        let canvas_ref = canvas_ref.clone();
        let desc = props.description.clone();
        use_effect_with(desc.clone(), move |_| {
            if let Some(canvas) = canvas_ref.cast::<web_sys::HtmlCanvasElement>() {
                canvas.set_width(SIZE);
                canvas.set_height(SIZE);
                if let Some(ctx) = canvas
                    .get_context("2d")
                    .ok()
                    .flatten()
                    .and_then(|c| c.dyn_into::<web_sys::CanvasRenderingContext2d>().ok())
                {
                    draw_scene(&ctx, &desc, SIZE as f64, SIZE as f64);
                }
            }
            || ()
        });
    }
    html! {
        <canvas
            ref={canvas_ref}
            class={classes!(
                "pixel-picture-canvas",
                props.compact.then_some("compact"),
                props.large.then_some("pixel-picture-large")
            )}
            width={SIZE.to_string()}
            height={SIZE.to_string()}
            aria-label={props.description.clone()}
        />
    }
}
