use crate::pixel_art_manifest::image_url;
use crate::pixel_art_preload::{is_loaded, preload_url};
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct PixelPictureProps {
    pub description: String,
    #[prop_or(false)]
    pub compact: bool,
    #[prop_or(false)]
    pub large: bool,
}

#[function_component(PixelPicture)]
pub fn pixel_picture(props: &PixelPictureProps) -> Html {
    let ready = use_state(|| false);
    let url = image_url(&props.description);
    {
        let ready = ready.clone();
        let desc = props.description.clone();
        use_effect_with(desc, move |description| {
            if let Some(url) = image_url(description) {
                if is_loaded(&url) {
                    ready.set(true);
                } else {
                    let ready = ready.clone();
                    preload_url(
                        url,
                        Some(Callback::from(move |_| {
                            ready.set(true);
                        })),
                    );
                }
            }
            || ()
        });
    }
    let Some(url) = url else {
        return html! {};
    };
    html! {
        <span class={classes!(
            "pixel-picture-frame",
            props.compact.then_some("compact"),
            props.large.then_some("large"),
            (*ready).then_some("loaded")
        )}>
            <span class="pixel-picture-placeholder" aria-hidden="true" />
            <img
                class={classes!(
                    "pixel-picture-img",
                    props.compact.then_some("compact"),
                    props.large.then_some("pixel-picture-large"),
                    (!*ready).then_some("pixel-picture-pending")
                )}
                src={url}
                alt={props.description.clone()}
                decoding="async"
                loading="eager"
                onload={Callback::from({
                    let ready = ready.clone();
                    move |_| ready.set(true)
                })}
            />
        </span>
    }
}
