use crate::components::{BpmfAside, PixelMap, TouchPad};
use crate::grade1::Grade1Bank;
use crate::grade1_screens::{Grade1Hub, Grade1Unit};
use crate::input::{bind_keyboard, Dir};
use crate::progress::PixelProgress;
use crate::screens::{CollectionScreen, SelectScreen};
use crate::sounds::{play_reward, portal_blip};
use crate::world::{self, Portal};
use std::rc::Rc;
use wasm_bindgen_futures::spawn_local;
use yew::prelude::*;
use zhuyin_island_wasm::data::load_game_data;

#[derive(Clone, PartialEq)]
enum View {
    Select,
    Map,
    ChineseHub,
    ChineseUnit {
        unit_id: String,
    },
    UnitClaim {
        unit_id: String,
    },
    Collection,
    Locked {
        subject: &'static str,
    },
}

#[function_component(App)]
pub fn app() -> Html {
    let game = use_state(|| None::<Rc<zhuyin_island_wasm::data::GameData>>);
    let bank = use_state(|| Rc::new(Grade1Bank::from_embedded()));
    let progress = use_state(PixelProgress::load);
    let view = use_state(|| {
        if progress.character_id.is_empty() {
            View::Select
        } else {
            View::Map
        }
    });
    let px = use_state(|| progress.player_x);
    let py = use_state(|| progress.player_y);
    let frame = use_state(|| 0u8);

    {
        let game = game.clone();
        use_effect_with((), move |_| {
            let game = game.clone();
            spawn_local(async move {
                if let Ok(data) = load_game_data().await {
                    game.set(Some(data));
                }
            });
            || ()
        });
    }

    let prime_audio = Callback::from(|_| {
        crate::sounds::prime_audio();
    });

    let move_dir = {
        let px = px.clone();
        let py = py.clone();
        let frame = frame.clone();
        let progress = progress.clone();
        Callback::from(move |dir: Dir| {
            let (mut x, mut y) = (*px, *py);
            match dir {
                Dir::Up => y -= 1.0,
                Dir::Down => y += 1.0,
                Dir::Left => x -= 1.0,
                Dir::Right => x += 1.0,
                Dir::None => return,
            }
            let tx = x.round() as i32;
            let ty = y.round() as i32;
            if world::walkable(tx, ty) {
                px.set(x);
                py.set(y);
                frame.set(*frame + 1);
                let mut p = (*progress).clone();
                p.player_x = x;
                p.player_y = y;
                p.save();
                progress.set(p);
            }
        })
    };

    bind_keyboard(Callback::from({
        let move_dir = move_dir.clone();
        let prime = prime_audio.clone();
        move |dir| {
            prime.emit(());
            move_dir.emit(dir);
        }
    }));

    let Some(game) = (*game).clone() else {
        return html! {
            <main class="shell-pixel shell-wide">
                <p class="loading-pixel">{"載入中…"}</p>
            </main>
        };
    };

    let portal_near = {
        let tx = px.round() as i32;
        let ty = py.round() as i32;
        world::portal_at(tx, ty)
    };

    let toggle_sound = {
        let progress = progress.clone();
        Callback::from(move |_| {
            let mut p = (*progress).clone();
            p.sound = !p.sound;
            p.save();
            progress.set(p);
        })
    };

    let body = match &*view {
        View::Select => html! {
            <SelectScreen game={game.clone()} progress={(*progress).clone()}
                on_pick={Callback::from({
                    let progress = progress.clone();
                    move |id| {
                        let mut p = (*progress).clone();
                        p.character_id = id;
                        p.save();
                        progress.set(p);
                    }
                })}
                on_start={Callback::from({
                    let view = view.clone();
                    move |_| view.set(View::Map)
                })}
                on_collection={Callback::from({
                    let view = view.clone();
                    move |_| view.set(View::Collection)
                })} />
        },
        View::Map => html! {
            <div class="map-screen">
                <div class="hud">
                    <BpmfAside text={ "學習冒險島".to_string() } game={game.clone()} read=true />
                    <button type="button" class="hud-btn" onclick={toggle_sound.clone()}>
                        <BpmfAside text={ if progress.sound { "關閉音效".to_string() } else { "開啟音效".to_string() } } game={game.clone()} read=true />
                    </button>
                </div>
                <PixelMap character_id={progress.character_id.clone()} px={*px} py={*py} frame={*frame}
                    enter_label={ "進入國語小島".to_string() }
                    portal_near={portal_near}
                    on_enter={Callback::from({
                        let view = view.clone();
                        move |portal| {
                            portal_blip();
                            match portal {
                                Portal::Chinese => view.set(View::ChineseHub),
                                Portal::English => view.set(View::Locked { subject: "英語" }),
                                Portal::Math => view.set(View::Locked { subject: "數學" }),
                            }
                        }
                    })} />
                <TouchPad on_dir={move_dir.clone()} on_interact={prime_audio.clone()} />
                <div class="map-actions">
                    <button type="button" class="pixel-btn ghost" onclick={Callback::from({
                        let view = view.clone();
                        move |_| view.set(View::Collection)
                    })}>
                        <BpmfAside text={ "收藏".to_string() } game={game.clone()} read=true />
                    </button>
                    <button type="button" class="pixel-btn ghost" onclick={Callback::from({
                        let view = view.clone();
                        move |_| view.set(View::Select)
                    })}>
                        <BpmfAside text={ "換角色".to_string() } game={game.clone()} read=true />
                    </button>
                </div>
                if matches!(portal_near, Some(Portal::English | Portal::Math)) {
                    <p class="locked-hint"><BpmfAside text={ "這個科目即將開放".to_string() } game={game.clone()} read=true /></p>
                }
            </div>
        },
        View::ChineseHub => html! {
            <Grade1Hub game={game.clone()} bank={(*bank).clone()} progress={(*progress).clone()}
                on_exit={Callback::from({
                    let view = view.clone();
                    let progress = progress.clone();
                    move |_| {
                        progress.set(PixelProgress::load());
                        view.set(View::Map);
                    }
                })}
                on_pick_unit={Callback::from({
                    let view = view.clone();
                    move |unit_id| view.set(View::ChineseUnit { unit_id })
                })} />
        },
        View::ChineseUnit { unit_id } => {
            if let Some(unit) = bank.unit_by_id(unit_id) {
                html! {
                    <Grade1Unit bank={(*bank).clone()} unit={unit.clone()} progress={(*progress).clone()}
                        on_exit={Callback::from({
                            let view = view.clone();
                            let progress = progress.clone();
                            move |_| {
                                progress.set(PixelProgress::load());
                                view.set(View::ChineseHub);
                            }
                        })}
                        on_unit_complete={Callback::from({
                            let progress = progress.clone();
                            let view = view.clone();
                            let bank = bank.clone();
                            let unit_id = unit_id.clone();
                            move |_| {
                                let mut p = PixelProgress::load();
                                if let Some(u) = bank.unit_by_id(&unit_id) {
                                    let rid = u.key.reward_id();
                                    if p.claim_unit(&unit_id, &rid) {
                                        play_reward();
                                    }
                                }
                                p.save();
                                progress.set(p);
                                view.set(View::UnitClaim { unit_id: unit_id.clone() });
                            }
                        })} />
                }
            } else {
                html! { <p>{"找不到小島"}</p> }
            }
        }
        View::UnitClaim { unit_id } => {
            let title = bank
                .unit_by_id(unit_id)
                .map(|u| u.title.clone())
                .unwrap_or_else(|| "小島".to_string());
            html! {
                <section class="panel-pixel victory">
                    <h2><BpmfAside text={ "獲得獎勵".to_string() } game={game.clone()} read=true /></h2>
                    <p><BpmfAside text={ format!("{title}小星星已入收藏") } game={game.clone()} read=true /></p>
                    <button type="button" class="pixel-btn primary big-touch" onclick={Callback::from({
                        let view = view.clone();
                        move |_| view.set(View::ChineseHub)
                    })}>
                        <BpmfAside text={ "回選關".to_string() } game={game.clone()} read=true />
                    </button>
                </section>
            }
        }
        View::Collection => html! {
            <CollectionScreen game={game.clone()} bank={(*bank).clone()} progress={(*progress).clone()}
                on_back={Callback::from({
                    let view = view.clone();
                    move |_| view.set(if progress.character_id.is_empty() { View::Select } else { View::Map })
                })} />
        },
        View::Locked { subject } => html! {
            <section class="panel-pixel">
                <p><BpmfAside text={ format!("{subject}即將開放") } game={game.clone()} read=true /></p>
                <button type="button" class="pixel-btn primary" onclick={Callback::from({
                    let view = view.clone();
                    move |_| view.set(View::Map)
                })}>
                    <BpmfAside text={ "回地圖".to_string() } game={game.clone()} read=true />
                </button>
            </section>
        },
    };

    html! {
        <main class="shell-pixel shell-wide">
            { body }
        </main>
    }
}
