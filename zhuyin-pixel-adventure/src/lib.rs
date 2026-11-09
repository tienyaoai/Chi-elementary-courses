#![allow(clippy::too_many_arguments)]

use wasm_bindgen::prelude::*;
use yew::Renderer;

pub mod app;
pub mod screens;
pub mod grade1;
pub mod grade1_screens;
pub mod bpmf_aside;
pub mod components;
pub mod input;
pub mod pixel_art_images;
pub mod progress;
pub mod sounds;
pub mod sprites;
pub mod tile_art;
pub mod world;

pub use app::App;

#[wasm_bindgen(start)]
pub fn start() {
    Renderer::<App>::new().render();
}
