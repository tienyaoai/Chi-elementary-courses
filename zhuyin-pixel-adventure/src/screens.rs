use crate::components::BpmfAside;
use crate::grade1::Grade1Bank;
use crate::progress::{reward_catalog, PixelProgress};
use crate::sounds::{play_correct, play_reward, play_wrong};
use crate::map_config::{self, bust_url, CharacterEntry};
use crate::sprites::find_character;
use std::rc::Rc;
use wasm_bindgen::JsCast;
use yew::prelude::*;
use zhuyin_island_wasm::data::GameData;
use zhuyin_island_wasm::random::{sample, shuffle};

pub const LEVEL_ID: &str = "chinese-forest-1";
pub const REWARD_ID: &str = "star-zh-1";

#[derive(Properties, PartialEq)]
pub struct SelectScreenProps {
    pub game: Rc<GameData>,
    pub progress: PixelProgress,
    pub on_pick: Callback<String>,
    pub on_start: Callback<MouseEvent>,
    pub on_collection: Callback<MouseEvent>,
}

#[function_component(SelectScreen)]
pub fn select_screen(props: &SelectScreenProps) -> Html {
    html! {
        <section class="panel-pixel">
            <h1 class="pixel-title"><BpmfAside text={ "學習冒險島".to_string() } game={props.game.clone()} read=true /></h1>
            <p class="pixel-sub select-partner-line"><BpmfAside text={ "選一位冒險夥伴".to_string() } game={props.game.clone()} read=true /></p>
            <div class="char-grid char-grid-12">
                { for map_config::config().characters.iter().map(|ch| html! {
                    <CharCard key={ch.id.clone()} entry={ch.clone()} game={props.game.clone()}
                        selected={props.progress.character_id == ch.id}
                        onclick={Callback::from({
                            let on_pick = props.on_pick.clone();
                            let id = ch.id.clone();
                            move |_| on_pick.emit(id.clone())
                        })} />
                })}
            </div>
            <button type="button" class="pixel-btn primary big-touch" disabled={props.progress.character_id.is_empty()}
                onclick={props.on_start.clone()}>
                <BpmfAside text={ "出發".to_string() } game={props.game.clone()} read=true />
            </button>
            <button type="button" class="pixel-btn ghost big-touch" onclick={props.on_collection.clone()}>
                <BpmfAside text={ "看收藏".to_string() } game={props.game.clone()} read=true />
            </button>
        </section>
    }
}

#[derive(Properties, PartialEq)]
struct CharCardProps {
    entry: CharacterEntry,
    game: Rc<GameData>,
    selected: bool,
    onclick: Callback<MouseEvent>,
}

#[function_component(CharCard)]
fn char_card(props: &CharCardProps) -> Html {
    let url = bust_url(&props.entry);
    html! {
        <button type="button" class={classes!("char-card", "char-card-bust", props.selected.then_some("selected"))}
            data-testid="char-card"
            data-char-id={props.entry.id.clone()}
            onclick={props.onclick.clone()}>
            <img class="char-bust-img" src={url} alt="" decoding="sync" />
            <span class="pixel-name"><BpmfAside text={props.entry.short.clone()} game={props.game.clone()} read=true /></span>
        </button>
    }
}

#[derive(Clone, PartialEq)]
pub enum LessonPhase {
    Quiz,
    Order,
    Done,
}

#[derive(Properties, PartialEq)]
pub struct ChineseLevelProps {
    pub game: Rc<GameData>,
    pub on_exit: Callback<MouseEvent>,
    pub on_complete: Callback<()>,
}

