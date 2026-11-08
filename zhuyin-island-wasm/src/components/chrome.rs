use crate::bpmf::{plain, resolve, to_ivs};
use crate::data::{GameData, Picture};
use crate::progress::Progress;
use std::rc::Rc;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct GameButtonProps {
    pub onclick: Callback<MouseEvent>,
    #[prop_or_default]
    pub class: Classes,
    #[prop_or("sun".to_string())]
    pub tone: String,
    #[prop_or_default]
    pub disabled: bool,
    pub children: Children,
}

#[function_component(GameButton)]
pub fn game_button(props: &GameButtonProps) -> Html {
    let tone = format!("btn tone-{}", props.tone);
    html! {
        <button type="button" class={classes!(tone, "game-btn", props.class.clone())}
            disabled={props.disabled} onclick={props.onclick.clone()}>
            { for props.children.iter() }
        </button>
    }
}

#[derive(Properties, PartialEq)]
pub struct HeaderProps {
    pub title: String,
    pub step: String,
    pub game: Rc<GameData>,
    pub font_ok: bool,
    pub on_back: Callback<MouseEvent>,
}

#[function_component(Header)]
pub fn header(props: &HeaderProps) -> Html {
    html! {
        <header class="screen-header">
            <button type="button" class="back-btn" onclick={props.on_back.clone()}>
                <crate::components::BpmfText text={props.game.ui.text("back")} game={props.game.clone()} font_ok={props.font_ok} />
            </button>
            <div class="screen-header-main">
                <h2 class="screen-title">
                    <crate::components::BpmfText text={props.title.clone()} game={props.game.clone()} font_ok={props.font_ok} />
                </h2>
                <p class="screen-step system-font">{ &props.step }</p>
            </div>
        </header>
    }
}

#[function_component(Mascot)]
pub fn mascot() -> Html {
    html! {
        <div class="mascot mascot-idle" role="img" aria-label="注注">
            <svg viewBox="0 0 120 120" class="mascot-svg" aria-hidden="true">
                <circle cx="60" cy="60" r="52" fill="#fff3c4" stroke="#e4d2b4" stroke-width="4"/>
                <circle cx="44" cy="52" r="6" fill="#2c241c"/>
                <circle cx="76" cy="52" r="6" fill="#2c241c"/>
                <path d="M45 72 Q60 84 75 72" fill="none" stroke="#2c241c" stroke-width="4" stroke-linecap="round"/>
                <rect x="72" y="18" width="36" height="22" rx="8" fill="#ffd15a" stroke="#e0a82a" stroke-width="3"/>
                <text x="78" y="34" font-size="14" class="mascot-tag">{"注"}</text>
            </svg>
        </div>
    }
}

#[derive(Properties, PartialEq)]
pub struct PictureProps {
    pub picture: Picture,
}

#[function_component(PictureView)]
pub fn picture_view(props: &PictureProps) -> Html {
    match &props.picture {
        Picture::Emoji { emoji } => html! {
            <div class="picture-emoji emoji">{emoji.clone()}</div>
        },
        Picture::Digit { digit } => html! {
            <div class="picture-digit system-font">{digit.clone()}</div>
        },
        Picture::Swatch { color } => html! {
            <div class="picture-swatch" style={format!("background-color:{color}")}></div>
        },
    }
}

#[derive(Properties, PartialEq)]
pub struct SoundToggleProps {
    pub progress: Progress,
    pub on_toggle: Callback<MouseEvent>,
    pub game: Rc<GameData>,
    pub font_ok: bool,
}

#[function_component(SoundToggle)]
pub fn sound_toggle(props: &SoundToggleProps) -> Html {
    let label = if props.progress.sound {
        props.game.ui.text("mute")
    } else {
        props.game.ui.text("unmute")
    };
    html! {
        <button type="button" class="sound-toggle" onclick={props.on_toggle.clone()}>
            <crate::components::BpmfText text={label} game={props.game.clone()} font_ok={props.font_ok} />
        </button>
    }
}

#[derive(Properties, PartialEq)]
pub struct StarsRowProps {
    pub count: u8,
}

#[function_component(StarsRow)]
pub fn stars_row(props: &StarsRowProps) -> Html {
    html! {
        <div class="stars-row" aria-label={format!("{}顆星", props.count)}>
            { for (0..props.count).map(|i| html! { <span key={i} class="star-pop">{"★"}</span> }) }
        </div>
    }
}

/// Speak plain text from markup.
pub fn speak_markup(game: &GameData, text: &str) {
    let p = plain(&game.readings, text);
    crate::speech::speak_fire_and_forget(p);
}

pub fn speak_plain(text: String) {
    crate::speech::speak_fire_and_forget(text);
}
