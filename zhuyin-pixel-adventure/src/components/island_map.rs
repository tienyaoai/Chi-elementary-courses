use crate::components::{BpmfAside, FitDirPad, TouchPad};
use crate::island_walk;
use crate::map_config::{character_by_id, door_point, landmark_url, layer, walk_url, MapOrientation};
use crate::walk_sprite::{sprite_sheet_style, WalkFacing, FRAME_H, FRAME_W};
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
const DOOR_BUBBLE_W: f32 = 280.0;
const DOOR_BUBBLE_H: f32 = 88.0;
const VIEWPORT_PAD: f32 = 8.0;
const FOLLOW_CAM_LIFT: f32 = 58.0;
const FOLLOW_VIEW_MARGIN: f32 = 24.0;

fn follow_camera_y(py: f32, vh: f32, player_h: f32) -> f32 {
    let half = vh * 0.5;
    let mut cam = py - FOLLOW_CAM_LIFT;
    let foot_off = py - cam;
    let top_screen = half + foot_off - player_h;
    if top_screen < FOLLOW_VIEW_MARGIN {
        cam = py - (half - FOLLOW_VIEW_MARGIN - player_h);
    }
    let foot_screen = half + (py - cam);
    if foot_screen > vh - FOLLOW_VIEW_MARGIN {
        cam = py - (half - vh + FOLLOW_VIEW_MARGIN);
    }
    cam.max(PLAYER_H)
}

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

#[derive(Clone, Copy)]
struct ScreenRect {
    l: f32,
    t: f32,
    r: f32,
    b: f32,
}

fn rects_overlap(a: ScreenRect, b: ScreenRect, pad: f32) -> bool {
    !(a.r + pad <= b.l || a.l >= b.r + pad || a.b + pad <= b.t || a.t >= b.b + pad)
}

fn label_rect(sx: f32, sy: f32, portal: Portal) -> ScreenRect {
    let (w, h) = fit_label_size(portal);
    const PAD: f32 = 6.0;
    ScreenRect {
        l: sx - w * 0.5 - PAD,
        t: sy - h * 0.5 - PAD,
        r: sx + w * 0.5 + PAD,
        b: sy + h * 0.5 + PAD,
    }
}

fn landmark_fit_rect(key: &str, wx: f32, wy: f32, scale: f32, metrics: &FitMetrics) -> ScreenRect {
    let (sx, sy) = world_to_screen(wx, wy, metrics);
    let (lw, lh) = match key {
        "chinese" => (280.0_f32, 300.0_f32),
        "english" => (225.0, 248.0),
        "math" => (205.0, 228.0),
        "treasure" => (100.0, 104.0),
        _ => (160.0, 160.0),
    };
    let w = lw * scale;
    let h = lh * scale;
    ScreenRect {
        l: sx - w * 0.52,
        t: sy - h * 0.92,
        r: sx + w * 0.48,
        b: sy + h * 0.08,
    }
}

fn fit_door_obstacles(
    metrics: &FitMetrics,
    landmark_defs: &[(&str, i32, i32, Portal)],
    label_pos: &[(Portal, f32, f32)],
    door_portal: Option<Portal>,
    anchor_x: f32,
    anchor_y: f32,
    player_w: f32,
    player_h: f32,
) -> (Vec<ScreenRect>, Vec<ScreenRect>) {
    let mut blocks = Vec::new();
    let mut labels = Vec::new();
    let scale = metrics.scale;
    let lay = layer(metrics.orient);
    let dock_wx = lay.width as f32 * 0.5;
    let dock_wy = lay.height as f32 * 0.94;
    let (dsx, dsy) = world_to_screen(dock_wx, dock_wy, metrics);
    blocks.push(ScreenRect {
        l: dsx - 120.0 * scale,
        t: dsy - 32.0 * scale,
        r: dsx + 120.0 * scale,
        b: dsy + 72.0 * scale,
    });
    for (key, x, y, portal) in landmark_defs {
        if door_portal == Some(*portal) {
            continue;
        }
        blocks.push(landmark_fit_rect(key, *x as f32, *y as f32, scale, metrics));
    }
    for (portal, sx, sy) in label_pos {
        if door_portal == Some(*portal) {
            continue;
        }
        labels.push(label_rect(*sx, *sy, *portal));
    }
    blocks.push(ScreenRect {
        l: anchor_x - player_w * 0.55,
        t: anchor_y - player_h * 1.02,
        r: anchor_x + player_w * 0.55,
        b: anchor_y + 6.0,
    });
    (blocks, labels)
}

