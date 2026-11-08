use crate::audio::{play_correct, play_wrong};
use crate::bpmf::plain;
use crate::components::{BpmfText, GameButton, Header, speak_plain};
use crate::data::{ask_step, quiz_detail, story_step, GameData, StoryItem};
use crate::random::sample;
use crate::score::stars_for;
use std::rc::Rc;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct StoryScreenProps {
    pub game: Rc<GameData>,
    pub font_ok: bool,
    pub on_exit: Callback<MouseEvent>,
    pub on_done: Callback<(u8, String)>,
}

#[function_component(StoryScreen)]
pub fn story_screen(props: &StoryScreenProps) -> Html {
    let round = use_state(|| sample(&props.game.content.stories, 2));
    let story_index = use_state(|| 0usize);
    let question_index = use_state(|| None::<usize>);
    let wrong = use_state(Vec::<String>::new);
    let picked = use_state(|| None::<String>);
    let feedback = use_state(String::new);
    let first = use_state(|| 0usize);

    let story = round.get(*story_index).cloned();
    let question_total: usize = round.iter().map(|s| s.questions.len()).sum();

    let advance = {
        let round = round.clone();
        let story_index = story_index.clone();
        let question_index = question_index.clone();
        let wrong = wrong.clone();
        let picked = picked.clone();
        let feedback = feedback.clone();
        let first = first.clone();
        let on_done = props.on_done.clone();
        move |clean: bool| {
            if clean {
                first.set(*first + 1);
            }
            let Some(st) = round.get(*story_index) else { return };
            if let Some(qi) = *question_index {
                if qi + 1 < st.questions.len() {
                    question_index.set(Some(qi + 1));
                    wrong.set(vec![]);
                    picked.set(None);
                    feedback.set(String::new());
                    return;
                }
            }
            if *story_index + 1 < round.len() {
                story_index.set(*story_index + 1);
                question_index.set(None);
                wrong.set(vec![]);
                picked.set(None);
                feedback.set(String::new());
                return;
            }
            let fv = *first;
            on_done.emit((stars_for(fv, question_total), quiz_detail(fv, question_total)));
        }
    };

    let Some(story) = story else {
        return html! { <div></div> };
    };

    html! {
        <div>
            <Header title={story.title.clone()}
                step={if question_index.is_none() {
                    story_step(*story_index + 1, round.len())
                } else {
                    ask_step(question_index.unwrap() + 1, story.questions.len())
                }}
                game={props.game.clone()} font_ok={props.font_ok} on_back={props.on_exit.clone()} />
            <div class="panel card-shadow">
                <p class="emoji text-5xl">{ &story.emoji }</p>
                { for story.lines.iter().map(|line| html! {
                    <p class="story-line"><BpmfText text={line.clone()} game={props.game.clone()} font_ok={props.font_ok} /></p>
                })}
                if question_index.is_none() {
                    <GameButton onclick={Callback::from({
                        let question_index = question_index.clone();
                        let game = props.game.clone();
                        let lines = story.lines.join("");
                        move |_| {
                            speak_plain(plain(&game.readings, &lines));
                            question_index.set(Some(0));
                        }
                    })}>
                        <BpmfText text={props.game.ui.text("readDone")} game={props.game.clone()} font_ok={props.font_ok} />
                    </GameButton>
                } else if let Some(q) = story.questions.get(question_index.unwrap()) {
                    <p class="title-md mt-3"><BpmfText text={q.ask.clone()} game={props.game.clone()} font_ok={props.font_ok} /></p>
                    if !feedback.is_empty() {
                        <p class="feedback">{ &*feedback }</p>
                    }
                    <div class="option-grid">
                        { for q.options.iter().map(|opt| {
                            let opt_c = opt.clone();
                            html! {
                                <button type="button" class="option-btn card-shadow"
                                    disabled={picked.is_some() && *picked.as_ref().unwrap() != *opt}
                                    onclick={Callback::from({
                                        let game = props.game.clone();
                                        let wrong = wrong.clone();
                                        let picked = picked.clone();
                                        let feedback = feedback.clone();
                                        let advance = advance.clone();
                                        let answer = q.answer.clone();
                                        let opt = opt.clone();
                                        move |_| {
                                            if picked.is_some() { return; }
                                            speak_plain(plain(&game.readings, &opt));
                                            if opt == answer {
                                                picked.set(Some(opt.clone()));
                                                feedback.set(game.ui.text("correct"));
                                                play_correct();
                                                advance(true);
                                            } else {
                                                let mut w = (*wrong).clone();
                                                w.push(opt.clone());
                                                wrong.set(w.clone());
                                                play_wrong();
                                                if w.len() >= 2 {
                                                    picked.set(Some(answer.clone()));
                                                    feedback.set(game.ui.text("showAnswer"));
                                                    advance(false);
                                                } else {
                                                    feedback.set(game.ui.text("tryAgain"));
                                                }
                                            }
                                        }
                                    })}>
                                    <BpmfText text={opt_c} game={props.game.clone()} font_ok={props.font_ok} />
                                </button>
                            }
                        })}
                    </div>
                }
            </div>
        </div>
    }
}
