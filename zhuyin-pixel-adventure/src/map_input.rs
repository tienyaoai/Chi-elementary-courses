//! Window-level held keys + RAF movement (arrows / WASD). Pad hold writes the same key set.

use crate::input::Dir;
use crate::island_walk;
use crate::map_config::MapOrientation;
use crate::world::{self, Portal};
use gloo::events::EventListener;
use gloo::timers::callback::Interval;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::KeyboardEvent;
use yew::Callback;

pub const WALK_SPEED_PX_PER_SEC: f32 = 285.0;

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct HeldKeys {
    pub up: bool,
    pub down: bool,
    pub left: bool,
    pub right: bool,
}

impl HeldKeys {
    pub fn set_dir(&mut self, dir: Dir, down: bool) {
        match dir {
            Dir::Up => self.up = down,
            Dir::Down => self.down = down,
            Dir::Left => self.left = down,
            Dir::Right => self.right = down,
            Dir::None => {}
        }
    }

    pub fn clear(&mut self) {
        *self = Self::default();
    }

    pub fn any(&self) -> bool {
        self.up || self.down || self.left || self.right
    }

    pub fn axis_unit(&self) -> (f32, f32) {
        let mut dx = 0.0_f32;
        let mut dy = 0.0_f32;
        if self.left {
            dx -= 1.0;
        }
        if self.right {
            dx += 1.0;
        }
        if self.up {
            dy -= 1.0;
        }
        if self.down {
            dy += 1.0;
        }
        let len = (dx * dx + dy * dy).sqrt();
        if len > 0.001 {
            (dx / len, dy / len)
        } else {
            (0.0, 0.0)
        }
    }
}

fn dir_from_key_event(e: &KeyboardEvent) -> Dir {
    match e.key().as_str() {
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
    }
}

fn arrow_like(dir: Dir) -> bool {
    matches!(dir, Dir::Up | Dir::Down | Dir::Left | Dir::Right)
}

/// Slide along walk mask: try full step, then X-only, then Y-only.
pub fn slide_move(x: f32, y: f32, dx: f32, dy: f32, orient: MapOrientation) -> Option<(f32, f32)> {
    if !island_walk::masks_ready() {
        let nx = x + dx;
        let ny = y + dy;
        return Some(island_walk::clamp_to_map(nx, ny, orient));
    }
    let try_pt = |nx: f32, ny: f32| {
        let (nx, ny) = island_walk::clamp_to_map(nx, ny, orient);
        island_walk::can_stand(nx, ny, orient).then_some((nx, ny))
    };
    if let Some(p) = try_pt(x + dx, y + dy) {
        return Some(p);
    }
    if dx.abs() > 0.001 {
        if let Some(p) = try_pt(x + dx, y) {
            return Some(p);
        }
    }
    if dy.abs() > 0.001 {
        if let Some(p) = try_pt(x, y + dy) {
            return Some(p);
        }
    }
    None
}

#[derive(Clone)]
pub struct MapInputController {
    pub held: Rc<RefCell<HeldKeys>>,
}

impl MapInputController {
    pub fn new() -> Self {
        Self {
            held: Rc::new(RefCell::new(HeldKeys::default())),
        }
    }

    pub fn pad_hold(&self, dir: Dir, down: bool) {
        if dir != Dir::None {
            self.held.borrow_mut().set_dir(dir, down);
        }
    }
}

pub type DoorEnterProbe = Rc<dyn Fn() -> Option<Portal>>;

/// Window listeners + RAF mover (call teardown on unmount).
pub fn install_continuous_map_move(
    controller: MapInputController,
    on_clear_path: Callback<()>,
    on_prime: Callback<()>,
    on_frame: Callback<((f32, f32), (f32, f32))>, // world delta, velocity px/s
    door_enter: Option<(DoorEnterProbe, Callback<Portal>)>,
) -> Box<dyn FnOnce()> {
    let held = controller.held.clone();
    let win = web_sys::window().unwrap();
            let held_kd = held.clone();
            let on_clear = on_clear_path.clone();
            let on_prime = on_prime.clone();
            let on_clear_path_kd = on_clear_path.clone();
            let keydown = EventListener::new(&win, "keydown", move |e| {
                let e = e.dyn_ref::<KeyboardEvent>().unwrap();
                if e.is_composing() {
                    return;
                }
                let key = e.key();
                let enter_key =
                    key == "Enter" || key == " " || e.code().as_str() == "NumpadEnter";
                if enter_key {
                    if let Some((ref probe, ref on_enter)) = door_enter {
                        if e.repeat() {
                            e.prevent_default();
                            return;
                        }
                        if let Some(portal) = probe() {
                            if world::door_enterable(portal) {
                                e.prevent_default();
                                e.stop_propagation();
                                held_kd.borrow_mut().clear();
                                on_clear_path_kd.emit(());
                                on_enter.emit(portal);
                                return;
                            }
                        }
                    }
                }
                let dir = dir_from_key_event(e);
                if arrow_like(dir) {
                    e.prevent_default();
                    e.stop_propagation();
                    on_prime.emit(());
                    on_clear.emit(());
                    held_kd.borrow_mut().set_dir(dir, true);
                }
            });

            let held_ku = held.clone();
            let keyup = EventListener::new(&win, "keyup", move |e| {
                let e = e.dyn_ref::<KeyboardEvent>().unwrap();
                let dir = dir_from_key_event(e);
                if arrow_like(dir) {
                    e.prevent_default();
                    held_ku.borrow_mut().set_dir(dir, false);
                }
            });

            let clear_held = held.clone();
            let blur = EventListener::new(&win, "blur", move |_| {
                clear_held.borrow_mut().clear();
            });
            let clear_vis = held.clone();
            let vis = EventListener::new(&win, "visibilitychange", move |_| {
                clear_vis.borrow_mut().clear();
            });

    let last_ms = Rc::new(RefCell::new(None::<f64>));
    let held_mv = held.clone();
    let on_frame = on_frame.clone();
    let tick = {
        let last_ms_loop = last_ms.clone();
        Interval::new(16, move || {
            let now = js_sys::Date::now();
            let dt_ms = last_ms_loop
                .borrow()
                .map(|t| now - t)
                .unwrap_or(16.0)
                .clamp(1.0, 50.0);
            *last_ms_loop.borrow_mut() = Some(now);
            let dt = (dt_ms / 1000.0) as f32;
            let keys = *held_mv.borrow();
            let (ax, ay) = keys.axis_unit();
            let vx = ax * WALK_SPEED_PX_PER_SEC;
            let vy = ay * WALK_SPEED_PX_PER_SEC;
            on_frame.emit(((vx * dt, vy * dt), (vx, vy)));
        })
    };

    Box::new(move || {
        drop(keydown);
        drop(keyup);
        drop(blur);
        drop(vis);
        drop(tick);
        held.borrow_mut().clear();
    })
}
