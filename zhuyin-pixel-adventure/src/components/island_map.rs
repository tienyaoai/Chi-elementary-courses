use crate::components::{BpmfAside, FitDirPad};
use crate::island_walk;
use crate::map_config::{character_by_id, door_point, full_url, landmark_url, layer, MapOrientation};
use crate::map_display::{
    fit_metrics, orient_for_viewport, player_screen_boost, screen_to_world, view_mode,
    world_to_screen, FitMetrics, MapViewMode, LETTERBOX_SEA,
};
use crate::world::{self, Portal};
use gloo::timers::callback::Timeout;
use std::rc::Rc;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;
use web_sys::MouseEvent;
use yew::prelude::*;
use zhuyin_island_wasm::data::GameData;

const PLAYER_H: f32 = 110.0;
const PLAYER_MIN_SCREEN_PX: f32 = 64.0;
/// Compact door bubble size for placement / clamp (px in viewport).
const DOOR_BUBBLE_W: f32 = 196.0;
const DOOR_BUBBLE_H: f32 = 68.0;
const VIEWPORT_PAD: f32 = 6.0;

fn door_bubble_slot_fit(
    sx: f32,
    sy: f32,
    vw: f32,
    vh: f32,
    screen_w: f32,
    screen_h: f32,
    px: f32,
    py: f32,
    orient: MapOrientation,
    portal: Portal,
) -> &'static str {
    let lm = crate::map_config::landmarks(orient);
    let landmark_y = match portal {
        Portal::Chinese => lm.chinese.y,
        Portal::English => lm.english.y,
        Portal::Math => lm.math.y,
        Portal::Treasure => lm.treasure.y,
    } as f32;
    if landmark_y < py - 48.0 && sy + DOOR_BUBBLE_H + 14.0 <= vh - VIEWPORT_PAD {
        return "door-bubble-slot-below";
    }
    let above_top = sy - screen_h - DOOR_BUBBLE_H - 8.0;
    let below_bottom = sy + DOOR_BUBBLE_H + 10.0;
    if above_top >= VIEWPORT_PAD {
        if sx > vw * 0.54 {
            return "door-bubble-slot-left";
        }
        return "door-bubble-slot-right";
    }
    if below_bottom <= vh - VIEWPORT_PAD {
        return "door-bubble-slot-below";
    }
    "door-bubble-slot-below"
}

fn render_door_bubble_compact(
    portal: Portal,
    game: Rc<GameData>,
    on_enter: Callback<Portal>,
    slot_class: &'static str,
) -> Html {
    let enterable = world::door_enterable(portal);
    let prompt = world::door_prompt_text(portal);
    html! {
        <div class={classes!("door-bubble", "door-bubble-compact", slot_class)}
            data-testid="door-bubble" data-portal={portal_landmark_key(portal)}>
            <div class="door-bubble-inner">
                <span class="door-bubble-text">
                    <BpmfAside text={prompt} game={game.clone()} read=true compact=true />
                </span>
                if enterable {
                    <button type="button" class="door-bubble-enter pixel-btn primary" data-testid="door-enter-btn"
                        onclick={Callback::from(move |_| on_enter.emit(portal))}>
                        <BpmfAside text={ "進入".to_string() } game={game} read=true compact=true />
                    </button>
                }
            </div>
        </div>
    }
}

fn portal_landmark_key(p: Portal) -> &'static str {
    match p {
        Portal::Chinese => "chinese",
        Portal::English => "english",
        Portal::Math => "math",
        Portal::Treasure => "treasure",
    }
}

fn door_bubble_slot_follow(
    px: f32,
    py: f32,
    orient: MapOrientation,
    portal: Portal,
    vw: f32,
) -> &'static str {
    let lm = crate::map_config::landmarks(orient);
    let landmark_y = match portal {
        Portal::Chinese => lm.chinese.y,
        Portal::English => lm.english.y,
        Portal::Math => lm.math.y,
        Portal::Treasure => lm.treasure.y,
    } as f32;
    let landmark_x = match portal {
        Portal::Chinese => lm.chinese.x,
        Portal::English => lm.english.x,
        Portal::Math => lm.math.x,
        Portal::Treasure => lm.treasure.x,
    } as f32;
    if landmark_y < py - 40.0 {
        if vw < 420.0 {
            return "door-bubble-slot-below";
        }
        if landmark_x <= px + 12.0 {
            return "door-bubble-slot-right";
        }
        return "door-bubble-slot-left";
    }
    let key = portal_landmark_key(portal);
    let (dx, _) = door_point(key, orient);
    if dx < px - 16.0 {
        return "door-bubble-slot-right";
    }
    if dx > px + 16.0 {
        return "door-bubble-slot-left";
    }
    "door-bubble-slot-below"
}

