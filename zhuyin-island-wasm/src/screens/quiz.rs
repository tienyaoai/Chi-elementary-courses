use crate::audio::{play_correct, play_wrong};
use crate::bpmf::plain;
use crate::components::{BpmfText, GameButton, Header, PictureView, speak_plain};
use crate::data::{ask_step, quiz_detail, GameData, QuizItem};
use crate::random::{sample, shuffle};
use crate::score::stars_for;
use gloo::timers::callback::Timeout;
use std::rc::Rc;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct QuizScreenProps {
    pub game: Rc<GameData>,
    pub font_ok: bool,
    pub on_exit: Callback<MouseEvent>,
    pub on_done: Callback<(u8, String)>,
}

struct RoundItem {
    item: QuizItem,
    order: Vec<String>,
}

#[function_component(QuizScreen)]
pub fn quiz_screen(props: &QuizScreenProps) -> Html {
    let round = use_state(|| {
        sample(&props.game.content.quiz_items, 8)
            .into_iter()
            .map(|item| RoundItem {
                order: shuffle(&item.options),
                item,
            })
            .collect::<Vec<_>>()
    });
    let index = use_state(|| 0usize);
    let wrong = use_state(Vec::<String>::new);
    let lock = use_state(|| false);
    let phase = use_state(|| "play".to_string());
    let feedback = use_state(String::new);
    let first = use_state(|| 0usize);

    let item = round.get(*index).map(|r| &r.item);

    let choose = {
        let game = props.game.clone();
        let round = round.clone();
        let index = index.clone();
        let wrong = wrong.clone();
        let lock = lock.clone();
        let phase = phase.clone();
        let feedback = feedback.clone();
        let first = first.clone();
        let on_done = props.on_done.clone();
        Callback::from(move |option: String| {
            if *lock {
                return;
            }
            let Some(round_item) = round.get(*index) else { return };
            if wrong.contains(&option) {
                return;
            }
            speak_plain(plain(&game.readings, &option));
            if option == round_item.item.answer {
                let clean = wrong.is_empty();
                lock.set(true);
                phase.set("ok".to_string());
                feedback.set(game.ui.text("correct"));
                play_correct();
                let first_val = if clean { *first + 1 } else { *first };
                first.set(first_val);
                let round_len = round.len();
                let idx = *index;
                let round_c = round.clone();
                let index_c = index.clone();
                let wrong_c = wrong.clone();
                let lock_c = lock.clone();
                let phase_c = phase.clone();
                let feedback_c = feedback.clone();
                let first_c = first.clone();
                let on_done_c = on_done.clone();
                let game_c = game.clone();
                Timeout::new(900, move || {
                    let next = idx + 1;
                    if next >= round_len {
                        on_done_c.emit((stars_for(first_val, round_len), quiz_detail(first_val, round_len)));
                        return;
                    }
                    index_c.set(next);
                    wrong_c.set(vec![]);
                    lock_c.set(false);
                    phase_c.set("play".to_string());
                    feedback_c.set(String::new());
                    let _ = game_c;
                    let _ = round_c;
                    let _ = first_c;
                })
                .forget();
                return;
            }
            let mut w = (*wrong).clone();
            w.push(option.clone());
            wrong.set(w.clone());
            play_wrong();
            if w.len() >= 2 {
                phase.set("show".to_string());
                feedback.set(game.ui.text("showAnswer"));
                lock.set(true);
            } else {
                feedback.set(game.ui.text("tryAgain"));
            }
        })
    };

    html! {
        <div>
            <Header title={props.game.ui.text("quizTitle")}
                step={ask_step(index.saturating_add(1), round.len())}
                game={props.game.clone()} font_ok={props.font_ok} on_back={props.on_exit.clone()} />
            if let Some(item) = item {
                <div class="panel card-shadow text-center">
                    <PictureView picture={item.picture.clone()} />
                    <p class="title-md mt-3"><BpmfText text={item.ask.clone()} game={props.game.clone()} font_ok={props.font_ok} /></p>
                    if !feedback.is_empty() {
                        <p class="feedback title-md">{ &*feedback }</p>
                    }
                    <div class="option-grid">
                        { for round[*index].order.iter().map(|opt| {
                            let picked_wrong = wrong.contains(opt);
                            let is_answer = phase.as_str() == "show" && *opt == item.answer;
                            let cls = classes!(
                                "option-btn", "card-shadow",
                                picked_wrong.then_some("option-wrong"),
                                is_answer.then_some("option-ok"),
                            );
                            let opt_c = opt.clone();
                            html! {
                                <button key={opt.clone()} type="button" class={cls} disabled={*lock || picked_wrong}
                                    onclick={choose.reform(move |_| opt_c.clone())}>
                                    <BpmfText text={opt.clone()} game={props.game.clone()} font_ok={props.font_ok} />
                                </button>
                            }
                        })}
                    </div>
                    if phase.as_str() == "show" {
                        <GameButton class={classes!("mt-3", "w-full")} onclick={Callback::from({
                            let index = index.clone();
                            let round = round.clone();
                            let wrong = wrong.clone();
                            let lock = lock.clone();
                            let phase = phase.clone();
                            let feedback = feedback.clone();
                            let first = first.clone();
                            let on_done = props.on_done.clone();
                            move |_| {
                                let next = *index + 1;
                                if next >= round.len() {
                                    on_done.emit((stars_for(*first, round.len()), quiz_detail(*first, round.len())));
                                    return;
                                }
                                index.set(next);
                                wrong.set(vec![]);
                                lock.set(false);
                                phase.set("play".to_string());
                                feedback.set(String::new());
                            }
                        })}>
                            <BpmfText text={props.game.ui.text("nextQuestion")} game={props.game.clone()} font_ok={props.font_ok} />
                        </GameButton>
                    }
                </div>
            }
        </div>
    }
}
