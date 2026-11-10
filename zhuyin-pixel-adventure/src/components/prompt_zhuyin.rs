use crate::bpmf_aside::vertical_glyphs;
use crate::grade1::ZhuyinGlyph;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct PromptZhuyinProps {
    pub glyphs: Vec<ZhuyinGlyph>,
    #[prop_or(true)]
    pub read: bool,
}

#[function_component(PromptZhuyin)]
pub fn prompt_zhuyin(props: &PromptZhuyinProps) -> Html {
    let size = if props.read { "bpmf-aside-read" } else { "bpmf-aside-lg" };
    html! {
        <span class={classes!("prompt-zhuyin", "bpmf-aside", size)}>
            { for props.glyphs.iter().enumerate().map(|(i, g)| {
                let hide = g.zhuyin == "？";
                let plain = g.zhuyin.is_empty();
                html! {
                    if hide {
                        <span class="han-unit han-hidden-zhuyin" key={i}>
                            <span class="han">{ &g.char }</span>
                        </span>
                    } else if plain {
                        <span class="han-plain" key={i}>{ &g.char }</span>
                    } else {
                        <span class="han-unit" key={i}>
                            <span class="han">{ &g.char }</span>
                            <span class="bpmf-col" aria-hidden="true">
                                { for vertical_glyphs(&g.zhuyin).iter().map(|c| html! {
                                    <span class="bpmf-glyph">{ *c }</span>
                                })}
                            </span>
                        </span>
                    }
                }
            })}
        </span>
    }
}