fn rects_intersect(a: ScreenRect, b: ScreenRect, pad: f32) -> bool {
    a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad
}

fn overlap_px(a: ScreenRect, b: ScreenRect) -> f32 {
    let l = a.l.max(b.l);
    let t = a.t.max(b.t);
    let r = a.r.min(b.r);
    let b = a.b.min(b.b);
    if r > l && b > t {
        (r - l) * (b - t)
    } else {
        0.0
    }
}

fn clamp_door_bubble_fit(
    anchor_x: f32,
    anchor_y: f32,
    player_w: f32,
    player_h: f32,
    vw: f32,
    vh: f32,
    blocks: &[ScreenRect],
    label_blocks: &[ScreenRect],
) -> String {
    let est_w = DOOR_BUBBLE_W.min(vw - VIEWPORT_PAD * 2.0);
    let est_h = DOOR_BUBBLE_H + 28.0;
    let gap = 14.0;
    let candidates: [(f32, f32); 5] = [
        (
            anchor_x - player_w * 0.5 - gap - est_w,
            anchor_y - player_h * 0.88,
        ),
        (
            anchor_x - est_w * 0.5,
            anchor_y - player_h - gap - est_h,
        ),
        (
            anchor_x - player_w * 0.5 - gap - est_w,
            anchor_y - player_h - gap - est_h,
        ),
        (
            anchor_x + player_w * 0.5 + gap,
            anchor_y - player_h * 0.88,
        ),
        (
            anchor_x - est_w * 0.5,
            anchor_y + gap * 0.5,
        ),
    ];
    let bubble_at = |bx: f32, by: f32| ScreenRect {
        l: bx,
        t: by,
        r: bx + est_w,
        b: by + est_h,
    };
    let all_obstacles: Vec<ScreenRect> = blocks
        .iter()
        .chain(label_blocks.iter())
        .copied()
        .collect();
    let bubble_clear = |bubble: ScreenRect| -> bool {
        !all_obstacles
            .iter()
            .any(|o| rects_intersect(bubble, *o, 4.0))
    };
    let bubble_label_clear = |bubble: ScreenRect| -> bool {
        !label_blocks
            .iter()
            .any(|o| rects_intersect(bubble, *o, 2.0))
    };
    let block_overlap = |bubble: ScreenRect| -> f32 {
        blocks
            .iter()
            .map(|o| overlap_px(bubble, *o))
            .sum()
    };
    let mut chosen = candidates[0];
    'sides: for &(bx, by) in &candidates {
        let bubble = bubble_at(bx, by);
        if bubble_clear(bubble) {
            chosen = (bx, by);
            break 'sides;
        }
    }
    if !bubble_clear(bubble_at(chosen.0, chosen.1)) {
        let mut picked = false;
        let mut least = f32::MAX;
        for &(bx, by) in &candidates {
            let bubble = bubble_at(bx, by);
            if !bubble_label_clear(bubble) {
                continue;
            }
            let area = block_overlap(bubble);
            if area < least {
                least = area;
                chosen = (bx, by);
                picked = true;
            }
        }
        if !picked {
            let mut least = f32::MAX;
            for &(bx, by) in &candidates {
                let bubble = bubble_at(bx, by);
                let area = block_overlap(bubble)
                    + label_blocks
                        .iter()
                        .map(|o| overlap_px(bubble, *o) * 6.0)
                        .sum::<f32>();
                if area < least {
                    least = area;
                    chosen = (bx, by);
                }
            }
        }
    }
    let mut bx = chosen.0;
    let mut by = chosen.1;
    bx = bx.clamp(VIEWPORT_PAD, (vw - est_w - VIEWPORT_PAD).max(VIEWPORT_PAD));
    by = by.clamp(VIEWPORT_PAD, (vh - est_h - VIEWPORT_PAD).max(VIEWPORT_PAD));
  let bubble = ScreenRect {
        l: bx,
        t: by,
        r: bx + est_w,
        b: by + est_h,
    };
    if all_obstacles
        .iter()
        .any(|o| rects_intersect(bubble, *o, 2.0))
    {
        bx = (anchor_x - player_w * 0.5 - gap - est_w)
            .clamp(VIEWPORT_PAD, (vw - est_w - VIEWPORT_PAD).max(VIEWPORT_PAD));
        by = (anchor_y - player_h * 0.92 - est_h * 0.5)
            .clamp(VIEWPORT_PAD, (vh - est_h - VIEWPORT_PAD).max(VIEWPORT_PAD));
    }
    format!(
        "left:{bx}px;top:{by}px;right:auto;bottom:auto;transform:none;max-width:{mw}px;width:max-content;",
        bx = bx,
        by = by,
        mw = est_w,
    )
}