fn display_orient(props_orient: MapOrientation) -> MapOrientation {
    world::window_size()
        .map(|(w, h)| {
            let mode = view_mode(w, h);
            if mode == MapViewMode::FitWholeIsland {
                orient_for_viewport(w, h, mode)
            } else {
                props_orient
            }
        })
        .unwrap_or(props_orient)
}

fn measure_viewport(vp: &NodeRef, props_orient: MapOrientation) -> FitMetrics {
    let orient = display_orient(props_orient);
    let Some(el) = vp.cast::<web_sys::HtmlElement>() else {
        return fit_metrics(390.0, 520.0, orient);
    };
    let rect = el.get_bounding_client_rect();
    let vw = rect.width() as f32;
    let vh = rect.height() as f32;
    let mut m = fit_metrics(vw, vh, orient);
    if let Some((ww, wh)) = world::window_size() {
        m.mode = view_mode(ww, wh);
        if m.mode == MapViewMode::FitWholeIsland {
            m.orient = orient_for_viewport(ww, wh, m.mode);
            m.map_w = layer(m.orient).width as f32;
            m.map_h = layer(m.orient).height as f32;
        }
        m.scale = if m.mode == MapViewMode::FitWholeIsland {
            (m.vw / m.map_w).min(m.vh / m.map_h).max(0.01)
        } else {
            1.0
        };
    }
    m
}

fn render_action_dock(
    fit: bool,
    portal_near: Option<Portal>,
    door_portal: Option<Portal>,
    game: Rc<GameData>,
    on_pad_hold: Callback<(crate::input::Dir, bool)>,
) -> Html {
  if fit {
    return html! {
        <div class="action-dock action-dock-fit-below" data-testid="fit-hint-strip">
            <div class="fit-dock-row">
                if let Some(portal) = portal_near {
                    <p class="map-hint map-hint-fit fit-dock-name">
                        <BpmfAside text={ world::GateLabel::hint(portal).to_string() } game={game.clone()} read=true />
                    </p>
                } else {
                    <p class={classes!("map-hint", "muted", "map-hint-fit", "fit-dock-name")}>
                        <BpmfAside text={ "按住方向鍵或螢幕鍵盤走路".to_string() } game={game.clone()} read=true />
                    </p>
                }
                <FitDirPad on_pad_hold={on_pad_hold} />
            </div>
        </div>
    };
  }
  html! {
      <div class="action-dock">
          if let Some(portal) = door_portal.filter(|p| world::door_enterable(*p)) {
              <p class="map-hint map-hint-door" data-testid="map-hint-door">
                  <BpmfAside text={ "按「進入」開始答題".to_string() } game={game.clone()} read=true compact=true />
              </p>
          } else if let Some(portal) = portal_near {
              <p class="map-hint map-hint-large">
                  <BpmfAside text={ world::GateLabel::name(portal).to_string() } game={game.clone()} read=true compact=true />
                  { " · " }
                  <BpmfAside text={ world::GateLabel::hint(portal).to_string() } game={game.clone()} read=true compact=true />
              </p>
          } else {
              <p class="map-hint muted">
                  <BpmfAside text={ "按住方向鍵走到建築門口".to_string() } game={game.clone()} read=true />
              </p>
          }
      </div>
  }
}

fn walk_fx(phase: f32, vel: (f32, f32)) -> (f32, f32) {
    use std::f32::consts::TAU;
    let speed = vel.0.hypot(vel.1);
    let moving = speed > 10.0;
    let bob = if moving {
        (phase * TAU * 4.0).sin() * 3.6
    } else {
        (phase * 0.45).sin() * 1.1
    };
    let squash = if moving {
        1.0 - 0.034 * (phase * TAU * 4.0).sin().abs()
    } else {
        1.0 - 0.012 * (phase * 0.45).sin().abs()
    };
    (bob, squash)
}

fn label_offset_below_portal(portal: Portal) -> (f32, f32) {
    match portal {
        Portal::Chinese => (-58.0, 36.0),
        Portal::Treasure => (108.0, 28.0),
        Portal::Math => (-108.0, 72.0),
        Portal::English => (12.0, 52.0),
    }
}