#[function_component(ChineseLevel)]
pub fn chinese_level(props: &ChineseLevelProps) -> Html {
    let phase = use_state(|| LessonPhase::Quiz);
    let quiz = use_state(|| {
        sample(&props.game.content.quiz_items, 3)
            .into_iter()
            .map(|item| {
                let options = shuffle(&item.options);
                zhuyin_island_wasm::data::QuizItem { options, ..item }
            })
            .collect::<Vec<_>>()
    });
    let q_idx = use_state(|| 0usize);
    let q_wrong = use_state(Vec::<String>::new);
    let order_item = use_state(|| {
        sample(&props.game.content.order_items, 1)
            .into_iter()
            .next()
    });
    let chosen = use_state(Vec::<String>::new);
    let chips = use_state(Vec::<(String, String)>::new);
    let feedback = use_state(String::new);

    {
        let order_item = order_item.clone();
        let chips = chips.clone();
        use_effect_with((), move |_| {
            if let Some(item) = order_item.as_ref() {
                let mut list: Vec<(String, String)> = item
                    .chunks
                    .iter()
                    .enumerate()
                    .map(|(i, t)| (format!("{}-{i}", item.id), t.clone()))
                    .collect();
                list = shuffle(&list);
                chips.set(list);
            }
            || ()
        });
    }

    match *phase {
        LessonPhase::Quiz => {
            let item = quiz.get(*q_idx);
            html! {
                <section class="lesson-panel lesson-read">
                    <h2 class="lesson-head"><BpmfAside text={ "看圖找字".to_string() } game={props.game.clone()} read=true /></h2>
                    if let Some(q) = item {
                        <p class="lesson-step">{ format!("{} / {}", *q_idx + 1, quiz.len()) }</p>
                        { picture_block(&q.picture) }
                        <p class="lesson-ask"><BpmfAside text={q.ask.clone()} game={props.game.clone()} read=true /></p>
                        <div class="opt-grid">
                            { for q.options.iter().map(|opt| {
                                let opt_c = opt.clone();
                                let disabled = q_wrong.contains(opt);
                                html! {
                                    <button type="button" class="opt-pixel" disabled={disabled}
                                        onclick={Callback::from({
                                            let game = props.game.clone();
                                            let quiz = quiz.clone();
                                            let q_idx = q_idx.clone();
                                            let q_wrong = q_wrong.clone();
                                            let phase = phase.clone();
                                            let feedback = feedback.clone();
                                            let answer = q.answer.clone();
                                            let picked = opt_c.clone();
                                            move |_| {
                                                if picked == answer {
                                                    play_correct();
                                                    feedback.set(game.ui.text("correct"));
                                                    let next = *q_idx + 1;
                                                    if next >= quiz.len() {
                                                        phase.set(LessonPhase::Order);
                                                        feedback.set(String::new());
                                                    } else {
                                                        q_idx.set(next);
                                                        q_wrong.set(vec![]);
                                                        feedback.set(String::new());
                                                    }
                                                } else if !q_wrong.contains(&picked) {
                                                    play_wrong();
                                                    let mut w = (*q_wrong).clone();
                                                    w.push(picked.clone());
                                                    q_wrong.set(w);
                                                    feedback.set(game.ui.text("tryAgain"));
                                                }
                                            }
                                        })}>
                                        <BpmfAside text={opt_c} game={props.game.clone()} read=true />
                                    </button>
                                }
                            })}
                        </div>
                    }
                    if !feedback.is_empty() {
                        <p class="feedback-soft"><BpmfAside text={(*feedback).clone()} game={props.game.clone()} read=true /></p>
                    }
                    <button type="button" class="pixel-btn ghost lesson-btn" onclick={props.on_exit.clone()}>
                        <BpmfAside text={ "回地圖".to_string() } game={props.game.clone()} read=true />
                    </button>
                </section>
            }
        }
        LessonPhase::Order => {
            html! {
                <section class="lesson-panel lesson-read">
                    <h2 class="lesson-head"><BpmfAside text={ "句子排排".to_string() } game={props.game.clone()} read=true /></h2>
                    if let Some(item) = (*order_item).clone() {
                        <div class="quiz-picture order-picture">
                            <span class="quiz-emoji" role="img">{ &item.emoji }</span>
                        </div>
                        <div class="sentence-pixel">
                            { for chosen.iter().map(|t| html! {
                                <span class="chip-pixel"><BpmfAside text={t.clone()} game={props.game.clone()} read=true /></span>
                            })}
                        </div>
                        <div class="chip-row-pixel">
                            { for chips.iter().map(|(id, text)| {
                                let used = chosen.iter().any(|c| c == text);
                                html! {
                                    <button type="button" class="chip-pixel" disabled={used}
                                        onclick={Callback::from({
                                            let chosen = chosen.clone();
                                            let text = text.clone();
                                            move |_| {
                                                if used { return; }
                                                let mut v = (*chosen).clone();
                                                v.push(text.clone());
                                                chosen.set(v);
                                            }
                                        })}>
                                        <BpmfAside text={text.clone()} game={props.game.clone()} read=true />
                                    </button>
                                }
                            })}
                        </div>
                        <button type="button" class="pixel-btn primary lesson-btn"
                            onclick={Callback::from({
                                let game = props.game.clone();
                                let chosen = chosen.clone();
                                let item = item.clone();
                                let phase = phase.clone();
                                let feedback = feedback.clone();
                                let on_complete = props.on_complete.clone();
                                move |_| {
                                    if chosen.len() != item.chunks.len() {
                                        feedback.set(game.ui.text("orderLeft"));
                                        play_wrong();
                                        return;
                                    }
                                    let attempt: String = chosen.iter().cloned().collect();
                                    if attempt == item.chunks.join("") {
                                        play_correct();
                                        phase.set(LessonPhase::Done);
                                        on_complete.emit(());
                                    } else {
                                        play_wrong();
                                        feedback.set(game.ui.text("orderWrong"));
                                    }
                                }
                            })}>
                            <BpmfAside text={ "看看對不對".to_string() } game={props.game.clone()} read=true />
                        </button>
                    }
                    if !feedback.is_empty() {
                        <p class="feedback-soft"><BpmfAside text={(*feedback).clone()} game={props.game.clone()} read=true /></p>
                    }
                    <button type="button" class="pixel-btn ghost lesson-btn" onclick={props.on_exit.clone()}>
                        <BpmfAside text={ "回地圖".to_string() } game={props.game.clone()} read=true />
                    </button>
                </section>
            }
        }
        LessonPhase::Done => html! {
            <section class="lesson-panel victory">
                <h2><BpmfAside text={ "關卡通過".to_string() } game={props.game.clone()} large=true /></h2>
                <p><BpmfAside text={ "領取獎勵後回地圖".to_string() } game={props.game.clone()} /></p>
                <button type="button" class="pixel-btn primary" onclick={props.on_exit.clone()}>
                    <BpmfAside text={ "回地圖".to_string() } game={props.game.clone()} />
                </button>
            </section>
        },
    }
}

