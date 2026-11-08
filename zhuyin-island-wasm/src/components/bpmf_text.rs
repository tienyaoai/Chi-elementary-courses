use crate::bpmf::{ruby_fallback, to_ivs, resolve};
use crate::data::GameData;
use std::rc::Rc;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct BpmfTextProps {
    pub text: String,
    #[prop_or_default]
    pub class: Classes,
    pub game: Rc<GameData>,
    #[prop_or(false)]
    pub font_ok: bool,
}

#[function_component(BpmfText)]
pub fn bpmf_text(props: &BpmfTextProps) -> Html {
    let class = classes!("bpmf-text", props.class.clone());
    if props.font_ok {
        let parts = resolve(&props.game.readings, &props.text);
        let s = to_ivs(&parts);
        return html! { <span class={classes!(class, "bpmf")}>{s}</span> };
    }
    let parts = ruby_fallback(&props.game.readings, &props.text);
    html! {
        <span class={classes!(class, "ruby-fallback")}>
            { for parts.into_iter().enumerate().map(|(i, (han, rt))| {
                if let Some(rt) = rt {
                    html! {
                        <ruby key={i}>
                            {han}
                            <rt>{rt}</rt>
                        </ruby>
                    }
                } else {
                    html! { <span key={i}>{han}</span> }
                }
            })}
        </span>
    }
}