fn clamp_door_bubble_in_viewport(
    anchor_x: f32,
    anchor_y: f32,
    player_w: f32,
    player_h: f32,
    vw: f32,
    vh: f32,
) -> String {
    let est_w = if vw < 440.0 {
        (vw - VIEWPORT_PAD * 2.0).max(120.0)
    } else {
        DOOR_BUBBLE_W.min(vw - VIEWPORT_PAD * 2.0)
    };
    let est_h = DOOR_BUBBLE_H;
    let mut bx;
    let mut by;
    let mut est_h_use = est_h;
    if vw < 440.0 {
        bx = VIEWPORT_PAD;
        by = (anchor_y + 12.0).min(vh - est_h_use - VIEWPORT_PAD);
        est_h_use = DOOR_BUBBLE_H + 32.0;
    } else if anchor_x < vw * 0.52 {
        bx = anchor_x + player_w * 0.5 + 16.0;
        by = if anchor_y > vh * 0.58 {
            anchor_y - player_h * 1.08
        } else {
            anchor_y - player_h * 0.92
        };
    } else {
        bx = anchor_x - player_w * 0.5 - 16.0 - est_w;
        by = if anchor_y > vh * 0.58 {
            anchor_y - player_h * 1.08
        } else {
            anchor_y - player_h * 0.92
        };
    }
    if bx + est_w > vw - VIEWPORT_PAD {
        bx = anchor_x - player_w * 0.5 - 12.0 - est_w;
    }
    if bx < VIEWPORT_PAD {
        bx = anchor_x + player_w * 0.5 + 12.0;
    }
    bx = bx.clamp(VIEWPORT_PAD, (vw - est_w - VIEWPORT_PAD).max(VIEWPORT_PAD));
    if vw >= 440.0 && anchor_x < vw * 0.42 && by > anchor_y - player_h * 0.25 {
        by = anchor_y - player_h * 1.05;
    }
    if vw >= 440.0 && by + est_h_use > vh - VIEWPORT_PAD {
        by = (anchor_y - player_h * 0.55).clamp(VIEWPORT_PAD, vh - est_h_use - VIEWPORT_PAD);
    }
    by = by.clamp(VIEWPORT_PAD, (vh - est_h_use - VIEWPORT_PAD).max(VIEWPORT_PAD));
    format!(
        "left:{bx}px;top:{by}px;right:auto;bottom:auto;transform:none;max-width:{mw}px;width:max-content;",
        bx = bx,
        by = by,
        mw = est_w,
    )
}