fn picture_block(p: &zhuyin_island_wasm::data::Picture) -> Html {
    match p {
        zhuyin_island_wasm::data::Picture::Emoji { emoji } => html! {
            <div class="quiz-picture">
                <span class="quiz-emoji" role="img">{ emoji.clone() }</span>
            </div>
        },
        zhuyin_island_wasm::data::Picture::Swatch { color } => html! {
            <div class="quiz-picture">
                <span class="quiz-swatch" style={format!("background-color: {color}")} role="img" aria-label="顏色" />
            </div>
        },
        zhuyin_island_wasm::data::Picture::Digit { digit } => html! {
            <div class="quiz-picture">
                <span class="quiz-digit" role="img">{ digit.clone() }</span>
            </div>
        },
    }
}

#[derive(Properties, PartialEq)]
pub struct CollectionProps {
    pub game: Rc<GameData>,
    pub bank: Rc<Grade1Bank>,
    pub progress: PixelProgress,
    pub on_back: Callback<MouseEvent>,
}

#[function_component(CollectionScreen)]
pub fn collection_screen(props: &CollectionProps) -> Html {
    html! {
        <section class="panel-pixel collection-panel">
            <h2 class="pixel-title"><BpmfAside text={ "我的收藏".to_string() } game={props.game.clone()} read=true /></h2>
            <ul class="reward-list">
                { for reward_catalog(&props.bank).iter().map(|(id, name, desc)| {
                    let owned = props.progress.rewards.iter().any(|r| r == id);
                    html! {
                        <li class={classes!("reward-item", owned.then_some("owned"))}>
                            <span class="reward-icon">{ if owned { "★" } else { "☆" } }</span>
                            <div>
                                <BpmfAside text={(*name).to_string()} game={props.game.clone()} read=true />
                                <p class="reward-desc"><BpmfAside text={(*desc).to_string()} game={props.game.clone()} read=true /></p>
                            </div>
                        </li>
                    }
                })}
            </ul>
            <p class="pixel-sub"><BpmfAside text={ format!("角色：{}", find_character(&props.progress.character_id).short) } game={props.game.clone()} read=true /></p>
            <button type="button" class="pixel-btn primary big-touch" onclick={props.on_back.clone()}>
                <BpmfAside text={ "返回".to_string() } game={props.game.clone()} read=true />
            </button>
        </section>
    }
}
