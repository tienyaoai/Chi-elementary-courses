use crate::audio::play_win;
use crate::components::{BpmfText, GameButton, StarsRow};
use crate::data::{star_count, GameData};
use std::rc::Rc;
use yew::prelude::*;
use yew::use_effect_with;

#[derive(Properties, PartialEq)]
pub struct ResultScreenProps {
    pub game: Rc<GameData>,
    pub font_ok: bool,
    pub stars: u8,
    pub detail: String,
    pub on_home: Callback<MouseEvent>,
    pub on_replay: Callback<MouseEvent>,
    pub on_next: Callback<MouseEvent>,
}

#[function_component(ResultScreen)]
pub fn result_screen(props: &ResultScreenProps) -> Html {
    {
        let stars = props.stars;
        use_effect_with(stars, move |s| {
            if *s >= 2 {
                play_win();
            }
            || ()
        });
    }
    let msg = match props.stars {
        3 => props.game.ui.text("result3"),
        2 => props.game.ui.text("result2"),
        _ => props.game.ui.text("result1"),
    };
    html! {
        <div class="panel card-shadow text-center stack">
            <StarsRow count={props.stars} />
            <p class="title-lg"><BpmfText text={msg} game={props.game.clone()} font_ok={props.font_ok} /></p>
            <p class="title-md"><BpmfText text={props.detail.clone()} game={props.game.clone()} font_ok={props.font_ok} /></p>
            <p class="title-md"><BpmfText text={star_count(props.stars)} game={props.game.clone()} font_ok={props.font_ok} /></p>
            <GameButton onclick={props.on_replay.clone()}>
                <BpmfText text={props.game.ui.text("again")} game={props.game.clone()} font_ok={props.font_ok} />
            </GameButton>
            <GameButton tone="leaf" onclick={props.on_next.clone()}>
                <BpmfText text={props.game.ui.text("next")} game={props.game.clone()} font_ok={props.font_ok} />
            </GameButton>
            <GameButton tone="white" onclick={props.on_home.clone()}>
                <BpmfText text={props.game.ui.text("back")} game={props.game.clone()} font_ok={props.font_ok} />
            </GameButton>
        </div>
    }
}
