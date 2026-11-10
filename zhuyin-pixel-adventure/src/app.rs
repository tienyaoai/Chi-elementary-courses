use crate::components::{bind_walk_tick, BpmfAside, IslandMap, TouchPad};
use crate::grade1::Grade1Bank;
use crate::grade1_screens::{Grade1Hub, Grade1Unit};
use crate::input::Dir;
use crate::island_walk;
use crate::map_config::{self, MapOrientation};
use crate::pixel_art_preload::preload_urls;
use crate::progress::PixelProgress;
use crate::screens::{CollectionScreen, SelectScreen};
use crate::sounds::{play_reward, portal_blip};
use crate::world::{self, Portal};
use std::rc::Rc;
use wasm_bindgen_futures::spawn_local;
use web_sys::KeyboardEvent;
use yew::prelude::*;

const STEP: f32 = 14.0;

/// Portrait-space progress on a landscape map (fit desktop) leaves the avatar off walk masks — remap or spawn.
fn sync_player_to_map(
    px: f32,
    py: f32,
    orient: MapOrientation,
    walk_masks: bool,
) -> (f32, f32) {
    let (mut cx, mut cy) = map_config::coerce_player_coords(px, py, orient);
    if !map_config::position_in_bounds(cx, cy, orient) {
        return map_config::spawn(orient);
    }
    if walk_masks && island_walk::masks_ready() {
        if island_walk::can_stand(cx, cy, orient) {
            return (cx, cy);
        }
        let other = map_config::opposite(orient);
        let (rx, ry) = map_config::remap_position(px, py, other, orient);
        let (rx, ry) = map_config::coerce_player_coords(rx, ry, orient);
        if map_config::position_in_bounds(rx, ry, orient) && island_walk::can_stand(rx, ry, orient) {
            return (rx, ry);
        }
        if island_walk::can_stand(cx, cy, orient) {
            return (cx, cy);
        }
        return map_config::spawn(orient);
    }
    (cx, cy)
}

