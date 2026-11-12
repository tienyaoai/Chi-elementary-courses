use crate::components::{question_has_prompt_visual, BpmfAside, PixelPicture, PromptZhuyin, QuestionVisual};
use crate::grade1::{Grade1Bank, Grade1Option, UnitPack};
use crate::pixel_art_manifest::image_url;
use crate::pixel_art_preload::preload_urls;
use crate::progress::PixelProgress;
use crate::sounds::{play_correct, play_wrong};
use crate::tts;
use std::rc::Rc;
use yew::prelude::*;
use zhuyin_island_wasm::data::GameData;

#[derive(Properties, PartialEq)]
pub struct Grade1HubProps {
    pub game: Rc<GameData>,
    pub bank: Rc<Grade1Bank>,
    pub progress: PixelProgress,
    pub hub_title: String,
    pub hub_subtitle: String,
    pub on_exit: Callback<MouseEvent>,
    pub on_pick_unit: Callback<String>,
}

#[function_component(Grade1Hub)]
pub fn grade1_hub(props: &Grade1HubProps) -> Html {
    {
        let bank = props.bank.clone();
        use_effect_with((), move |_| {
            let urls: Vec<String> = bank
                .all_image_descriptions()
                .into_iter()
                .filter_map(|d| image_url(&d))
                .collect();
            preload_urls(urls);
            || ()
        });
    }
    html! {
        <section class="panel-pixel lesson-read hub-panel">
            <h1 class="pixel-title"><BpmfAside text={props.hub_title.clone()} game={props.game.clone()} read=true /></h1>
            <p class="pixel-sub"><BpmfAside text={props.hub_subtitle.clone()} game={props.game.clone()} read=true /></p>
            <details class="teacher-note">
                <summary class="teacher-note-summary">{"給家長／老師看的單元說明"}</summary>
                <ul class="teacher-unit-list">
                    { for props.bank.units.iter().map(|u| html! {
                        <li key={u.key.level_id()}>
                            <strong>{ &u.title }{ " — " }{ &u.teacher_subtitle }</strong>
                        </li>
                    })}
                </ul>
            </details>
            <div class="unit-island-grid">
                { for props.bank.units.iter().map(|u| {
                    let done = props.progress.unit_cleared(&u.key.level_id());
                    let n = props.progress.unit_answered_count(u);
                    let level_id = u.key.level_id();
                    html! {
                        <button type="button" class={classes!("unit-island-card", done.then_some("cleared"))}
                            onclick={Callback::from({
                                let cb = props.on_pick_unit.clone();
                                let level_id = level_id.clone();
                                move |_| cb.emit(level_id.clone())
                            })}>
                            <h2 class="unit-island-title">
                                <PromptZhuyin glyphs={u.title_zhuyin.clone()} read=true />
                            </h2>
                            <p class="unit-progress-label">{ format!("{n} / {}", u.questions.len()) }</p>
                            if done {
                                <span class="unit-badge">{"★ 通關"}</span>
                            }
                        </button>
                    }
                })}
            </div>
            <button type="button" class="pixel-btn ghost big-touch" onclick={props.on_exit.clone()}>
                <BpmfAside text={ "回地圖".to_string() } game={props.game.clone()} read=true />
            </button>
        </section>
    }
}

#[derive(Properties, PartialEq)]
pub struct Grade1UnitProps {
    pub game: Rc<GameData>,
    pub bank: Rc<Grade1Bank>,
    pub unit: UnitPack,
    pub progress: PixelProgress,
    pub on_exit: Callback<MouseEvent>,
    pub on_unit_complete: Callback<String>,
}

