use crate::input::Dir;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

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
            e.prevent_default();
            pad_down.emit((dir, true));
        });
        let up = Callback::from({
            let pad_hold = pad_hold.clone();
            move |e: PointerEvent| {
                e.prevent_default();
                pad_hold.emit((dir, false));
            }
        });
        let up_leave = up.clone();
        let up_cancel = up.clone();
        html! {
            <button type="button" class="pad-btn pad-btn-fit" data-testid={testid}
                onpointerdown={down}
                onpointerup={up}
                onpointerleave={up_leave}
                onpointercancel={up_cancel}>
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
            e.prevent_default();
            pad_down.emit((dir, true));
        });
        let pad_up = pad_hold.clone();
        let up = Callback::from(move |e: PointerEvent| {
            e.prevent_default();
            pad_up.emit((dir, false));
        });
        let up_leave = up.clone();
        let up_cancel = up.clone();
        html! {
            <button type="button" class="pad-btn" data-testid={testid}
                onpointerdown={down}
                onpointerup={up}
                onpointerleave={up_leave}
                onpointercancel={up_cancel}>
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
        let handle = Interval::new(48, move || on_tick.emit(()));
        move || drop(handle)
    });
}
