use crate::components::{BpmfText, Mascot};
use crate::data::{load_game_data, GameData};
use crate::progress::Progress;
use crate::screens::{
    CardsScreen, HomeScreen, MemoryScreen, OrderScreen, QuizScreen, ResultScreen, StoryScreen,
};
use crate::screens::home::HomeAction;
use std::rc::Rc;
use wasm_bindgen_futures::spawn_local;
use yew::prelude::*;

#[derive(Clone, PartialEq)]
enum View {
    Home,
    Cards { theme_id: String, active_id: Option<String> },
    Play { mode: &'static str, nonce: u64 },
    Result {
        mode: &'static str,
        stars: u8,
        detail: String,
        nonce: u64,
    },
}

#[function_component(App)]
pub fn app() -> Html {
    let game = use_state(|| None::<Rc<GameData>>);
    let font_ok = use_state(|| false);
    let progress = use_state(Progress::load);
    let view = use_state(|| View::Home);
    let ready = use_state(|| false);

    {
        let game = game.clone();
        let ready = ready.clone();
        use_effect_with((), move |_| {
            spawn_local(async move {
                match load_game_data().await {
                    Ok(data) => {
                        game.set(Some(data));
                        ready.set(true);
                    }
                    Err(err) => {
                        web_sys::console::error_1(&err.into());
                    }
                }
            });
            || ()
        });
    }

    {
        let font_ok = font_ok.clone();
        let ready = ready.clone();
        use_effect_with(*ready, move |is_ready| {
            if *is_ready {
                spawn_local({
                    let font_ok = font_ok.clone();
                    async move {
                        gloo_timers::future::TimeoutFuture::new(100).await;
                        let font_ready = font::wait_for_bpmf_font().await;
                        font_ok.set(font_ready);
                    }
                });
                let font_ok_c = font_ok.clone();
                gloo::timers::callback::Timeout::new(5000, move || {
                    font_ok_c.set(true);
                })
                .forget();
            }
            || ()
        });
    }

    let patch_progress = {
        let progress = progress.clone();
        Callback::from(move |f: Box<dyn FnOnce(Progress) -> Progress>| {
            let mut p = Progress::load();
            p = f(p);
            p.save();
            progress.set(p);
        })
    };

    let go_home = {
        let view = view.clone();
        Callback::from(move |_| view.set(View::Home))
    };

    let Some(game) = (*game).clone() else {
        return html! {
            <main class="shell">
                <div class="splash stack text-center">
                    <Mascot />
                    <p class="system-font text-2xl">{"注注正在準備注音"}</p>
                </div>
            </main>
        };
    };

    let font = *font_ok;
    let prog = (*progress).clone();

    let body = match &*view {
        View::Home => html! {
            <HomeScreen
                game={game.clone()}
                font_ok={font}
                progress={prog.clone()}
                on_action={Callback::from({
                    let view = view.clone();
                    let patch = patch_progress.clone();
                    move |a| match a {
                        HomeAction::Cards => {
                            let theme = game.content.themes.first().map(|t| t.id.clone()).unwrap_or_default();
                            view.set(View::Cards { theme_id: theme, active_id: None });
                        }
                        HomeAction::Play(mode) => {
                            view.set(View::Play { mode, nonce: js_sys::Date::now() as u64 });
                        }
                    }
                })}
                on_toggle_sound={Callback::from({
                    let patch = patch_progress.clone();
                    move |_| patch.emit(Box::new(|mut p| { p.sound = !p.sound; p }))
                })}
                on_intro_done={Callback::from({
                    let patch = patch_progress.clone();
                    move |_| patch.emit(Box::new(|mut p| { p.intro_seen = true; p }))
                })}
                on_clear={Callback::from({
                    let patch = patch_progress.clone();
                    move |_| patch.emit(Box::new(|_| Progress::default()))
                })}
            />
        },
        View::Cards { theme_id, active_id } => html! {
            <CardsScreen
                game={game.clone()}
                font_ok={font}
                progress={prog.clone()}
                theme_id={theme_id.clone()}
                active_id={active_id.clone()}
                on_exit={go_home.clone()}
                on_theme={Callback::from({
                    let view = view.clone();
                    move |id| view.set(View::Cards { theme_id: id, active_id: None })
                })}
                on_stamp={Callback::from({
                    let patch = patch_progress.clone();
                    let view = view.clone();
                    move |id: String| {
                        let stamp_id = id.clone();
                        patch.emit(Box::new(move |mut p| {
                            if !p.stamps.contains(&stamp_id) {
                                p.stamps.push(stamp_id);
                            }
                            p
                        }));
                        if let View::Cards { theme_id, .. } = &*view {
                            view.set(View::Cards { theme_id: theme_id.clone(), active_id: Some(id) });
                        }
                    }
                })}
            />
        },
        View::Play { mode, nonce } => match *mode {
            "quiz" => html! {
                <QuizScreen game={game.clone()} font_ok={font} on_exit={go_home.clone()}
                    on_done={done_cb(&view, *mode, *nonce)} />
            },
            "order" => html! {
                <OrderScreen game={game.clone()} font_ok={font} on_exit={go_home.clone()}
                    on_done={done_cb(&view, *mode, *nonce)} />
            },
            "memory" => html! {
                <MemoryScreen game={game.clone()} font_ok={font} on_exit={go_home.clone()}
                    on_done={done_cb(&view, *mode, *nonce)} />
            },
            "story" => html! {
                <StoryScreen game={game.clone()} font_ok={font} on_exit={go_home.clone()}
                    on_done={done_cb(&view, *mode, *nonce)} />
            },
            _ => html! { <div></div> },
        },
        View::Result { mode, stars, detail, nonce } => html! {
            <ResultScreen game={game.clone()} font_ok={font} stars={*stars} detail={detail.clone()}
                on_home={go_home.clone()}
                on_replay={Callback::from({
                    let view = view.clone();
                    let mode = *mode;
                    let nonce = *nonce;
                    move |_| view.set(View::Play { mode, nonce: nonce + 1 })
                })}
                on_next={Callback::from({
                    let view = view.clone();
                    move |_| view.set(View::Home)
                })}
            />
        },
    };

    html! {
        <main class="shell">
            { body }
        </main>
    }
}

fn done_cb(view: &UseStateHandle<View>, mode: &'static str, nonce: u64) -> Callback<(u8, String)> {
    let view = view.clone();
    Callback::from(move |(stars, detail)| {
        let mut p = Progress::load();
        let prev = p.best.get(mode).copied().unwrap_or(0);
        if stars > prev {
            p.best.insert(mode.to_string(), stars);
        }
        p.save();
        view.set(View::Result {
            mode,
            stars,
            detail,
            nonce,
        });
    })
}

mod font {
    use wasm_bindgen_futures::JsFuture;
    use web_sys::js_sys;

    pub async fn wait_for_bpmf_font() -> bool {
        let Some(window) = web_sys::window() else {
            return false;
        };
        let document = window.document().unwrap();
        let fonts = document.fonts();
        let promise = fonts.load("16px BpmfHuninn");
        if JsFuture::from(promise).await.is_ok() {
            return fonts.check("16px BpmfHuninn").unwrap_or(false);
        }
        false
    }
}
