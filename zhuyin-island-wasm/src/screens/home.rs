use crate::components::{BpmfText, GameButton, Mascot, SoundToggle};
use crate::data::{collected_line, stamp_count, GameData};
use crate::progress::Progress;
use std::rc::Rc;
use yew::prelude::*;

#[derive(Clone, PartialEq)]
pub enum HomeAction {
    Cards,
    Play(&'static str),
}

#[derive(Properties, PartialEq)]
pub struct HomeScreenProps {
    pub game: Rc<GameData>,
    pub font_ok: bool,
    pub progress: Progress,
    pub on_action: Callback<HomeAction>,
    pub on_toggle_sound: Callback<MouseEvent>,
    pub on_intro_done: Callback<MouseEvent>,
    pub on_clear: Callback<MouseEvent>,
}

const GAMES: [(&str, &str, &str, &str); 4] = [
    ("quiz", "🖼️", "#ffe1c7", "quiz"),
    ("order", "✨", "#d7f0ff", "order"),
    ("memory", "🃏", "#ffe0ea", "memory"),
    ("story", "📖", "#ddf6e6", "story"),
];

#[function_component(HomeScreen)]
pub fn home_screen(props: &HomeScreenProps) -> Html {
    let ui = &props.game.ui;
    let star_sum: u8 = ["quiz", "order", "memory", "story"]
        .iter()
        .map(|m| props.progress.best.get(*m).copied().unwrap_or(0))
        .sum();

    html! {
        <div class="stack">
            <div class="row-end">
                <SoundToggle progress={props.progress.clone()} on_toggle={props.on_toggle_sound.clone()}
                    game={props.game.clone()} font_ok={props.font_ok} />
            </div>
            <div class="hero">
                <Mascot />
                <h1 class="title-lg"><BpmfText text={ui.text("title")} game={props.game.clone()} font_ok={props.font_ok} /></h1>
                <p class="title-md"><BpmfText text={ui.text("subtitle")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                <p class="title-md"><BpmfText text={collected_line(star_sum as usize)} game={props.game.clone()} font_ok={props.font_ok} /></p>
            </div>

            if !props.font_ok {
                <p class="panel"><BpmfText text={ui.text("fontMissing")} game={props.game.clone()} font_ok={false} /></p>
            }

            if !props.progress.intro_seen {
                <section class="panel card-shadow">
                    <p class="title-md"><BpmfText text={ui.text("intro1")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                    <p class="title-md"><BpmfText text={ui.text("intro2")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                    <p class="title-md"><BpmfText text={ui.text("intro3")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                    <GameButton class={classes!("w-full")} onclick={props.on_intro_done.clone()}>
                        <BpmfText text={ui.text("gotIt")} game={props.game.clone()} font_ok={props.font_ok} />
                    </GameButton>
                </section>
            }

            <HomeTile emoji="🏠" color="#fff3c4"
                title={ui.text("cardsTitle")} blurb={ui.text("cardsBlurb")}
                extra={stamp_count(props.progress.stamps.len(), props.game.card_total)}
                game={props.game.clone()} font_ok={props.font_ok}
                onclick={Callback::from({
                    let cb = props.on_action.clone();
                    move |_| cb.emit(HomeAction::Cards)
                })} />

            { for GAMES.iter().map(|(mode, emoji, color, key)| {
                let title = ui.text(&format!("{key}Title"));
                let blurb = ui.text(&format!("{key}Blurb"));
                html! {
                    <HomeTile key={*mode} emoji={*emoji} color={*color} title={title} blurb={blurb} extra={String::new()}
                        game={props.game.clone()} font_ok={props.font_ok}
                        onclick={Callback::from({
                            let cb = props.on_action.clone();
                            move |_| cb.emit(HomeAction::Play(mode))
                        })} />
                }
            })}

            <details class="panel adult-panel">
                <summary class="title-md"><BpmfText text={ui.text("adultTitle")} game={props.game.clone()} font_ok={props.font_ok} /></summary>
                <p><BpmfText text={ui.text("adult1")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                <p><BpmfText text={ui.text("adult2")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                <p><BpmfText text={ui.text("adult3")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                <p><BpmfText text={ui.text("adult5")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                <GameButton tone="white" onclick={props.on_clear.clone()}>
                    <BpmfText text={ui.text("clear")} game={props.game.clone()} font_ok={props.font_ok} />
                </GameButton>
            </details>
        </div>
    }
}

#[derive(Properties, PartialEq)]
struct HomeTileProps {
    emoji: &'static str,
    color: &'static str,
    title: String,
    blurb: String,
    extra: String,
    game: Rc<GameData>,
    font_ok: bool,
    onclick: Callback<MouseEvent>,
}

#[function_component(HomeTile)]
fn home_tile(props: &HomeTileProps) -> Html {
    html! {
        <button type="button" class="home-tile card-shadow" onclick={props.onclick.clone()}>
            <span class="tile-icon emoji" style={format!("background:{}", props.color)}>{props.emoji}</span>
            <span class="tile-body">
                <span class="title-lg block"><BpmfText text={props.title.clone()} game={props.game.clone()} font_ok={props.font_ok} /></span>
                if !props.blurb.is_empty() {
                    <span class="muted title-sm block"><BpmfText text={props.blurb.clone()} game={props.game.clone()} font_ok={props.font_ok} /></span>
                }
                if !props.extra.is_empty() {
                    <span class="title-sm block"><BpmfText text={props.extra.clone()} game={props.game.clone()} font_ok={props.font_ok} /></span>
                }
            </span>
        </button>
    }
}
