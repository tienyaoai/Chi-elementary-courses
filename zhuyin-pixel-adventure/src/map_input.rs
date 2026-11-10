//! Window-level held keys + RAF movement (arrows / WASD). Pad hold writes the same key set.

use crate::input::Dir;
use crate::walk_sprite::{facing_from_axis, WalkFacing};
use crate::island_walk;
use crate::map_config::MapOrientation;
use crate::world::{self, Portal};
use gloo::events::EventListener;
use gloo::timers::callback::{Interval, Timeout};
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

    pub fn intent_axis(&self) -> (f32, f32) {
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
        (dx, dy)
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

/// Slide along walk mask: try full step, then axis-only, in substeps so corners don't dead-stop.
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
    let steps = 3u8;
    let mut cur = (x, y);
    let mut moved = false;
    for i in 0..steps {
        let t0 = i as f32 / steps as f32;
        let t1 = (i + 1) as f32 / steps as f32;
        let sdx = dx * (t1 - t0);
        let sdy = dy * (t1 - t0);
        let (cx, cy) = cur;
        if let Some(p) = try_pt(cx + sdx, cy + sdy) {
            cur = p;
            moved = true;
            continue;
        }
        if sdx.abs() > 0.001 {
            if let Some(p) = try_pt(cx + sdx, cy) {
                cur = p;
                moved = true;
                continue;
            }
        }
        if sdy.abs() > 0.001 {
            if let Some(p) = try_pt(cx, cy + sdy) {
                cur = p;
                moved = true;
            }
        }
    }
    if moved {
        Some(cur)
    } else {
        None
    }
}

const PAD_TAP_WALK_MS: f64 = 150.0;

#[derive(Clone)]
pub struct MapInputController {
    pub held: Rc<RefCell<HeldKeys>>,
    pad_pressed_at: Rc<RefCell<Option<(Dir, f64)>>>,
    pad_release_timer: Rc<RefCell<Option<Timeout>>>,
    /// Active on-screen pad hold (survives `lostpointercapture` when fit dock re-renders).
    pad_held_dir: Rc<RefCell<Option<Dir>>>,
}

impl MapInputController {
    pub fn walk_facing_from_input(&self) -> Option<WalkFacing> {
        let keys = *self.held.borrow();
        if !keys.any() {
            return None;
        }
        let (dx, dy) = keys.intent_axis();
        facing_from_axis(dx, dy)
    }

    pub fn input_active(&self) -> bool {
        self.held.borrow().any() || self.pad_held_dir.borrow().is_some()
    }
    pub fn new() -> Self {
        Self {
            held: Rc::new(RefCell::new(HeldKeys::default())),
            pad_pressed_at: Rc::new(RefCell::new(None)),
            pad_release_timer: Rc::new(RefCell::new(None)),
            pad_held_dir: Rc::new(RefCell::new(None)),
        }
    }

    fn cancel_pad_release(&self) {
        if let Some(t) = self.pad_release_timer.borrow_mut().take() {
            drop(t);
        }
    }

    pub fn clear_held(&self) {
        self.cancel_pad_release();
        self.pad_pressed_at.borrow_mut().take();
        self.pad_held_dir.borrow_mut().take();
        self.held.borrow_mut().clear();
    }

    /// Window blur — keep on-screen pad hold if the pointer is still down.
    pub fn clear_keyboard_held(&self) {
        self.cancel_pad_release();
        if self.pad_held_dir.borrow().is_some() {
            self.held.borrow_mut().clear();
            return;
        }
        self.pad_pressed_at.borrow_mut().take();
        self.held.borrow_mut().clear();
    }

    /// End pad hold when the pointer is released anywhere (button may have been re-mounted).
    pub fn pad_pointer_released(&self) {
        if let Some(dir) = self.pad_held_dir.borrow_mut().take() {
            self.cancel_pad_release();
            self.pad_pressed_at.borrow_mut().take();
            self.held.borrow_mut().set_dir(dir, false);
        }
    }

    /// On-screen pad — hold uses same `held` set as keyboard; quick tap still walks ~150ms.
    pub fn pad_hold(&self, dir: Dir, down: bool) {
        if dir == Dir::None {
            return;
        }
        if down {
            self.cancel_pad_release();
            let now = js_sys::Date::now();
            *self.pad_pressed_at.borrow_mut() = Some((dir, now));
            *self.pad_held_dir.borrow_mut() = Some(dir);
            self.held.borrow_mut().set_dir(dir, true);
            return;
        }
        self.pad_held_dir.borrow_mut().take();
        let held_ms = self
            .pad_pressed_at
            .borrow()
            .and_then(|(d, t)| (d == dir).then_some(js_sys::Date::now() - t))
            .unwrap_or(0.0);
        self.pad_pressed_at.borrow_mut().take();
        if held_ms >= PAD_TAP_WALK_MS - 8.0 {
            self.cancel_pad_release();
            self.held.borrow_mut().set_dir(dir, false);
            return;
        }
        let remain = (PAD_TAP_WALK_MS - held_ms).max(0.0);
        if remain > 24.0 {
            let held = self.held.clone();
            let dir = dir;
            *self.pad_release_timer.borrow_mut() = Some(Timeout::new(remain as u32, move || {
                held.borrow_mut().set_dir(dir, false);
            }));
        } else {
            self.cancel_pad_release();
            self.held.borrow_mut().set_dir(dir, false);
        }
    }
}

pub type DoorEnterProbe = Rc<dyn Fn() -> Option<Portal>>;

/// Window listeners + RAF mover (call teardown on unmount).
pub fn install_continuous_map_move(
    controller: MapInputController,
    on_clear_path: Callback<()>,
    on_prime: Callback<()>,
    on_frame: Callback<((f32, f32), (f32, f32), f32)>, // world delta, velocity px/s, dt sec
    door_enter: Option<(DoorEnterProbe, Callback<Portal>)>,
) -> Box<dyn FnOnce()> {
    let held = controller.held.clone();
    let ctrl_blur = controller.clone();
    let ctrl_vis = controller.clone();
    let ctrl_teardown = controller.clone();
    let ctrl_enter = controller.clone();
    let ctrl_ptr_up = controller.clone();
    let ctrl_ptr_cancel = controller.clone();
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
                                ctrl_enter.clear_held();
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

            let blur = EventListener::new(&win, "blur", move |_| {
                ctrl_blur.clear_keyboard_held();
            });
            let vis = EventListener::new(&win, "visibilitychange", move |_| {
                ctrl_vis.clear_held();
            });
            let pointer_up = EventListener::new(&win, "pointerup", move |e| {
                if e
                    .dyn_ref::<web_sys::PointerEvent>()
                    .map(|ev| ev.button())
                    != Some(0)
                {
                    return;
                }
                ctrl_ptr_up.pad_pointer_released();
            });
            let pointer_cancel = EventListener::new(&win, "pointercancel", move |_| {
                ctrl_ptr_cancel.pad_pointer_released();
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
            on_frame.emit(((vx * dt, vy * dt), (vx, vy), dt));
        })
    };

    Box::new(move || {
        drop(keydown);
        drop(keyup);
        drop(blur);
        drop(vis);
        drop(pointer_up);
        drop(pointer_cancel);
        drop(tick);
        ctrl_teardown.clear_held();
    })
}
