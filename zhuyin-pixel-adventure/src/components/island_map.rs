use crate::components::BpmfAside;
use crate::island_walk;
use crate::map_config::{character_by_id, full_url, landmark_url, layer, MapOrientation};
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
    enter_portal: Option<Portal>,
    can_enter: bool,
    game: Rc<GameData>,
    on_enter: Callback<Portal>,
) -> Html {
    html! {
        <div class={if fit { "action-dock action-dock-fit-below" } else { "action-dock" }}>
            if let Some(portal) = portal_near {
                <p class={if fit { "map-hint map-hint-fit" } else { "map-hint map-hint-large" }}>
                    <BpmfAside text={ world::GateLabel::name(portal).to_string() } game={game.clone()} read=true />
                    if !fit {
                        { " · " }
                        <BpmfAside text={ world::GateLabel::hint(portal).to_string() } game={game.clone()} read=true />
                    }
                </p>
            } else {
                <p class={classes!("map-hint", "muted", fit.then_some("map-hint-fit"))}>
                    <BpmfAside text={ "點地圖移動，或用方向鍵走到建築前".to_string() } game={game.clone()} read=true />
                </p>
            }
            if can_enter {
                if let Some(portal) = enter_portal {
                    <button type="button" class="enter-btn pixel-btn primary pulse" data-testid="enter-portal"
                        onclick={Callback::from({
                            let on_enter = on_enter.clone();
                            move |_| on_enter.emit(portal)
                        })}>
                        <BpmfAside text={ world::GateLabel::enter_label(portal).to_string() } game={game.clone()} read=true />
                    </button>
                }
            }
        </div>
    }
}

fn label_offset_below_portal(portal: Portal) -> (f32, f32) {
    match portal {
        Portal::Chinese => (-38.0, 52.0),
        Portal::Treasure => (0.0, 46.0),
        Portal::Math => (12.0, 50.0),
        Portal::English => (0.0, 56.0),
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
    pub on_enter: Callback<Portal>,
    pub on_map_click: Callback<(f32, f32)>,
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
    let bob = if props.frame % 2 == 0 { 0.0 } else { -4.0 };
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
            let z = foot as i32 + 1;
            let player_transform = format!("{flip} translateY({bob}px)");
            layers.push((
                foot,
                html! {
                    <img key="player" class="island-player" src={full_url(&ch)} data-testid="island-player"
                        style={format!(
                            "left:{}px;top:{}px;transform:{};z-index:{};",
                            props.px - 55.0,
                            props.py - PLAYER_H,
                            player_transform,
                            z
                        )}
                        alt="" draggable="false" />
                },
            ));
        }
    }

    layers.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let player_screen = if fit {
        if let Some(ch) = character_by_id(&props.character_id) {
            let (mut sx, mut sy) = world_to_screen(props.px, props.py, &metrics);
            let screen_h = (metrics.scale * PLAYER_H * player_boost).max(PLAYER_MIN_SCREEN_PX);
            let screen_w = screen_h * 0.92;
            let pad_top = screen_h + 6.0;
            let pad_side = screen_w * 0.55;
            sx = sx.clamp(pad_side, metrics.vw - pad_side);
            sy = sy.clamp(pad_top, metrics.vh - 8.0);
            let flip = if props.facing_left { "scaleX(-1)" } else { "none" };
            let bob_px = bob * metrics.scale.max(0.25);
            html! {
                <img class="island-player-screen" src={full_url(&ch)} data-testid="island-player"
                    style={format!(
                        "left:{sx}px;top:{sy}px;width:{screen_w}px;height:{screen_h}px;transform:translate(-50%,-100%) {flip} translateY({bob_px}px);"
                    )}
                    alt="" draggable="false" />
            }
        } else {
            html! {}
        }
    } else {
        html! {}
    };

    let label_overlay = if fit {
        html! {
            <div class="island-fit-labels" aria-hidden="false">
                { for landmark_defs.iter().map(|(key, x, y, portal)| {
                    let (dx, below) = label_offset_below_portal(*portal);
                    let (sx, sy) = world_to_screen(*x as f32 + dx, *y as f32 + below, &metrics);
                    html! {
                        <div key={world::GateLabel::name(*portal)} class="island-fit-label"
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

    let can_enter = matches!(
        props.portal_near,
        Some(Portal::Chinese | Portal::Treasure)
    );
    let enter_portal = props.portal_near;
    let dock = render_action_dock(
        fit,
        props.portal_near,
        enter_portal,
        can_enter,
        props.game.clone(),
        props.on_enter.clone(),
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