fn fit_label_size(portal: Portal) -> (f32, f32) {
    match portal {
        Portal::Chinese => (170.0, 40.0),
        Portal::English => (170.0, 40.0),
        Portal::Math => (172.0, 40.0),
        Portal::Treasure => (172.0, 40.0),
    }
}

fn resolve_fit_label_overlaps(positions: &mut [(Portal, f32, f32)]) {
    const PAD: f32 = 10.0;
    for _ in 0..10 {
        for i in 0..positions.len() {
            for j in (i + 1)..positions.len() {
                let (pa, ax, ay) = positions[i];
                let (pb, bx, by) = positions[j];
                let (wa, ha) = fit_label_size(pa);
                let (wb, hb) = fit_label_size(pb);
                let overlap_x = (wa + wb) * 0.5 - (bx - ax).abs();
                let overlap_y = (ha + hb) - (by.max(ay) - ay.min(by + hb));
                if overlap_x > PAD && overlap_y > PAD {
                    if overlap_x <= overlap_y {
                        let shift = overlap_x * 0.5 + PAD;
                        if bx >= ax {
                            positions[j].1 += shift;
                        } else {
                            positions[j].1 -= shift;
                        }
                    } else {
                        let shift = overlap_y * 0.5 + PAD;
                        if by >= ay {
                            positions[j].2 += shift;
                        } else {
                            positions[j].2 -= shift;
                        }
                    }
                }
            }
        }
    }
}

#[derive(Properties, PartialEq)]
pub struct IslandMapProps {
    pub character_id: String,
    pub px: f32,
    pub py: f32,
    pub frame: u8,
    pub orient: MapOrientation,
    pub facing_left: bool,
    pub portal_near: Option<Portal>,
    pub door_portal: Option<Portal>,
  #[prop_or_default]
    pub velocity: (f32, f32),
    #[prop_or_default]
    pub walk_phase: f32,
    pub on_enter: Callback<Portal>,
    pub on_map_click: Callback<(f32, f32)>,
    pub on_pad_hold: Callback<(crate::input::Dir, bool)>,
    pub game: Rc<GameData>,
}

