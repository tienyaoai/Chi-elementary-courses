use gloo::events::EventListener;
use wasm_bindgen::JsCast;
use web_sys::KeyboardEvent;
use yew::prelude::*;

#[derive(Clone, Copy, PartialEq, Eq, Default)]
pub enum Dir {
    #[default]
    None,
    Up,
    Down,
    Left,
    Right,
}

pub fn bind_keyboard(on_dir: Callback<Dir>) {
    use_effect_with((), move |_| {
        let window = web_sys::window().unwrap();
        let listener = EventListener::new(&window, "keydown", move |e| {
            let e = e.dyn_ref::<KeyboardEvent>().unwrap();
            let dir = match e.key().as_str() {
                "ArrowUp" | "w" | "W" => Dir::Up,
                "ArrowDown" | "s" | "S" => Dir::Down,
                "ArrowLeft" | "a" | "A" => Dir::Left,
                "ArrowRight" | "d" | "D" => Dir::Right,
                _ => match e.code().as_str() {
                    "ArrowUp" | "KeyW" => Dir::Up,
                    "ArrowDown" | "KeyS" => Dir::Down,
                    "ArrowLeft" | "KeyA" => Dir::Left,
                    "ArrowRight" | "KeyD" => Dir::Right,
                    _ => Dir::None,
                },
            };
            if dir != Dir::None {
                e.prevent_default();
                on_dir.emit(dir);
            }
        });
        move || drop(listener)
    });
}
