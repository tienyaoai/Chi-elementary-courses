use crate::audio::{play_match, play_wrong};
use crate::bpmf::plain;
use crate::components::{BpmfText, Header};
use crate::data::{memory_detail, GameData, MemoryDeck};
use crate::random::shuffle;
use crate::score::memory_stars;
use gloo::timers::callback::Timeout;
use std::rc::Rc;
use yew::prelude::*;

#[derive(Clone)]
struct Face {
    uid: String,
    pair_id: String,
    kind: &'static str,
    word: String,
    emoji: String,
}

fn deal(deck: &MemoryDeck) -> Vec<Face> {
    let faces: Vec<Face> = deck
        .pairs
        .iter()
        .flat_map(|pair| {
            [
                Face {
                    uid: format!("{}-word", pair.id),
                    pair_id: pair.id.clone(),
                    kind: "word",
                    word: pair.word.clone(),
                    emoji: pair.emoji.clone(),
                },
                Face {
                    uid: format!("{}-emoji", pair.id),
                    pair_id: pair.id.clone(),
                    kind: "emoji",
                    word: pair.word.clone(),
                    emoji: pair.emoji.clone(),
                },
            ]
        })
        .collect();
    shuffle(&faces)
}

#[derive(Properties, PartialEq)]
pub struct MemoryScreenProps {
    pub game: Rc<GameData>,
    pub font_ok: bool,
    pub on_exit: Callback<MouseEvent>,
    pub on_done: Callback<(u8, String)>,
}

#[function_component(MemoryScreen)]
pub fn memory_screen(props: &MemoryScreenProps) -> Html {
    let deck = use_state(|| None::<MemoryDeck>);
    let faces = use_state(Vec::<Face>::new);
    let open = use_state(Vec::<String>::new);
    let matched = use_state(Vec::<String>::new);
    let moves = use_state(|| 0usize);
    let feedback = use_state(String::new);
    let lock = use_state(|| false);

    let start = {
        let deck = deck.clone();
        let faces = faces.clone();
        let open = open.clone();
        let matched = matched.clone();
        let moves = moves.clone();
        let feedback = feedback.clone();
        let lock = lock.clone();
        Callback::from(move |d: MemoryDeck| {
            deck.set(Some(d.clone()));
            faces.set(deal(&d));
            open.set(vec![]);
            matched.set(vec![]);
            moves.set(0);
            feedback.set(String::new());
            lock.set(false);
        })
    };

    if deck.is_none() {
        return html! {
            <div>
                <Header title={props.game.ui.text("memoryTitle")} step={props.game.ui.text("memoryPick")}
                    game={props.game.clone()} font_ok={props.font_ok} on_back={props.on_exit.clone()} />
                <div class="stack">
                    { for props.game.content.decks.iter().map(|item| html! {
                        <button type="button" class="home-tile card-shadow" onclick={start.reform({
                            let d = item.clone();
                            move |_| d.clone()
                        })}>
                            <span class="emoji text-4xl">{ &item.pairs.first().map(|p| p.emoji.clone()).unwrap_or_default() }</span>
                            <BpmfText text={item.title.clone()} game={props.game.clone()} font_ok={props.font_ok} />
                        </button>
                    })}
                </div>
            </div>
        };
    }

    let flip = {
        let faces = faces.clone();
        let open = open.clone();
        let matched = matched.clone();
        let moves = moves.clone();
        let feedback = feedback.clone();
        let lock = lock.clone();
        let deck_c = deck.clone();
        let on_done = props.on_done.clone();
        let game = props.game.clone();
        Callback::from(move |uid: String| {
            if *lock || open.contains(&uid) {
                return;
            }
            let Some(d) = &*deck else { return };
            let face = faces.iter().find(|f| f.uid == uid);
            let Some(face) = face else { return };
            if matched.contains(&face.pair_id) {
                return;
            }
            let mut next_open = (*open).clone();
            next_open.push(uid.clone());
            open.set(next_open.clone());
            if next_open.len() < 2 {
                return;
            }
            moves.set(*moves + 1);
            lock.set(true);
            let f1 = faces.iter().find(|f| f.uid == next_open[0]).cloned();
            let f2 = faces.iter().find(|f| f.uid == next_open[1]).cloned();
            if let (Some(a), Some(b)) = (f1, f2) {
                if a.pair_id == b.pair_id {
                    feedback.set(game.ui.text("matchOk"));
                    play_match();
                    let matched_c = matched.clone();
                    let open_c = open.clone();
                    let lock_c = lock.clone();
                    let mut next_m = (*matched).clone();
                    next_m.push(a.pair_id.clone());
                    let pairs = d.pairs.len();
                    let mv = *moves;
                    let on_done_c = on_done.clone();
                    Timeout::new(450, move || {
                        matched_c.set(next_m.clone());
                        open_c.set(vec![]);
                        lock_c.set(false);
                        if next_m.len() == pairs {
                            on_done_c.emit((memory_stars(mv, pairs), memory_detail(mv)));
                        }
                    })
                    .forget();
                } else {
                    feedback.set(game.ui.text("matchNo"));
                    play_wrong();
                    let open_c = open.clone();
                    let lock_c = lock.clone();
                    Timeout::new(900, move || {
                        open_c.set(vec![]);
                        lock_c.set(false);
                    })
                    .forget();
                }
            }
            let _ = deck_c;
        })
    };

    html! {
        <div>
            <Header title={props.game.ui.text("memoryTitle")} step={props.game.ui.text("memoryHint")}
                game={props.game.clone()} font_ok={props.font_ok} on_back={props.on_exit.clone()} />
            if !feedback.is_empty() {
                <p class="feedback">{ &*feedback }</p>
            }
            <div class="memory-grid">
                { for faces.iter().map(|face| {
                    let up = open.contains(&face.uid) || matched.contains(&face.pair_id);
                    let uid = face.uid.clone();
                    html! {
                        <button type="button" class={classes!("memory-card", "flip-card", up.then_some("is-up"))}
                            onclick={flip.reform(move |_| uid.clone())}>
                            <span class="flip-face flip-back emoji">{ if face.kind == "emoji" { face.emoji.clone() } else { "📋".into() } }</span>
                            <span class="flip-face flip-front">
                                if face.kind == "word" && up {
                                    <BpmfText text={face.word.clone()} game={props.game.clone()} font_ok={props.font_ok} />
                                } else if up {
                                    <span class="emoji text-4xl">{face.emoji.clone()}</span>
                                } else {
                                    <BpmfText text={props.game.ui.text("covered")} game={props.game.clone()} font_ok={props.font_ok} />
                                }
                            </span>
                        </button>
                    }
                })}
            </div>
        </div>
    }
}