fn apply_player_pos(
    px: &UseStateHandle<f32>,
    py: &UseStateHandle<f32>,
    progress: &UseStateHandle<PixelProgress>,
    nx: f32,
    ny: f32,
) {
    if (nx - **px).abs() < 0.01 && (ny - **py).abs() < 0.01 {
        return;
    }
    px.set(nx);
    py.set(ny);
    let mut p = (**progress).clone();
    p.player_x = nx;
    p.player_y = ny;
    p.save();
    progress.set(p);
}

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
    let px = use_state(|| {
        let o = world::detect_orientation();
        map_config::coerce_player_coords(progress.player_x, progress.player_y, o).0
    });
    let py = use_state(|| {
        let o = world::detect_orientation();
        map_config::coerce_player_coords(progress.player_x, progress.player_y, o).1
    });
    let frame = use_state(|| 0u8);
    let facing_left = use_state(|| false);
    let walk_target = use_state(|| None::<(f32, f32)>);
    let orient = use_state(world::detect_orientation);
    let map_fit = use_state(world::is_map_fit);
    let masks_ready = use_state(|| false);

    {
        let game = game.clone();
        let masks_ready = masks_ready.clone();
        let orient = orient.clone();
        let map_fit = map_fit.clone();
        let px = px.clone();
        let py = py.clone();
        let progress = progress.clone();
        use_effect_with((), move |_| {
            let game = game.clone();
            let masks_ready = masks_ready.clone();
            spawn_local(async move {
                if let Ok(data) = zhuyin_island_wasm::data::load_game_data().await {
                    game.set(Some(data));
                }
                preload_urls(map_config::preload_urls());
                crate::pixel_art_preload::preload_manifest_urls();
                island_walk::init_masks().await;
                masks_ready.set(true);
            });
            let on_resize = {
                let orient = orient.clone();
                let map_fit = map_fit.clone();
                let px = px.clone();
                let py = py.clone();
                let progress = progress.clone();
                Closure::wrap(Box::new(move || {
                    if let Some((w, h)) = world::window_size() {
                        map_fit.set(world::is_map_fit());
                        let new_o = world::map_orient(w, h);
                        let old_o = *orient;
                        if old_o != new_o {
                            let walk_ok = island_walk::masks_ready();
                            let (mut nx, mut ny) =
                                map_config::remap_position(*px, *py, old_o, new_o);
                            (nx, ny) = sync_player_to_map(nx, ny, new_o, walk_ok);
                            apply_player_pos(&px, &py, &progress, nx, ny);
                        }
                        orient.set(new_o);
                    }
                }) as Box<dyn FnMut()>)
            };
            if let Some(w) = web_sys::window() {
                let _ = w.add_event_listener_with_callback("resize", on_resize.as_ref().unchecked_ref());
            }
            on_resize.forget();
            || ()
        });
    }

    {
        let px = px.clone();
        let py = py.clone();
        let progress = progress.clone();
        let orient = orient.clone();
        let masks_ready = masks_ready.clone();
        let map_fit = map_fit.clone();
        use_effect_with((*orient, *masks_ready, *map_fit), move |_| {
            let walk_ok = *masks_ready && island_walk::masks_ready();
            let (nx, ny) = sync_player_to_map(*px, *py, *orient, walk_ok);
            apply_player_pos(&px, &py, &progress, nx, ny);
        });
    }

    let prime_audio = Callback::from(|_| {
        crate::sounds::prime_audio();
    });

    let try_move = {
        let px = px.clone();
        let py = py.clone();
        let frame = frame.clone();
        let facing_left = facing_left.clone();
        let progress = progress.clone();
        let orient = orient.clone();
        Callback::from(move |(nx, ny): (f32, f32)| {
            if !island_walk::masks_ready() {
                return;
            }
            let o = *orient;
            let (nx, ny) = island_walk::clamp_to_map(nx, ny, o);
            if !island_walk::can_stand(nx, ny, o) {
                return;
            }
            if nx < *px {
                facing_left.set(true);
            } else if nx > *px {
                facing_left.set(false);
            }
            px.set(nx);
            py.set(ny);
            frame.set(*frame + 1);
            let mut p = (*progress).clone();
            p.player_x = nx;
            p.player_y = ny;
            p.save();
            progress.set(p);
        })
    };

    let move_dir = {
        let px = px.clone();
        let py = py.clone();
        let walk_target = walk_target.clone();
        let try_move = try_move.clone();
        Callback::from(move |dir: Dir| {
            walk_target.set(None);
            let (mut x, mut y) = (*px, *py);
            match dir {
                Dir::Up => y -= STEP,
                Dir::Down => y += STEP,
                Dir::Left => x -= STEP,
                Dir::Right => x += STEP,
                Dir::None => return,
            }
            try_move.emit((x, y));
        })
    };

    let on_keydown = {
        let move_dir = move_dir.clone();
        let prime = prime_audio.clone();
        let view = view.clone();
        Callback::from(move |e: KeyboardEvent| {
            if !matches!(*view, View::Map) {
                return;
            }
            let dir = match e.key().as_str() {
                "ArrowUp" | "w" | "W" => Dir::Up,
                "ArrowDown" | "s" | "S" => Dir::Down,
                "ArrowLeft" | "a" | "A" => Dir::Left,
                "ArrowRight" | "d" | "D" => Dir::Right,
                _ => match e.code().as_str() {
                    "ArrowUp" | "KeyW" => Dir::Up,
                    "ArrowDown" | "KeyS" => Dir::Down,
                    "ArrowLeft" | "KeyA" => Dir::Left,
                    "ArrowRight" | "KeyD" => Dir::Right,
                    _ => Dir::None,
                },
            };
            if dir != Dir::None {
                e.prevent_default();
                prime.emit(());
                move_dir.emit(dir);
            }
        })
    };

    let on_map_click = {
        let walk_target = walk_target.clone();
        let try_move = try_move.clone();
        let px = px.clone();
        let py = py.clone();
        let orient = orient.clone();
        Callback::from(move |pt: (f32, f32)| {
            walk_target.set(Some(pt));
            let (x, y) = (*px, *py);
            let (tx, ty) = pt;
            let dx = tx - x;
            let dy = ty - y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist < 0.5 {
                return;
            }
            let nx = if dist <= STEP {
                tx
            } else {
                x + dx / dist * STEP
            };
            let ny = if dist <= STEP {
                ty
            } else {
                y + dy / dist * STEP
            };
            if island_walk::can_stand(nx, ny, *orient) {
                try_move.emit((nx, ny));
            } else {
                walk_target.set(None);
            }
        })
    };

    bind_walk_tick(Callback::from({
        let px = px.clone();
        let py = py.clone();
        let walk_target = walk_target.clone();
        let try_move = try_move.clone();
        let orient = orient.clone();
        move |_| {
            let Some((tx, ty)) = *walk_target else {
                return;
            };
            let (x, y) = (*px, *py);
            let dx = tx - x;
            let dy = ty - y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist < STEP {
                walk_target.set(None);
                try_move.emit((tx, ty));
                return;
            }
            let nx = x + dx / dist * STEP;
            let ny = y + dy / dist * STEP;
            if !island_walk::can_stand(nx, ny, *orient) {
                walk_target.set(None);
                return;
            }
            try_move.emit((nx, ny));
        }
    }));

    let Some(game) = (*game).clone() else {
        return html! {
            <main class="shell-pixel shell-wide">
                <p class="loading-pixel">{"載入中…"}</p>
            </main>
        };
    };

    let portal_near = world::portal_near(*px, *py, *orient);

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
                    let orient = *orient;
                    let px = px.clone();
                    let py = py.clone();
                    let progress = progress.clone();
                    move |_| {
                        let (sx, sy) = map_config::spawn(orient);
                        let mut p = (*progress).clone();
                        if p.player_x < 40.0 && p.player_y < 25.0 {
                            p.player_x = sx;
                            p.player_y = sy;
                            p.save();
                            progress.set(p.clone());
                            px.set(sx);
                            py.set(sy);
                        }
                        view.set(View::Map);
                    }
                })}
                on_collection={Callback::from({
                    let view = view.clone();
                    move |_| view.set(View::Collection)
                })} />
        },
        View::Map => {
            let sound_label = if progress.sound {
                "關閉音效".to_string()
            } else {
                "開啟音效".to_string()
            };
            html! {
            <div class={classes!("map-screen", (*map_fit).then_some("map-screen-fit"))}>
                <div class={classes!("hud", (*map_fit).then_some("hud-fit"))}>
                    <span class="hud-title"><BpmfAside text={ "學習冒險島".to_string() } game={game.clone()} read=true /></span>
                    if *map_fit {
                        <button type="button" class="hud-btn hud-ghost" onclick={Callback::from({
                            let view = view.clone();
                            move |_| view.set(View::Select)
                        })}>
                            <BpmfAside text={ "換角色".to_string() } game={game.clone()} compact=true />
                        </button>
                    }
                    <button type="button" class="hud-btn hud-sound-btn" onclick={toggle_sound.clone()}>
                        <BpmfAside text={sound_label} game={game.clone()} compact={*map_fit} read={!*map_fit} />
                    </button>
                </div>
                if !*masks_ready {
                    <p class="loading-pixel">{"地圖載入中…"}</p>
                } else {
                    <IslandMap character_id={progress.character_id.clone()} px={*px} py={*py} frame={*frame}
                        orient={*orient} facing_left={*facing_left}
                        portal_near={portal_near}
                        game={game.clone()}
                        on_map_click={on_map_click.clone()}
                        on_dir={move_dir.clone()}
                        on_interact={prime_audio.clone()}
                        on_enter={Callback::from({
                            let view = view.clone();
                            move |portal| {
                                portal_blip();
                                match portal {
                                    Portal::Chinese => view.set(View::ChineseHub),
                                    Portal::English => view.set(View::Locked { subject: "英語" }),
                                    Portal::Math => view.set(View::Locked { subject: "數學" }),
                                    Portal::Treasure => view.set(View::Collection),
                                }
                            }
                        })} />
                }
                if !*map_fit {
                    <TouchPad on_dir={move_dir.clone()} on_interact={prime_audio.clone()} />
                    <div class="map-actions">
                        <button type="button" class="pixel-btn ghost" onclick={Callback::from({
                            let view = view.clone();
                            move |_| view.set(View::Select)
                        })}>
                            <BpmfAside text={ "換角色".to_string() } game={game.clone()} read=true />
                        </button>
                    </div>
                }
                if !*map_fit && matches!(portal_near, Some(Portal::English | Portal::Math)) {
                    <p class="locked-hint"><BpmfAside text={ "這個科目即將開放".to_string() } game={game.clone()} read=true /></p>
                }
            </div>
            }
        }
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
                    <Grade1Unit game={game.clone()} bank={(*bank).clone()} unit={unit.clone()} progress={(*progress).clone()}
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

    let fit_shell = *map_fit;
    let shell_class = if fit_shell && matches!(&*view, View::Map) {
        classes!("shell-pixel", "shell-map-fit")
    } else {
        classes!("shell-pixel", "shell-wide")
    };

    html! {
        <main class={shell_class} tabindex="0" onkeydown={on_keydown}>
            { body }
        </main>
    }
}

use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;