#[function_component(Grade1Unit)]
pub fn grade1_unit(props: &Grade1UnitProps) -> Html {
    let q_idx = use_state(|| {
        let live = PixelProgress::load();
        props
            .unit
            .questions
            .iter()
            .position(|q| !live.questions_passed.contains(&q.id))
            .unwrap_or(0)
    });
    let feedback = use_state(String::new);
    let explain = use_state(|| None::<String>);
    let wrong = use_state(Vec::<String>::new);
    let tts_ok = use_state(tts::speech_supported);

    let question = props.unit.questions.get(*q_idx).cloned();

    let pick = {
        let unit = props.unit.clone();
        let q_idx = q_idx.clone();
        let feedback = feedback.clone();
        let explain = explain.clone();
        let wrong = wrong.clone();
        let on_unit_complete = props.on_unit_complete.clone();
        Callback::from(move |opt_id: String| {
            if let Some(q) = unit.questions.get(*q_idx) {
                if opt_id != q.answer {
                    if !wrong.contains(&opt_id) {
                        let mut w = (*wrong).clone();
                        w.push(opt_id);
                        wrong.set(w);
                    }
                    play_wrong();
                    feedback.set("再想一想。".to_string());
                    return;
                }
                play_correct();
                let q_id = q.id.clone();
                let _p = PixelProgress::patch_saved(|p| {
                    p.questions_passed.insert(q_id);
                });
                feedback.set(String::new());
                explain.set(Some(q.explain.clone()));
                gloo_timers::callback::Timeout::new(900, {
                    let q_idx = q_idx.clone();
                    let explain = explain.clone();
                    let unit = unit.clone();
                    let on_unit_complete = on_unit_complete.clone();
                    move || {
                        explain.set(None);
                        let next = *q_idx + 1;
                        if next >= unit.questions.len() {
                            let lid = unit.key.level_id();
                            let _p = PixelProgress::patch_saved(|p| {
                                p.mark_unit_cleared(&lid);
                            });
                            on_unit_complete.emit(lid);
                        } else {
                            q_idx.set(next);
                        }
                    }
                })
                .forget();
            }
        })
    };

    html! {
        <section class="lesson-panel lesson-read" data-question-id={question.as_ref().map(|q| q.id.clone()).unwrap_or_default()}>
            <h2 class="lesson-head">
                <PromptZhuyin glyphs={props.unit.title_zhuyin.clone()} read=true />
            </h2>
            if let Some(ref q) = question {
                <p class="lesson-step">{ format!("{} / {}", *q_idx + 1, props.unit.questions.len()) }</p>
                <p class="qtype-pill">{ qtype_label(&q.qtype) }</p>
                if question_has_prompt_visual(q) {
                    <QuestionVisual question={q.clone()} />
                }
                <p class="lesson-ask">
                    <PromptZhuyin glyphs={q.prompt_zhuyin.clone()} read=true />
                </p>
                if *tts_ok {
                    if let Some(ref say) = q.speech_en {
                        if !say.trim().is_empty() {
                            <button type="button" class="pixel-btn listen-en-btn" onclick={Callback::from({
                                let say = say.clone();
                                move |_| tts::speak_english(&say)
                            })}>
                                {"🔊 聽發音"}
                            </button>
                        }
                    }
                }
                <div class={classes!("opt-grid", options_are_pictorial(q).then_some("opt-grid-image-match"))}>
                    { for q.options.iter().map(|opt| render_option(opt, &wrong, pick.clone())) }
                </div>
            }
            if !feedback.is_empty() {
                <p class="feedback-soft"><BpmfAside text={(*feedback).clone()} game={props.game.clone()} read=true /></p>
            }
            if let (Some(q), Some(ex)) = (question.as_ref(), (*explain).as_ref()) {
                <div class="explain-box">
                    <p class="explain-target">{ &q.target_zhuyin }</p>
                    <p class="explain-text">{ ex }</p>
                </div>
            }
            <button type="button" class="pixel-btn ghost lesson-btn" onclick={props.on_exit.clone()}>
                <BpmfAside text={ "回選關".to_string() } game={props.game.clone()} read=true />
            </button>
        </section>
    }
}

fn options_are_pictorial(q: &crate::grade1::Grade1Question) -> bool {
    q.options.iter().all(|o| {
        o.image
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
    })
}

fn should_show_prompt_picture(q: &crate::grade1::Grade1Question, img: &str) -> bool {
    let t = img.trim();
    if t.is_empty() || t == "三張選項圖" {
        return false;
    }
    !options_are_pictorial(q)
}

fn qtype_label(t: &str) -> &'static str {
    match t {
        "choose_zhuyin" => "選注音",
        "choose_char" => "選國字",
        "choose_word" => "選詞語",
        "match_image" => "看圖配音",
        "tone" => "聲調",
        "fill" => "填空",
        "count_image" => "數一數",
        "compare_num" => "比大小",
        "add_within_10" => "加法",
        "subtract_within_10" => "減法",
        "shape_time" => "形狀時間",
        "english_letter" => "英文字母",
        "english_color" => "顏色",
        "english_number" => "英文數字",
        "english_vocab" => "單字",
        "english_phrase" => "會話",
        _ => "挑戰",
    }
}

fn render_option(
    opt: &Grade1Option,
    wrong: &UseStateHandle<Vec<String>>,
    pick: Callback<String>,
) -> Html {
    let disabled = wrong.contains(&opt.id);
    let id = opt.id.clone();
    let pictorial = opt
        .image
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    html! {
        <button type="button" class={classes!("opt-pixel", pictorial.then_some("opt-pixel-image-only"))}
            disabled={disabled}
            onclick={Callback::from(move |_| pick.emit(id.clone()))}>
            if let Some(img) = &opt.image {
                if !img.trim().is_empty() {
                    <PixelPicture description={img.clone()} large=true />
                }
            }
            if !pictorial {
                { render_option_label(opt) }
            }
        </button>
    }
}

fn render_option_label(opt: &Grade1Option) -> Html {
    if opt.text.chars().all(|c| is_bopomofo_char(c)) {
        return html! { <span class="opt-zhuyin-symbol">{ &opt.text }</span> };
    }
    if let Some(z) = &opt.zhuyin {
        let glyphs: Vec<crate::grade1::ZhuyinGlyph> = opt
            .text
            .chars()
            .zip(option_zhuyin_parts(z))
            .map(|(ch, rt)| crate::grade1::ZhuyinGlyph {
                char: ch.to_string(),
                zhuyin: rt,
            })
            .collect();
        if glyphs.len() == opt.text.chars().count() {
            return html! { <PromptZhuyin glyphs={glyphs} read=true /> };
        }
    }
    html! { <span class="opt-plain-text">{ &opt.text }</span> }
}

fn option_zhuyin_parts(z: &str) -> Vec<String> {
    z.split_whitespace().map(|s| s.to_string()).collect()
}

fn is_bopomofo_char(c: char) -> bool {
    matches!(c, 'ㄅ'..='ㄩ' | 'ˊ' | 'ˇ' | 'ˋ' | '˙')
}
