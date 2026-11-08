#![allow(clippy::too_many_arguments)]

use wasm_bindgen::prelude::*;
use yew::Renderer;

pub mod app;
pub mod audio;
pub mod bpmf;
pub mod components;
pub mod data;
pub mod progress;
pub mod random;
pub mod score;
pub mod screens;
pub mod speech;

pub use app::App;

#[wasm_bindgen(start)]
pub fn start() {
    Renderer::<App>::new().render();
}
