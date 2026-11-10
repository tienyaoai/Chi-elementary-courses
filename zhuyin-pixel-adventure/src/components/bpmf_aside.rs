use crate::bpmf_aside::{aside_units, vertical_glyphs};
use std::collections::HashMap;
use std::rc::Rc;
use yew::prelude::*;
use zhuyin_island_wasm::data::GameData;

#[derive(Properties, PartialEq)]
pub struct BpmfAsideProps {
    pub text: String,
    pub game: Rc<GameData>,
    #[prop_or_default]
    pub class: Classes,
    #[prop_or(false)]
    pub large: bool,
    #[prop_or(false)]
    pub read: bool,
    #[prop_or(false)]
    pub compact: bool,
}

#[function_component(BpmfAside)]
pub fn bpmf_aside(props: &BpmfAsideProps) -> Html {
    let units = aside_units(&props.game.readings, &props.text);
    let size = if props.compact {
        "bpmf-aside-compact"
    } else if props.read {
        "bpmf-aside-read"
    } else if props.large {
        "bpmf-aside-lg"
    } else {
        ""
    };
    html! {
        <span class={classes!("bpmf-aside", size, props.class.clone())}>
            { for units.into_iter().enumerate().map(|(i, u)| {
                if let Some(rt) = u.bpmf {
                    let glyphs = vertical_glyphs(&rt);
                    html! {
                        <span class="han-unit" key={i}>
                            <span class="han">{ u.han }</span>
                            <span class="bpmf-col" aria-hidden="true">
                                { for glyphs.iter().map(|g| html! { <span class="bpmf-glyph">{ *g }</span> }) }
                            </span>
                        </span>
                    }
                } else {
                    html! { <span class="han-plain" key={i}>{ u.han }</span> }
                }
            })}
        </span>
    }
}
