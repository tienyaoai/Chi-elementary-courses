use crate::components::BpmfAside;
use crate::progress::{PixelProgress, REWARDS};
use crate::sounds::{play_correct, play_reward, play_wrong};
use crate::sprites::{color_index, find_character, pixel_grid, CHARACTERS, PIX_H, PIX_W};
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
            <h1 class="pixel-title"><BpmfAside text={ "學習冒險島".to_string() } game={props.game.clone()} large=true /></h1>
            <p class="pixel-sub"><BpmfAside text={ "選一位冒險夥伴".to_string() } game={props.game.clone()} /></p>
            <div class="char-grid">
                { for CHARACTERS.iter().map(|ch| html! {
                    <CharCard key={ch.id} character_id={ch.id} game={props.game.clone()}
                        selected={props.progress.character_id == ch.id}
                        onclick={Callback::from({
                            let on_pick = props.on_pick.clone();
                            let id = ch.id.to_string();
                            move |_| on_pick.emit(id.clone())
                        })} />
                })}
            </div>
            <button type="button" class="pixel-btn primary" disabled={props.progress.character_id.is_empty()}
                onclick={props.on_start.clone()}>
                <BpmfAside text={ "出發".to_string() } game={props.game.clone()} />
            </button>
            <button type="button" class="pixel-btn ghost" onclick={props.on_collection.clone()}>
                <BpmfAside text={ "看收藏".to_string() } game={props.game.clone()} />
            </button>
        </section>
    }
}

#[derive(Properties, PartialEq)]
struct CharCardProps {
    character_id: &'static str,
    game: Rc<GameData>,
    selected: bool,
    onclick: Callback<MouseEvent>,
}

