use crate::bpmf::plain;
use crate::components::{BpmfText, Header, speak_plain};
use crate::data::{stamp_count, GameData, LessonCard};
use crate::progress::Progress;
use std::rc::Rc;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct CardsScreenProps {
    pub game: Rc<GameData>,
    pub font_ok: bool,
    pub progress: Progress,
    pub on_exit: Callback<MouseEvent>,
    pub on_stamp: Callback<String>,
    pub on_theme: Callback<String>,
    pub theme_id: String,
    pub active_id: Option<String>,
}

#[function_component(CardsScreen)]
pub fn cards_screen(props: &CardsScreenProps) -> Html {
    let theme = props
        .game
        .content
        .themes
        .iter()
        .find(|t| t.id == props.theme_id)
        .or_else(|| props.game.content.themes.first());
    let Some(theme) = theme else {
        return html! { <div></div> };
    };
    let done = theme.cards.iter().filter(|c| props.progress.stamps.contains(&c.id)).count();
    let active = props.active_id.as_ref().and_then(|id| theme.cards.iter().find(|c| &c.id == id));

    html! {
        <div>
            <Header title={props.game.ui.text("cardsTitle")} step={stamp_count(done, theme.cards.len())}
                game={props.game.clone()} font_ok={props.font_ok} on_back={props.on_exit.clone()} />
            <div class="chip-row mb-3">
                { for props.game.content.themes.iter().map(|t| html! {
                    <button type="button" class={classes!("chip", (t.id == theme.id).then_some("chip-active"))}
                        onclick={props.on_theme.reform({
                            let id = t.id.clone();
                            move |_| id.clone()
                        })}>
                        <BpmfText text={t.title.clone()} game={props.game.clone()} font_ok={props.font_ok} />
                    </button>
                })}
            </div>
            if done == theme.cards.len() {
                <p><BpmfText text={props.game.ui.text("themeDone")} game={props.game.clone()} font_ok={props.font_ok} /></p>
            }
            <div class="cards-grid">
                { for theme.cards.iter().map(|card| {
                    let stamped = props.progress.stamps.contains(&card.id);
                    html! {
                        <button type="button" class={classes!("card-tile", (props.active_id.as_deref() == Some(card.id.as_str())).then_some("card-active"))}
                            onclick={Callback::from({
                                let game = props.game.clone();
                                let on_stamp = props.on_stamp.clone();
                                let c = card.clone();
                                move |_| {
                                    speak_plain(format!(
                                        "{}。{}",
                                        plain(&game.readings, &c.word),
                                        plain(&game.readings, &c.sentence)
                                    ));
                                    on_stamp.emit(c.id.clone());
                                }
                            })}>
                            <span class="emoji block text-5xl">{ &card.emoji }</span>
                            <BpmfText text={card.word.clone()} game={props.game.clone()} font_ok={props.font_ok} />
                            if stamped { <span class="stamp">{"★"}</span> }
                        </button>
                    }
                })}
            </div>
            if let Some(card) = active {
                <div class="panel mt-3">
                    <p class="muted"><BpmfText text={props.game.ui.text("sentenceLabel")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                    <p><BpmfText text={card.sentence.clone()} game={props.game.clone()} font_ok={props.font_ok} /></p>
                </div>
            }
        </div>
    }
}
