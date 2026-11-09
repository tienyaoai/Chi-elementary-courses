use crate::island_walk;
use crate::map_config::{character_by_id, full_url, landmark_url, layer, MapOrientation};
use crate::world::{self, Portal};
use wasm_bindgen::JsCast;
use web_sys::MouseEvent;
use yew::prelude::*;

const PLAYER_H: f32 = 110.0;

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
}

#[function_component(IslandMap)]
pub fn island_map(props: &IslandMapProps) -> Html {
    let viewport_ref = use_node_ref();
    let lay = layer(props.orient);
    let map_w = lay.width;
    let map_h = lay.height;
    let bob = if props.frame % 2 == 0 { 0.0 } else { -4.0 };

    let orient = props.orient;
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
            let world_x = px + local_x - vw / 2.0;
            let world_y = py + local_y - vh / 2.0;
            let (wx, wy) = island_walk::clamp_to_map(world_x, world_y, orient);
            on_map_click.emit((wx, wy));
        })
    };

    let cam_x = props.px;
    let cam_y = props.py;

    let mut layers: Vec<(f32, Html)> = Vec::new();

    let lm = crate::map_config::landmarks(props.orient);
    let landmark_defs = [
        ("chinese", lm.chinese.x, lm.chinese.y, Portal::Chinese),
        ("english", lm.english.x, lm.english.y, Portal::English),
        ("math", lm.math.x, lm.math.y, Portal::Math),
        ("treasure", lm.treasure.x, lm.treasure.y, Portal::Treasure),
    ];
    for (key, x, y, _) in landmark_defs {
        let url = landmark_url(key);
        let foot_y = y as f32;
        let z = foot_y as i32;
        layers.push((
            foot_y,
            html! {
                <img key={format!("lm-{key}")} class="island-landmark" src={url}
                    style={format!("left:{}px;top:{}px;z-index:{};", x, y - 20, z)}
                    alt="" draggable="false" />
            },
        ));
    }

    if let Some(ch) = character_by_id(&props.character_id) {
        let foot = props.py;
        let flip = if props.facing_left { "scaleX(-1)" } else { "none" };
        let z = foot as i32 + 1;
        layers.push((
            foot,
            html! {
                <img key="player" class="island-player" src={full_url(&ch)}
                    style={format!(
                        "left:{}px;top:{}px;transform:{} translateY({}px);z-index:{};",
                        props.px - 55.0,
                        props.py - PLAYER_H,
                        flip,
                        bob,
                        z
                    )}
                    alt="" draggable="false" />
            },
        ));
    }

    layers.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let can_enter = matches!(
        props.portal_near,
        Some(Portal::Chinese | Portal::Treasure)
    );

    let enter_portal = props.portal_near;

    html! {
        <div class="island-map-shell">
            <div ref={viewport_ref} class="island-viewport" onclick={on_click}>
                <div class="island-world" style={format!(
                    "width:{map_w}px;height:{map_h}px;transform:translate(calc(50% - {cam_x}px), calc(50% - {cam_y}px));"
                )}>
                    <img class="island-bg" src={lay.src.clone()} width={map_w.to_string()} height={map_h.to_string()}
                        alt="" draggable="false" />
                    { for layers.into_iter().map(|(_, n)| n) }
                </div>
            </div>
            <div class="action-dock">
                if let Some(portal) = props.portal_near {
                    <p class="map-hint map-hint-large">
                        <span class="enter-label-text">{ world::GateLabel::name(portal) }</span>
                        { " · " }
                        { world::GateLabel::hint(portal) }
                    </p>
                } else {
                    <p class="map-hint muted">{"點地圖移動，或用方向鍵走到建築前"}</p>
                }
                if can_enter {
                    if let Some(portal) = enter_portal {
                        <button type="button" class="enter-btn pixel-btn primary pulse"
                            onclick={Callback::from({
                                let on_enter = props.on_enter.clone();
                                move |_| on_enter.emit(portal)
                            })}>
                            <span class="enter-label-text">{ world::GateLabel::enter_label(portal) }</span>
                        </button>
                    }
                }
            </div>
        </div>
    }
}
