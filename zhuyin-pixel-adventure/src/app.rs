use crate::components::{bind_walk_tick, BpmfAside, IslandMap, TouchPad};
use crate::grade1::Grade1Bank;
use crate::grade1_screens::{Grade1Hub, Grade1Unit};
use crate::input::Dir;
use crate::island_walk;
use crate::map_input::{install_continuous_map_move, slide_move, MapInputController, WALK_SPEED_PX_PER_SEC};
use crate::walk_sprite::{facing_from_velocity, WalkFacing};
use crate::map_config::{self, MapOrientation};
use crate::pixel_art_preload::preload_urls;
use crate::progress::PixelProgress;
use crate::screens::{CollectionScreen, SelectScreen};
use crate::sounds::{play_reward, portal_blip};
use crate::world::{self, Portal};
use std::cell::{Cell, RefCell};
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
    if p.character_id.is_empty() {
        let fresh = PixelProgress::load();
        if !fresh.character_id.is_empty() {
            p.character_id = fresh.character_id;
        }
    }
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
    let walk_facing = use_state(|| WalkFacing::Down as u8);
    let walk_active = use_state(|| false);
    let walk_sheet_frame = use_state(|| 0_u8);
    let walk_target = use_state(|| None::<(f32, f32)>);
    let velocity = use_state(|| (0.0_f32, 0.0_f32));
    let walk_phase = use_state(|| 0.0_f32);
    let map_input = use_state(MapInputController::new);
    let pos_live = use_memo((), |_| Rc::new(RefCell::new((0.0_f32, 0.0_f32))));
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
        let walk_facing = walk_facing.clone();
        let progress = progress.clone();
        let orient = orient.clone();
        let velocity = velocity.clone();
        let pos_live = pos_live.clone();
        Callback::from(move |(nx, ny, vx, vy): (f32, f32, f32, f32)| {
            if !island_walk::masks_ready() {
                return;
            }
            let o = *orient;
            let (nx, ny) = island_walk::clamp_to_map(nx, ny, o);
            if !island_walk::can_stand(nx, ny, o) {
                return;
            }
            let (cx, cy) = *pos_live.borrow();
            if vx.hypot(vy) > 1.0 {
                walk_facing.set(facing_from_velocity(vx, vy) as u8);
            } else if nx < cx - 0.5 {
                walk_facing.set(WalkFacing::Left as u8);
            } else if nx > cx + 0.5 {
                walk_facing.set(WalkFacing::Right as u8);
            }
            if (nx - cx).hypot(ny - cy) > 0.05 {
                frame.set(*frame + 1);
            }
            velocity.set((vx, vy));
            px.set(nx);
            py.set(ny);
            *pos_live.borrow_mut() = (nx, ny);
            let mut p = (*progress).clone();
            if p.character_id.is_empty() {
                let fresh = PixelProgress::load();
                if !fresh.character_id.is_empty() {
                    p.character_id = fresh.character_id;
                }
            }
            p.player_x = nx;
            p.player_y = ny;
            p.save();
            progress.set(p);
        })
    };

    *pos_live.borrow_mut() = (*px, *py);
    {
        let walk_active = walk_active.clone();
        let walk_sheet_frame = walk_sheet_frame.clone();
        use_effect_with(*walk_active, move |active| {
            let handle = if *active {
                let walk_sheet_frame = walk_sheet_frame.clone();
                Some(gloo::timers::callback::Interval::new(125, move || {
                    walk_sheet_frame.set(((*walk_sheet_frame + 1) % 4) as u8);
                }))
            } else {
                walk_sheet_frame.set(0);
                None
            };
            move || {
                if let Some(h) = handle {
                    drop(h);
                }
            }
        });
    }
    let map_active = matches!(&*view, View::Map);
    let map_move_gate = use_memo((), |_| Rc::new(Cell::new(false)));
    map_move_gate.set(map_active);
    if !map_active {
        (*map_input).held.borrow_mut().clear();
    }
    {
        let map_input = map_input.clone();
        let walk_target = walk_target.clone();
        let try_move = try_move.clone();
        let orient = orient.clone();
        let velocity = velocity.clone();
        let walk_phase = walk_phase.clone();
        let walk_facing = walk_facing.clone();
        let walk_active = walk_active.clone();
        let prime_audio = prime_audio.clone();
        let map_move_gate = map_move_gate.clone();
        let pos_live = pos_live.clone();
        use_effect_with((), move |_| {
            let on_clear = Callback::from({
                let walk_target = walk_target.clone();
                move |_| walk_target.set(None)
            });
            let on_frame = Callback::from({
                let try_move = try_move.clone();
                let orient = orient.clone();
                let velocity = velocity.clone();
                let walk_phase = walk_phase.clone();
                let walk_facing = walk_facing.clone();
                let walk_active = walk_active.clone();
                let map_move_gate = map_move_gate.clone();
                let pos_live = pos_live.clone();
                move |((dx, dy), (vx, vy)): ((f32, f32), (f32, f32))| {
                    if !map_move_gate.get() {
                        return;
                    }
                    let speed = vx.hypot(vy);
                    if speed < 0.5 && dx.hypot(dy) < 0.001 {
                        if velocity.0.hypot(velocity.1) > 0.5 {
                            velocity.set((0.0, 0.0));
                        }
                        walk_active.set(false);
                        return;
                    }
                    if speed > 10.0 {
                        walk_phase.set(*walk_phase + 0.016 * 2.0);
                        walk_facing.set(facing_from_velocity(vx, vy) as u8);
                        velocity.set((vx, vy));
                        walk_active.set(true);
                    } else {
                        walk_phase.set(*walk_phase + 0.016 * 0.35);
                        walk_active.set(false);
                    }
                    let o = *orient;
                    let (x, y) = *pos_live.borrow();
                    if let Some((nx, ny)) = slide_move(x, y, dx, dy, o) {
                        try_move.emit((nx, ny, vx, vy));
                    }
                }
            });
            let ctrl = (*map_input).clone();
            let teardown =
                install_continuous_map_move(ctrl, on_clear, prime_audio.clone(), on_frame);
            move || teardown()
        });
    }

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
            let o = *orient;
            if let Some((nx, ny)) = slide_move(x, y, nx - x, ny - y, o) {
                try_move.emit((nx, ny, 0.0, 0.0));
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
                try_move.emit((tx, ty, 0.0, 0.0));
                return;
            }
            let step_x = dx / dist * STEP;
            let step_y = dy / dist * STEP;
            let o = *orient;
            if let Some((nx, ny)) = slide_move(x, y, step_x, step_y, o) {
                try_move.emit((nx, ny, 0.0, 0.0));
            } else {
                walk_target.set(None);
            }
        }
    }));

    let on_map_enter = Callback::from({
        let view = view.clone();
        move |portal: Portal| {
            portal_blip();
            match portal {
                Portal::Chinese => view.set(View::ChineseHub),
                Portal::English => view.set(View::Locked { subject: "英語" }),
                Portal::Math => view.set(View::Locked { subject: "數學" }),
                Portal::Treasure => view.set(View::Collection),
            }
        }
    });

    {
        let view = view.clone();
        let px = px.clone();
        let py = py.clone();
        let orient = orient.clone();
        let on_map_enter = on_map_enter.clone();
        use_effect_with(map_active, move |active| {
            let listener = if *active {
                let win = web_sys::window().unwrap();
                let view_w = view.clone();
                let px = px.clone();
                let py = py.clone();
                let orient = orient.clone();
                let on_map_enter = on_map_enter.clone();
                Some(gloo::events::EventListener::new(&win, "keydown", move |e| {
                    let e = e.dyn_ref::<KeyboardEvent>().unwrap();
                    if !matches!(*view_w, View::Map) {
                        return;
                    }
                    let k = e.key();
                    if k != "Enter" && k != " " {
                        return;
                    }
                    let Some(portal) = world::portal_at_door(*px, *py, *orient) else {
                        return;
                    };
                    if !world::door_enterable(portal) {
                        return;
                    }
                    e.prevent_default();
                    on_map_enter.emit(portal);
                }))
            } else {
                None
            };
            move || {
                if let Some(l) = listener {
                    drop(l);
                }
            }
        });
    }

    let Some(game) = (*game).clone() else {
        return html! {
            <main class="shell-pixel shell-wide">
                <p class="loading-pixel">{"載入中…"}</p>
            </main>
        };
    };

    let portal_near = world::portal_near(*px, *py, *orient);
    let door_portal = world::portal_at_door(*px, *py, *orient);

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
                        let mut p = PixelProgress::load();
                        if p.player_x < 40.0 && p.player_y < 25.0 {
                            p.player_x = sx;
                            p.player_y = sy;
                        }
                        p.save();
                        progress.set(p.clone());
                        px.set(p.player_x);
                        py.set(p.player_y);
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
                        <BpmfAside text={sound_label} game={game.clone()} compact={true} />
                    </button>
                </div>
                if !*masks_ready {
                    <p class="loading-pixel">{"地圖載入中…"}</p>
                } else {
                    <IslandMap character_id={progress.character_id.clone()} px={*px} py={*py} frame={*frame}
                        orient={*orient} walk_facing={*walk_facing} walk_active={*walk_active}
                        walk_sheet_frame={*walk_sheet_frame}
                        portal_near={portal_near}
                        door_portal={door_portal}
                        velocity={*velocity}
                        walk_phase={*walk_phase}
                        game={game.clone()}
                        on_map_click={on_map_click.clone()}
                        on_pad_hold={Callback::from({
                            let ctrl = (*map_input).clone();
                            let clear = Callback::from({
                                let walk_target = walk_target.clone();
                                move |_| walk_target.set(None)
                            });
                            let prime = prime_audio.clone();
                            move |(dir, down): (Dir, bool)| {
                                if down {
                                    clear.emit(());
                                    prime.emit(());
                                }
                                ctrl.pad_hold(dir, down);
                            }
                        })}
                        on_enter={on_map_enter.clone()} />
                }
                if !*map_fit {
                    <TouchPad on_pad_hold={Callback::from({
                            let ctrl = (*map_input).clone();
                            let walk_target = walk_target.clone();
                            let prime = prime_audio.clone();
                            move |(dir, down): (Dir, bool)| {
                                if down {
                                    walk_target.set(None);
                                    prime.emit(());
                                }
                                ctrl.pad_hold(dir, down);
                            }
                        })} />
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
        <main class={shell_class}>
            { body }
        </main>
    }
}

use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;