#[function_component(CharCard)]
fn char_card(props: &CharCardProps) -> Html {
    let canvas_ref = use_node_ref();
    {
        let canvas_ref = canvas_ref.clone();
        let id = props.character_id.to_string();
        use_effect_with(id.clone(), move |_| {
            let id = id.as_str();
            if let Some(canvas) = canvas_ref.cast::<web_sys::HtmlCanvasElement>() {
                canvas.set_width(72);
                canvas.set_height(96);
                if let Some(ctx) = canvas
                    .get_context("2d")
                    .ok()
                    .flatten()
                    .and_then(|c| c.dyn_into::<web_sys::CanvasRenderingContext2d>().ok())
                {
                    ctx.set_fill_style(&"#8ed56a".into());
                    ctx.fill_rect(0.0, 0.0, 72.0, 96.0);
                    ctx.set_image_smoothing_enabled(false);
                    let ch = find_character(id);
                    let grid = pixel_grid(id);
                    let scale = 4.0;
                    let ox = (72.0 - PIX_W as f32 * scale) / 2.0;
                    let oy = (96.0 - PIX_H as f32 * scale) / 2.0;
                    for (i, &b) in grid.as_bytes().iter().enumerate() {
                        if i >= PIX_W * PIX_H {
                            break;
                        }
                        let digit = b.wrapping_sub(b'0');
                        if digit == 0 {
                            continue;
                        }
                        let x = i % PIX_W;
                        let y = i / PIX_W;
                        ctx.set_fill_style(&color_index(&ch.palette, digit).into());
                        ctx.fill_rect(
                            (ox + x as f32 * scale) as f64,
                            (oy + y as f32 * scale) as f64,
                            scale as f64,
                            scale as f64,
                        );
                    }
                }
            }
            || ()
        });
    }
    html! {
        <button type="button" class={classes!("char-card", props.selected.then_some("selected"))} onclick={props.onclick.clone()}>
            <canvas ref={canvas_ref} class="char-preview" />
            <span class="pixel-name"><BpmfAside text={find_character(props.character_id).name.to_string()} game={props.game.clone()} /></span>
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
                <section class="lesson-panel">
                    <h2 class="lesson-head"><BpmfAside text={ "看圖找字".to_string() } game={props.game.clone()} large=true /></h2>
                    if let Some(q) = item {
                        <p class="lesson-step">{ format!("{} / {}", *q_idx + 1, quiz.len()) }</p>
                        <div class="emoji-huge">{ picture_emoji(&q.picture) }</div>
                        <p><BpmfAside text={q.ask.clone()} game={props.game.clone()} large=true /></p>
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
                                        <BpmfAside text={opt_c} game={props.game.clone()} />
                                    </button>
                                }
                            })}
                        </div>
                    }
                    if !feedback.is_empty() {
                        <p class="feedback-soft"><BpmfAside text={(*feedback).clone()} game={props.game.clone()} /></p>
                    }
                    <button type="button" class="pixel-btn ghost" onclick={props.on_exit.clone()}>
                        <BpmfAside text={ "回地圖".to_string() } game={props.game.clone()} />
                    </button>
                </section>
            }
        }
        LessonPhase::Order => {
            html! {
                <section class="lesson-panel">
                    <h2 class="lesson-head"><BpmfAside text={ "句子排排".to_string() } game={props.game.clone()} large=true /></h2>
                    if let Some(item) = (*order_item).clone() {
                        <div class="emoji-huge">{ &item.emoji }</div>
                        <div class="sentence-pixel">
                            { for chosen.iter().map(|t| html! {
                                <span class="chip-pixel"><BpmfAside text={t.clone()} game={props.game.clone()} /></span>
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
                                        <BpmfAside text={text.clone()} game={props.game.clone()} />
                                    </button>
                                }
                            })}
                        </div>
                        <button type="button" class="pixel-btn primary"
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
                            <BpmfAside text={ "看看對不對".to_string() } game={props.game.clone()} />
                        </button>
                    }
                    if !feedback.is_empty() {
                        <p class="feedback-soft"><BpmfAside text={(*feedback).clone()} game={props.game.clone()} /></p>
                    }
                    <button type="button" class="pixel-btn ghost" onclick={props.on_exit.clone()}>
                        <BpmfAside text={ "回地圖".to_string() } game={props.game.clone()} />
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

fn picture_emoji(p: &zhuyin_island_wasm::data::Picture) -> String {
    match p {
        zhuyin_island_wasm::data::Picture::Emoji { emoji } => emoji.clone(),
        zhuyin_island_wasm::data::Picture::Swatch { color } => format!("■{color}"),
        zhuyin_island_wasm::data::Picture::Digit { digit } => digit.clone(),
    }
}

#[derive(Properties, PartialEq)]
pub struct CollectionProps {
    pub game: Rc<GameData>,
    pub progress: PixelProgress,
    pub on_back: Callback<MouseEvent>,
}

#[function_component(CollectionScreen)]
pub fn collection_screen(props: &CollectionProps) -> Html {
    html! {
        <section class="panel-pixel">
            <h2 class="pixel-title"><BpmfAside text={ "我的收藏".to_string() } game={props.game.clone()} large=true /></h2>
            <ul class="reward-list">
                { for REWARDS.iter().map(|(id, name, desc)| {
                    let owned = props.progress.rewards.iter().any(|r| r == id);
                    html! {
                        <li class={classes!("reward-item", owned.then_some("owned"))}>
                            <span class="reward-icon">{ if owned { "★" } else { "☆" } }</span>
                            <div>
                                <BpmfAside text={(*name).to_string()} game={props.game.clone()} />
                                <p class="reward-desc"><BpmfAside text={(*desc).to_string()} game={props.game.clone()} /></p>
                            </div>
                        </li>
                    }
                })}
            </ul>
            <p class="pixel-sub"><BpmfAside text={ format!("角色：{}", find_character(&props.progress.character_id).name) } game={props.game.clone()} /></p>
            <button type="button" class="pixel-btn primary" onclick={props.on_back.clone()}>
                <BpmfAside text={ "返回".to_string() } game={props.game.clone()} />
            </button>
        </section>
    }
}
