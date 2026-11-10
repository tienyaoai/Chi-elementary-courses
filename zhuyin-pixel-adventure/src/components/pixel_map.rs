use crate::input::Dir;
use wasm_bindgen::JsCast;
use web_sys::HtmlElement;
use yew::prelude::*;

fn capture_pointer(e: &PointerEvent) {
    e.prevent_default();
    if let Some(el) = e.current_target().and_then(|t| t.dyn_into::<HtmlElement>().ok()) {
        let _ = el.set_pointer_capture(e.pointer_id());
    }
}

fn release_pointer(e: &PointerEvent) {
    e.prevent_default();
    if let Some(el) = e.current_target().and_then(|t| t.dyn_into::<HtmlElement>().ok()) {
        let _ = el.release_pointer_capture(e.pointer_id());
    }
}

fn pointer_captured(e: &PointerEvent) -> bool {
    e.current_target()
        .and_then(|t| t.dyn_into::<HtmlElement>().ok())
        .map(|el| el.has_pointer_capture(e.pointer_id()))
        .unwrap_or(false)
}

#[derive(Properties, PartialEq)]
pub struct FitDirPadProps {
    pub on_pad_hold: Callback<(Dir, bool)>,
}

/// Compact D-pad for fit-mode hint strip — hold to walk (pointerdown/up).
#[function_component(FitDirPad)]
pub fn fit_dir_pad(props: &FitDirPadProps) -> Html {
    let pad_hold = props.on_pad_hold.clone();
    let make = |dir: Dir, testid: &'static str| {
        let pad_hold = pad_hold.clone();
        let pad_down = pad_hold.clone();
        let down = Callback::from(move |e: PointerEvent| {
            capture_pointer(&e);
            pad_down.emit((dir, true));
        });
        let end_hold = pad_hold.clone();
        let up = Callback::from(move |e: PointerEvent| {
            release_pointer(&e);
            end_hold.emit((dir, false));
        });
        let end_hold2 = pad_hold.clone();
        let cancel = Callback::from(move |e: PointerEvent| {
            release_pointer(&e);
            end_hold2.emit((dir, false));
        });
        let end_leave = pad_hold.clone();
        let leave = Callback::from(move |e: PointerEvent| {
            if pointer_captured(&e) {
                return;
            }
            release_pointer(&e);
            end_leave.emit((dir, false));
        });
        let lost_hold = pad_hold.clone();
        let lost = Callback::from(move |_e: PointerEvent| {
            lost_hold.emit((dir, false));
        });
        html! {
            <button type="button" class="pad-btn pad-btn-fit" data-testid={testid}
                onpointerdown={down}
                onpointerup={up}
                onpointercancel={cancel}
                onpointerleave={leave}
                onlostpointercapture={lost}>
                { match dir {
                    Dir::Up => "▲",
                    Dir::Down => "▼",
                    Dir::Left => "◀",
                    Dir::Right => "▶",
                    Dir::None => "·",
                }}
            </button>
        }
    };
    html! {
        <div class="touch-pad touch-pad-fit" aria-label="方向控制"
            oncontextmenu={Callback::from(|e: MouseEvent| { e.prevent_default(); })}>
            { make(Dir::Up, "fit-pad-up") }
            <div class="pad-row pad-row-fit">
                { make(Dir::Left, "fit-pad-left") }
                { make(Dir::Down, "fit-pad-down") }
                { make(Dir::Right, "fit-pad-right") }
            </div>
        </div>
    }
}

#[derive(Properties, PartialEq)]
pub struct TouchPadProps {
    pub on_pad_hold: Callback<(Dir, bool)>,
}

#[function_component(TouchPad)]
pub fn touch_pad(props: &TouchPadProps) -> Html {
    let pad_hold = props.on_pad_hold.clone();
    let make = |dir: Dir, label: &'static str, testid: &'static str| {
        let pad_hold = pad_hold.clone();
        let pad_down = pad_hold.clone();
        let down = Callback::from(move |e: PointerEvent| {
            capture_pointer(&e);
            pad_down.emit((dir, true));
        });
        let end_hold = pad_hold.clone();
        let up = Callback::from(move |e: PointerEvent| {
            release_pointer(&e);
            end_hold.emit((dir, false));
        });
        let end_hold2 = pad_hold.clone();
        let cancel = Callback::from(move |e: PointerEvent| {
            release_pointer(&e);
            end_hold2.emit((dir, false));
        });
        let end_leave = pad_hold.clone();
        let leave = Callback::from(move |e: PointerEvent| {
            if pointer_captured(&e) {
                return;
            }
            release_pointer(&e);
            end_leave.emit((dir, false));
        });
        let lost_hold = pad_hold.clone();
        let lost = Callback::from(move |_e: PointerEvent| {
            lost_hold.emit((dir, false));
        });
        html! {
            <button type="button" class="pad-btn" data-testid={testid}
                onpointerdown={down}
                onpointerup={up}
                onpointercancel={cancel}
                onpointerleave={leave}
                onlostpointercapture={lost}>
                { label }
            </button>
        }
    };
    html! {
        <div class="touch-pad" aria-label="方向控制"
            oncontextmenu={Callback::from(|e: MouseEvent| { e.prevent_default(); })}>
            { make(Dir::Up, "▲", "pad-up") }
            <div class="pad-row">
                { make(Dir::Left, "◀", "pad-left") }
                { make(Dir::Down, "▼", "pad-down") }
                { make(Dir::Right, "▶", "pad-right") }
            </div>
        </div>
    }
}

pub fn bind_walk_tick(on_tick: Callback<()>) {
    use gloo::timers::callback::Interval;
    use yew::prelude::*;
    use_effect_with((), move |_| {
        let handle = Interval::new(16, move || on_tick.emit(()));
        move || drop(handle)
    });
}