#[function_component(IslandMap)]
pub fn island_map(props: &IslandMapProps) -> Html {
    let viewport_ref = use_node_ref();
    let orient = display_orient(props.orient);
    let metrics = use_state(|| fit_metrics(390.0, 520.0, orient));
    let lay = layer(orient);
    let map_w = lay.width;
    let map_h = lay.height;
    let (walk_bob, walk_squash) = walk_fx(props.walk_phase, props.velocity);
    let moving = props.velocity.0.hypot(props.velocity.1) > 10.0;
    let fit = metrics.mode == MapViewMode::FitWholeIsland;

    {
        let viewport_ref = viewport_ref.clone();
        let metrics = metrics.clone();
        let props_orient = props.orient;
        use_effect_with((props_orient, props.frame), move |_| {
            let tick = {
                let viewport_ref = viewport_ref.clone();
                let metrics = metrics.clone();
                let props_orient = props_orient;
                move || {
                    metrics.set(measure_viewport(&viewport_ref, props_orient));
                }
            };
            tick();
            let win = web_sys::window();
            let closure = Closure::wrap(Box::new({
                let tick = tick.clone();
                move || tick()
            }) as Box<dyn FnMut()>);
            if let Some(w) = &win {
                let _ = w.add_event_listener_with_callback("resize", closure.as_ref().unchecked_ref());
            }
            let handle = Timeout::new(120, tick);
            move || {
                drop(handle);
                if let Some(w) = &win {
                    let _ = w.remove_event_listener_with_callback("resize", closure.as_ref().unchecked_ref());
                }
                closure.forget();
            }
        });
    }

    let map_orient = props.orient;
    let on_click = {
        let viewport_ref = viewport_ref.clone();
        let px = props.px;
        let py = props.py;
        let on_map_click = props.on_map_click.clone();
        Callback::from(move |e: MouseEvent| {
            let Some(vp) = viewport_ref.cast::<web_sys::HtmlElement>() else {
                return;
            };
            let rect = vp.get_bounding_client_rect();
            let vw = rect.width() as f32;
            let vh = rect.height() as f32;
            let local_x = (e.client_x() as f32) - rect.left() as f32;
            let local_y = (e.client_y() as f32) - rect.top() as f32;
            let m = measure_viewport(&viewport_ref, map_orient);
            let (wx, wy) = if m.mode == MapViewMode::FitWholeIsland {
                screen_to_world(local_x, local_y, &m)
            } else {
                let world_x = px + local_x - vw / 2.0;
                let world_y = py + local_y - vh / 2.0;
                (world_x, world_y)
            };
            let click_orient = if m.mode == MapViewMode::FitWholeIsland {
                m.orient
            } else {
                map_orient
            };
            let (wx, wy) = island_walk::clamp_to_map(wx, wy, click_orient);
            on_map_click.emit((wx, wy));
        })
    };

    let cam_x = props.px;
    let cam_y = props.py;
    let scale = metrics.scale;
    let player_boost = player_screen_boost(&metrics, PLAYER_H, PLAYER_MIN_SCREEN_PX);
    let player_screen_h = if fit {
        (metrics.scale * PLAYER_H * player_boost).max(PLAYER_MIN_SCREEN_PX)
    } else {
        PLAYER_H
    };
    let player_screen_w = player_screen_h * 0.92;

    let world_style = if fit {
        format!(
            "width:{map_w}px;height:{map_h}px;left:50%;top:50%;transform:translate(-50%,-50%) scale({scale});"
        )
    } else {
        format!(
            "width:{map_w}px;height:{map_h}px;left:calc(50% - {cam_x}px);top:calc(50% - {cam_y}px);"
        )
    };

    let mut layers: Vec<(f32, Html)> = Vec::new();
    let lm = crate::map_config::landmarks(orient);
    let landmark_defs: [(&str, i32, i32, Portal); 4] = [
        ("chinese", lm.chinese.x, lm.chinese.y, Portal::Chinese),
        ("english", lm.english.x, lm.english.y, Portal::English),
        ("math", lm.math.x, lm.math.y, Portal::Math),
        ("treasure", lm.treasure.x, lm.treasure.y, Portal::Treasure),
    ];
    for (key, x, y, _) in landmark_defs {
        let url = landmark_url(key);
        let foot_y = y as f32;
        let z = if key == "treasure" {
            foot_y as i32 + 500
        } else {
            foot_y as i32
        };
        layers.push((
            foot_y,
            html! {
                <img key={format!("lm-{key}")} class={format!("island-landmark lm-{key}")} src={url}
                    data-testid={format!("landmark-{key}")}
                    style={format!("left:{}px;top:{}px;z-index:{};", x, y - 20, z)}
                    alt="" draggable="false" />
            },
        ));
    }

    if !fit {
        if let Some(ch) = character_by_id(&props.character_id) {
            let foot = props.py;
            let flip = if props.facing_left { "scaleX(-1)" } else { "none" };
            let z = foot as i32 + 12000;
            let player_transform = format!(
                "{flip} translateY({walk_bob}px) scaleY({walk_squash})"
            );
            let dust = moving.then(|| html! {
                <span class="dust-puff" style={format!("left:{}px;top:{}px;", props.px - 8.0, props.py - 6.0)}></span>
            });
            let follow_bubble = props.door_portal.map(|portal| {
                let slot = door_bubble_slot_follow(props.px, props.py, orient, portal, metrics.vw);
                render_door_bubble_compact(
                    portal,
                    props.game.clone(),
                    props.on_enter.clone(),
                    slot,
                )
            });
            layers.push((
                foot,
                html! {
                    <div key="player-wrap" class="island-player-wrap island-player-anchor"
                        style={format!(
                            "left:{}px;top:{}px;z-index:{};--player-w:110px;--player-h:{PLAYER_H}px;",
                            props.px - 55.0, props.py - PLAYER_H, z
                        )}>
                        { follow_bubble }
                        { dust }
                        <img class="island-player" src={full_url(&ch)} data-testid="island-player"
                            style={format!("transform:{};", player_transform)}
                            alt="" draggable="false" />
                    </div>
                },
            ));
        }
    }

    layers.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let player_screen = if fit {
        if let Some(ch) = character_by_id(&props.character_id) {
            let (mut sx, mut sy) = world_to_screen(props.px, props.py, &metrics);
            let screen_h = player_screen_h;
            let screen_w = player_screen_w;
            let pad_top = screen_h + 6.0;
            let pad_side = screen_w * 0.55;
            sx = sx.clamp(pad_side, metrics.vw - pad_side);
            sy = sy.clamp(pad_top, metrics.vh - 8.0);
            let flip = if props.facing_left { "scaleX(-1)" } else { "none" };
            let bob_px = walk_bob * metrics.scale.max(0.25);
            let fit_bubble = props.door_portal.map(|portal| {
                let slot = door_bubble_slot_fit(
                    sx,
                    sy,
                    metrics.vw,
                    metrics.vh,
                    screen_w,
                    screen_h,
                    props.px,
                    props.py,
                    orient,
                    portal,
                );
                render_door_bubble_compact(
                    portal,
                    props.game.clone(),
                    props.on_enter.clone(),
                    slot,
                )
            });
            html! {
                <div class="island-player-anchor"
                    style={format!(
                        "left:{sx}px;top:{sy}px;--player-w:{screen_w}px;--player-h:{screen_h}px;"
                    )}>
                    if moving && props.frame % 4 == 0 {
                        <span class="dust-puff dust-puff-fit"
                            style={format!("left:0;bottom:100%;margin-bottom:4px;")}></span>
                    }
                    <img class="island-player-screen" src={full_url(&ch)} data-testid="island-player"
                        style={format!(
                            "width:{screen_w}px;height:{screen_h}px;transform:translate(-50%,-100%) {flip} translateY({bob_px}px) scaleY({walk_squash});"
                        )}
                        alt="" draggable="false" />
                    { fit_bubble }
                </div>
            }
        } else {
            html! {}
        }
    } else {
        html! {}
    };

    let label_overlay = if fit {
        let mut label_pos: Vec<(Portal, f32, f32)> = landmark_defs
            .iter()
            .map(|(_, x, y, portal)| {
                let (dx, below) = label_offset_below_portal(*portal);
                let (sx, sy) = world_to_screen(*x as f32 + dx, *y as f32 + below, &metrics);
                (*portal, sx, sy)
            })
            .collect();
        resolve_fit_label_overlaps(&mut label_pos);
        let (psx, psy) = world_to_screen(props.px, props.py - 48.0, &metrics);
        for (_, sx, sy) in label_pos.iter_mut() {
            let dx = *sx - psx;
            let dy = *sy - psy;
            let d = dx.hypot(dy);
            if d < 92.0 && d > 0.1 {
                let push = (92.0 - d) * 0.85;
                *sx += dx / d * push;
                *sy += dy / d * push * 0.35;
            }
        }
        let pos_by: std::collections::HashMap<Portal, (f32, f32)> = label_pos
            .into_iter()
            .map(|(p, sx, sy)| (p, (sx, sy)))
            .collect();
        html! {
            <div class="island-fit-labels" aria-hidden="false">
                { for landmark_defs.iter().map(|(key, _x, _y, portal)| {
                    let (sx, sy) = pos_by.get(portal).copied().unwrap_or((0.0, 0.0));
                    let dx = sx - psx;
                    let dy = sy - psy;
                    let fade = if dx.hypot(dy) < 78.0 { " island-fit-label-faded" } else { "" };
                    html! {
                        <div key={world::GateLabel::name(*portal)} class={classes!("island-fit-label", fade)}
                            data-testid={format!("fit-label-{key}")}
                            style={format!("left:{}px;top:{}px;", sx, sy)}>
                            <BpmfAside text={ world::GateLabel::name(*portal).to_string() } game={props.game.clone()} compact=true />
                        </div>
                    }
                })}
            </div>
        }
    } else {
        html! {}
    };

    let viewport_class = if fit {
        "island-viewport island-viewport-fit"
    } else {
        "island-viewport island-viewport-follow"
    };

    let dock = render_action_dock(
        fit,
        props.portal_near,
        props.door_portal,
        props.game.clone(),
        props.on_pad_hold.clone(),
    );

    html! {
        <div class={classes!("island-map-shell", fit.then_some("island-map-shell-fit"))}>
            <div ref={viewport_ref} class={viewport_class} onclick={on_click}
                style={if fit { format!("background:{LETTERBOX_SEA};") } else { String::new() }}>
                <div class="island-world island-world-layer" style={world_style}>
                    <img class="island-bg" src={lay.src.clone()} width={map_w.to_string()} height={map_h.to_string()}
                        alt="" draggable="false" />
                    { for layers.into_iter().map(|(_, n)| n) }
                </div>
                { label_overlay }
                { player_screen }
            </div>
            { dock }
        </div>
    }
}
