use crate::audio::{play_correct, play_wrong};
use crate::bpmf::plain;
use crate::components::{BpmfText, GameButton, Header, speak_plain};
use crate::data::{ask_step, quiz_detail, GameData, OrderItem};
use crate::random::{sample, shuffle};
use crate::score::stars_for;
use std::rc::Rc;
use yew::prelude::*;

#[derive(Clone)]
struct Chip {
    id: String,
    text: String,
}

#[derive(Clone)]
struct Round {
    emoji: String,
    chips: Vec<Chip>,
    answer: String,
}

#[derive(Properties, PartialEq)]
pub struct OrderScreenProps {
    pub game: Rc<GameData>,
    pub font_ok: bool,
    pub on_exit: Callback<MouseEvent>,
    pub on_done: Callback<(u8, String)>,
}

fn make_round(items: &[OrderItem]) -> Vec<Round> {
    sample(items, 5)
        .into_iter()
        .map(|item| {
            let mut chips: Vec<Chip> = item
                .chunks
                .iter()
                .enumerate()
                .map(|(i, t)| Chip {
                    id: format!("{}-{i}", item.id),
                    text: t.clone(),
                })
                .collect();
            chips = shuffle(&chips);
            let answer = item.chunks.join("");
            Round {
                emoji: item.emoji.clone(),
                chips,
                answer,
            }
        })
        .collect()
}

#[function_component(OrderScreen)]
pub fn order_screen(props: &OrderScreenProps) -> Html {
    let round = use_state(|| make_round(&props.game.content.order_items));
    let index = use_state(|| 0usize);
    let chosen = use_state(Vec::<Chip>::new);
    let fails = use_state(|| 0usize);
    let solved = use_state(|| false);
    let revealed = use_state(|| false);
    let feedback = use_state(String::new);
    let first = use_state(|| 0usize);
    let item = round.get(*index).cloned();

    let try_finish = {
        let index = index.clone();
        let round = round.clone();
        let chosen = chosen.clone();
        let fails = fails.clone();
        let solved = solved.clone();
        let revealed = revealed.clone();
        let feedback = feedback.clone();
        let first = first.clone();
        let on_done = props.on_done.clone();
        move |clean: bool| {
            let fv = if clean { *first + 1 } else { *first };
            first.set(fv);
            let next = *index + 1;
            if next >= round.len() {
                on_done.emit((stars_for(fv, round.len()), quiz_detail(fv, round.len())));
                return;
            }
            index.set(next);
            chosen.set(vec![]);
            fails.set(0);
            solved.set(false);
            revealed.set(false);
            feedback.set(String::new());
        }
    };

    html! {
        <div>
            <Header title={props.game.ui.text("orderTitle")}
                step={ask_step(index.saturating_add(1), round.len())}
                game={props.game.clone()} font_ok={props.font_ok} on_back={props.on_exit.clone()} />
            if let Some(item) = item {
                <div class="panel card-shadow">
                    <p class="emoji text-center text-5xl">{ &item.emoji }</p>
                    <div class="sentence-box">
                        if chosen.is_empty() {
                            <p class="muted"><BpmfText text={props.game.ui.text("orderEmpty")} game={props.game.clone()} font_ok={props.font_ok} /></p>
                        } else {
                            { for chosen.iter().map(|c| html! {
                                <button type="button" class="chip chosen" disabled={*solved || *revealed}
                                    onclick={Callback::from({
                                        let chosen = chosen.clone();
                                        let id = c.id.clone();
                                        move |_| {
                                            let mut v = (*chosen).clone();
                                            v.retain(|x| x.id != id);
                                            chosen.set(v);
                                        }
                                    })}>
                                    <BpmfText text={c.text.clone()} game={props.game.clone()} font_ok={props.font_ok} />
                                </button>
                            })}
                        }
                    </div>
                    if !feedback.is_empty() {
                        <p class="feedback title-md">{ &*feedback }</p>
                    }
                    <div class="chip-row">
                        { for item.chips.iter().map(|chip| {
                            let used = chosen.iter().any(|c| c.id == chip.id);
                            html! {
                                <button type="button" class="chip" disabled={used || *solved || *revealed}
                                    onclick={Callback::from({
                                        let game = props.game.clone();
                                        let chosen = chosen.clone();
                                        let chip = chip.clone();
                                        move |_| {
                                            if used { return; }
                                            speak_plain(plain(&game.readings, &chip.text));
                                            let mut v = (*chosen).clone();
                                            v.push(chip.clone());
                                            chosen.set(v);
                                        }
                                    })}>
                                    <BpmfText text={chip.text.clone()} game={props.game.clone()} font_ok={props.font_ok} />
                                </button>
                            }
                        })}
                    </div>
                    <div class="row-actions">
                        <GameButton onclick={Callback::from({
                            let game = props.game.clone();
                            let chosen = chosen.clone();
                            let item = item.clone();
                            let fails = fails.clone();
                            let feedback = feedback.clone();
                            let solved = solved.clone();
                            let revealed = revealed.clone();
                            let try_finish = try_finish.clone();
                            move |_| {
                                if *solved || *revealed { return; }
                                let sel = &*chosen;
                                if sel.len() != item.chips.len() {
                                    feedback.set(game.ui.text("orderLeft"));
                                    return;
                                }
                                let attempt: String = sel.iter().map(|c| c.text.as_str()).collect();
                                if attempt == item.answer {
                                    solved.set(true);
                                    feedback.set(game.ui.text("correct"));
                                    play_correct();
                                    try_finish(sel.len() == item.chips.len() && *fails == 0);
                                } else {
                                    fails.set(*fails + 1);
                                    feedback.set(game.ui.text("orderWrong"));
                                    play_wrong();
                                }
                            }
                        })}>
                            <BpmfText text={props.game.ui.text("check")} game={props.game.clone()} font_ok={props.font_ok} />
                        </GameButton>
                        if *fails >= 2 {
                            <GameButton tone="white" onclick={Callback::from({
                                let chosen = chosen.clone();
                                let item = item.clone();
                                let revealed = revealed.clone();
                                let feedback = feedback.clone();
                                let game = props.game.clone();
                                let try_finish = try_finish.clone();
                                move |_| {
                                    chosen.set(item.chips.clone());
                                    revealed.set(true);
                                    feedback.set(game.ui.text("showAnswer"));
                                    try_finish(false);
                                }
                            })}>
                                <BpmfText text={props.game.ui.text("reveal")} game={props.game.clone()} font_ok={props.font_ok} />
                            </GameButton>
                        }
                    </div>
                </div>
            }
        </div>
    }
}