fn render_door_bubble_compact(
    portal: Portal,
    game: Rc<GameData>,
    on_enter: Callback<Portal>,
    slot_class: &'static str,
    extra_style: Option<String>,
) -> Html {
    let prompt = world::door_prompt_text(portal);
    let enter_label = "進入".to_string();
    let pos_style = extra_style.unwrap_or_default();
    html! {
        <div class={classes!("door-bubble", "door-bubble-compact", slot_class)}
            data-testid="door-bubble" data-portal={portal_landmark_key(portal)}
            style={pos_style}>
            <div class="door-bubble-inner">
                <span class="door-bubble-text">
                    <BpmfAside text={prompt} game={game.clone()} read=true compact=true />
                </span>
                <button type="button" class="door-bubble-enter pixel-btn primary" data-testid="door-enter-btn"
                    onclick={Callback::from(move |_| on_enter.emit(portal))}>
                    <BpmfAside text={enter_label} game={game} read=true compact=true />
                </button>
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
    _on_select_char: Callback<()>,
) -> Html {
  if fit {
    return html! {
        <div class="action-dock action-dock-fit-below" data-testid="fit-hint-strip">
            <div class="fit-dock-row">
                if let Some(portal) = door_portal.filter(|p| world::door_enterable(*p)) {
                    <p class="map-hint map-hint-fit fit-dock-name" data-testid="map-hint-door">
                        <BpmfAside text={ "按 Enter 進入".to_string() } game={game.clone()} read=true />
                    </p>
                } else if let Some(portal) = portal_near.filter(|p| !world::door_enterable(*p)) {
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
      <div class="action-dock action-dock-phone">
          if let Some(portal) = door_portal.filter(|p| world::door_enterable(*p)) {
              <p class="map-hint map-hint-door" data-testid="map-hint-door">
                  <BpmfAside text={ "按進入答題".to_string() } game={game.clone()} read=true compact=true />
              </p>
          } else if let Some(portal) = portal_near.filter(|p| !world::door_enterable(*p)) {
              <p class="map-hint map-hint-large">
                  <BpmfAside text={ world::GateLabel::name(portal).to_string() } game={game.clone()} read=true compact=true />
                  { " · " }
                  <BpmfAside text={ world::GateLabel::hint(portal).to_string() } game={game.clone()} read=true compact=true />
              </p>
          } else {
              <p class="map-hint map-hint-phone-short muted">
                  <BpmfAside text={ "走到門口".to_string() } game={game.clone()} read=true compact=true />
              </p>
          }
          <TouchPad on_pad_hold={on_pad_hold} />
      </div>
  }
}

fn walk_bob_px(phase: f32, vel: (f32, f32)) -> f32 {
    let moving = vel.0.hypot(vel.1) > 10.0;
    if moving {
        0.0
    } else {
        (phase * 0.35).sin() * 1.0
    }
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
    #[prop_or(WalkFacing::Down as u8)]
    pub walk_facing: u8,
    #[prop_or_default]
    pub walk_active: bool,
    #[prop_or_default]
    pub walk_sheet_frame: u8,
    pub portal_near: Option<Portal>,
    pub door_portal: Option<Portal>,
  #[prop_or_default]
    pub velocity: (f32, f32),
    #[prop_or_default]
    pub walk_phase: f32,
    pub on_enter: Callback<Portal>,
    pub on_map_click: Callback<(f32, f32)>,
    pub on_pad_hold: Callback<(crate::input::Dir, bool)>,
    #[prop_or_default]
    pub on_select_char: Callback<()>,
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
    let walk_bob = walk_bob_px(props.walk_phase, props.velocity);
    let moving = props.walk_active || props.velocity.0.hypot(props.velocity.1) > 0.5;
    let walk_row = props.walk_facing.min(3);
    let walk_col = if moving {
        props.walk_sheet_frame.min(3)
    } else {
        0
    };
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
    let cam_y = if fit {
        props.py
    } else {
        follow_camera_y(props.py, metrics.vh, PLAYER_H)
    };
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
            let z = foot as i32 + 12000;
            let follow_w = PLAYER_H * (FRAME_W / FRAME_H);
            let sheet = walk_url(&ch);
            let extra = format!("translateY({walk_bob}px)");
            let player_style =
                sprite_sheet_style(&sheet, walk_col, walk_row, follow_w, PLAYER_H, &extra);
            let dust = moving.then(|| html! {
                <span class="dust-puff" style={format!("left:{}px;top:{}px;", props.px - 8.0, props.py - 6.0)}></span>
            });
            layers.push((
                foot,
                html! {
                    <div key="player-wrap" class="island-player-wrap island-player-anchor"
                        style={format!(
                            "left:{}px;top:{}px;z-index:{};--player-w:110px;--player-h:{PLAYER_H}px;",
                            props.px - 55.0, props.py - PLAYER_H, z
                        )}>
                        { dust }
                        <div class="island-player island-player-walk" data-testid="island-player"
                            data-world-x={format!("{:.3}", props.px)}
                            data-world-y={format!("{:.3}", props.py)}
                            data-walk-col={walk_col.to_string()}
                            data-walk-row={walk_row.to_string()}
                            style={player_style}
                            role="presentation"></div>
                    </div>
                },
            ));
        }
    }

    layers.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut door_bubble_overlay = html! {};
    let mut fit_door_anchor: Option<(f32, f32, f32, f32)> = None;
    let player_screen = if fit {
        if let Some(ch) = character_by_id(&props.character_id) {
            let (raw_sx, raw_sy) = world_to_screen(props.px, props.py, &metrics);
            let screen_h = player_screen_h;
            let screen_w = player_screen_w;
            let pad_top = screen_h + VIEWPORT_PAD;
            let pad_side = screen_w * 0.5;
            let sx = raw_sx.clamp(pad_side, metrics.vw - pad_side);
            let sy = raw_sy.clamp(pad_top, metrics.vh - VIEWPORT_PAD);
            fit_door_anchor = Some((sx, sy, screen_w, screen_h));
            let bob_px = walk_bob * metrics.scale.max(0.25);
            let sheet = walk_url(&ch);
            let extra = format!("translate(-50%,-100%) translateY({bob_px}px)");
            let player_style =
                sprite_sheet_style(&sheet, walk_col, walk_row, screen_w, screen_h, &extra);
            html! {
                <div class="island-player-anchor"
                    style={format!(
                        "left:{sx}px;top:{sy}px;--player-w:{screen_w}px;--player-h:{screen_h}px;"
                    )}>
                    if moving && props.frame % 4 == 0 {
                        <span class="dust-puff dust-puff-fit"
                            style={format!("left:0;bottom:100%;margin-bottom:4px;")}></span>
                    }
                    <div class="island-player-screen" data-testid="island-player"
                        data-world-x={format!("{:.3}", props.px)}
                        data-world-y={format!("{:.3}", props.py)}
                        data-walk-col={walk_col.to_string()}
                        data-walk-row={walk_row.to_string()}
                        style={player_style}
                        role="presentation"></div>
                </div>
            }
        } else {
            html! {}
        }
    } else {
        html! {}
    };

    let mut fit_label_pos: Vec<(Portal, f32, f32)> = Vec::new();
    if fit {
        fit_label_pos = landmark_defs
            .iter()
            .map(|(_, x, y, portal)| {
                let (dx, below) = label_offset_below_portal(*portal);
                let (sx, sy) = world_to_screen(*x as f32 + dx, *y as f32 + below, &metrics);
                (*portal, sx, sy)
            })
            .collect();
        resolve_fit_label_overlaps(&mut fit_label_pos);
        let (psx, psy) = world_to_screen(props.px, props.py - 48.0, &metrics);
        for (_, sx, sy) in fit_label_pos.iter_mut() {
            let dx = *sx - psx;
            let dy = *sy - psy;
            let d = dx.hypot(dy);
            if d < 92.0 && d > 0.1 {
                let push = (92.0 - d) * 0.85;
                *sx += dx / d * push;
                *sy += dy / d * push * 0.35;
            }
        }
    }

    if let Some(portal) = props.door_portal {
        let (anchor_x, anchor_y, pw, ph) = if fit {
            if let Some((sx, sy, sw, sh)) = fit_door_anchor {
                (sx, sy, sw, sh)
            } else {
                let (sx, sy) = world_to_screen(props.px, props.py, &metrics);
                (sx, sy, player_screen_w, player_screen_h)
            }
        } else {
            (
                metrics.vw * 0.5,
                metrics.vh * 0.5 + PLAYER_H * 0.08,
                PLAYER_H * (FRAME_W / FRAME_H),
                PLAYER_H,
            )
        };
        let pos = if fit {
            let (blocks, label_blocks) = fit_door_obstacles(
                &metrics,
                &landmark_defs,
                &fit_label_pos,
                props.door_portal,
                anchor_x,
                anchor_y,
                pw,
                ph,
            );
            clamp_door_bubble_fit(
                anchor_x,
                anchor_y,
                pw,
                ph,
                metrics.vw,
                metrics.vh,
                &blocks,
                &label_blocks,
            )
        } else {
            clamp_door_bubble_in_viewport(
                anchor_x,
                anchor_y,
                pw,
                ph,
                metrics.vw,
                metrics.vh,
            )
        };
        door_bubble_overlay = render_door_bubble_compact(
            portal,
            props.game.clone(),
            props.on_enter.clone(),
            "door-bubble-viewport",
            Some(pos),
        );
    }

    let label_overlay = if fit {
        let pos_by: std::collections::HashMap<Portal, (f32, f32)> = fit_label_pos
            .iter()
            .copied()
            .map(|(p, sx, sy)| (p, (sx, sy)))
            .collect();
        let (psx, psy) = world_to_screen(props.px, props.py - 48.0, &metrics);
        html! {
            <div class="island-fit-labels" aria-hidden="false">
                { for landmark_defs.iter().map(|(key, _x, _y, portal)| {
                    let (sx, sy) = pos_by.get(portal).copied().unwrap_or((0.0, 0.0));
                    let dx = sx - psx;
                    let dy = sy - psy;
                    let hidden = props.door_portal == Some(*portal);
                    let fade = if hidden {
                        " island-fit-label-hidden"
                    } else if dx.hypot(dy) < 78.0 {
                        " island-fit-label-faded"
                    } else {
                        ""
                    };
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
        props.on_select_char.clone(),
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
                { door_bubble_overlay }
            </div>
            { dock }
        </div>
    }
}
