use crate::input::Dir;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct TouchPadProps {
    pub on_dir: Callback<Dir>,
    pub on_interact: Callback<()>,
}

#[derive(Properties, PartialEq)]
pub struct FitDirPadProps {
    pub on_dir: Callback<Dir>,
    pub on_interact: Callback<()>,
}

/// Compact D-pad for fit-mode hint strip (tablets / no keyboard).
#[function_component(FitDirPad)]
pub fn fit_dir_pad(props: &FitDirPadProps) -> Html {
    let emit = |d: Dir| {
        let cb = props.on_dir.clone();
        let interact = props.on_interact.clone();
        Callback::from(move |_| {
            interact.emit(());
            cb.emit(d);
        })
    };
    html! {
        <div class="touch-pad touch-pad-fit" aria-label="方向控制">
            <button type="button" class="pad-btn pad-btn-fit" data-testid="fit-pad-up"
                onclick={emit(Dir::Up)}>{"▲"}</button>
            <div class="pad-row pad-row-fit">
                <button type="button" class="pad-btn pad-btn-fit" data-testid="fit-pad-left"
                    onclick={emit(Dir::Left)}>{"◀"}</button>
                <button type="button" class="pad-btn pad-btn-fit" data-testid="fit-pad-down"
                    onclick={emit(Dir::Down)}>{"▼"}</button>
                <button type="button" class="pad-btn pad-btn-fit" data-testid="fit-pad-right"
                    onclick={emit(Dir::Right)}>{"▶"}</button>
            </div>
        </div>
    }
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
    use gloo::timers::callback::Interval;
    use yew::prelude::*;
    use_effect_with((), move |_| {
        let handle = Interval::new(48, move || on_tick.emit(()));
        move || drop(handle)
    });
}
