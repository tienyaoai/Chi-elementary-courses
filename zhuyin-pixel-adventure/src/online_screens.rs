use crate::components::BpmfAside;
use crate::island_api::{
    fetch_announcements, fetch_leaderboard, login, logout, register, Announcement, IslandSession,
    LeaderRow, load_session,
};
use std::rc::Rc;
use wasm_bindgen_futures::spawn_local;
use yew::prelude::*;
use zhuyin_island_wasm::data::GameData;

#[derive(Properties, PartialEq)]
pub struct BulletinProps {
    pub game: Rc<GameData>,
    pub on_back: Callback<MouseEvent>,
    pub on_open_account: Callback<MouseEvent>,
}

#[function_component(BulletinScreen)]
pub fn bulletin_screen(props: &BulletinProps) -> Html {
    let scope = use_state(|| "total".to_string());
    let leaders = use_state(Vec::<LeaderRow>::new);
    let announcements = use_state(Vec::<Announcement>::new);
    let err = use_state(String::new);
    let session = use_state(load_session);

    {
        let scope = scope.clone();
        let leaders = leaders.clone();
        let announcements = announcements.clone();
        let err = err.clone();
        use_effect_with((*scope).clone(), move |sc| {
            let sc = sc.clone();
            spawn_local(async move {
                match fetch_leaderboard(&sc).await {
                    Ok(rows) => leaders.set(rows),
                    Err(e) => err.set(e),
                }
                match fetch_announcements().await {
                    Ok(a) => announcements.set(a),
                    Err(e) => {
                        if (*err).is_empty() {
                            err.set(e);
                        }
                    }
                }
            });
            || ()
        });
    }

    html! {
        <section class="panel-pixel bulletin-panel lesson-read">
            <h1 class="pixel-title"><BpmfAside text={ "佈告欄".to_string() } game={props.game.clone()} read=true /></h1>
            if let Some(ref s) = *session {
                <p class="pixel-sub">{ format!("已登入：{}", s.nickname) }</p>
            } else {
                <p class="pixel-sub"><BpmfAside text={ "不登入也能玩；登入後才會上榜。".to_string() } game={props.game.clone()} read=true /></p>
            }
            <div class="bulletin-actions">
                <button type="button" class="pixel-btn ghost" onclick={props.on_open_account.clone()}>
                    { if session.is_some() { "帳號" } else { "登入／註冊" } }
                </button>
                if session.is_some() {
                    <button type="button" class="pixel-btn ghost" onclick={Callback::from({
                        let session = session.clone();
                        move |_| {
                            spawn_local(async move {
                                logout().await;
                            });
                            session.set(None);
                        }
                    })}>
                        {"登出"}
                    </button>
                }
            </div>
            <div class="bulletin-scope">
                { for ["total", "chinese", "math", "english"].iter().map(|s| {
                    let label = match *s {
                        "total" => "總分",
                        "chinese" => "國語",
                        "math" => "數學",
                        "english" => "英語",
                        _ => *s,
                    };
                    let scope = scope.clone();
                    let id = s.to_string();
                    html! {
                        <button type="button" class={classes!("pixel-btn", ((*scope) == id).then_some("primary"))}
                            onclick={Callback::from(move |_| scope.set(id.clone()))}>
                            { label }
                        </button>
                    }
                })}
            </div>
            if !err.is_empty() {
                <p class="feedback-soft">{ &*err }</p>
            }
            <h2 class="bulletin-h2">{"排行榜"}</h2>
            <ol class="leaderboard-list">
                { for leaders.iter().enumerate().map(|(i, r)| html! {
                    <li key={format!("{}-{}", r.nickname, i)}>
                        <span class="rank">{ format!("{}.", i + 1) }</span>
                        <span class="nick">{ &r.nickname }</span>
                        <span class="pts">{ r.points }</span>
                    </li>
                })}
            </ol>
            <h2 class="bulletin-h2">{"公告"}</h2>
            <ul class="announcement-list">
                { for announcements.iter().map(|a| html! {
                    <li key={a.id}>
                        <h3>{ &a.title }</h3>
                        <p>{ &a.body }</p>
                    </li>
                })}
            </ul>
            <button type="button" class="pixel-btn primary big-touch" onclick={props.on_back.clone()}>
                <BpmfAside text={ "回地圖".to_string() } game={props.game.clone()} read=true />
            </button>
        </section>
    }
}

#[derive(Properties, PartialEq)]
pub struct AccountProps {
    pub game: Rc<GameData>,
    pub on_back: Callback<MouseEvent>,
    pub on_logged_in: Callback<IslandSession>,
}

#[function_component(AccountScreen)]
pub fn account_screen(props: &AccountProps) -> Html {
    let mode = use_state(|| "login".to_string());
    let nickname = use_state(String::new);
    let password = use_state(String::new);
    let msg = use_state(String::new);

    let submit = {
        let mode = mode.clone();
        let nickname = nickname.clone();
        let password = password.clone();
        let msg = msg.clone();
        let on_logged_in = props.on_logged_in.clone();
        Callback::from(move |_| {
            let m = (*mode).clone();
            let n = (*nickname).clone();
            let p = (*password).clone();
            let cb = on_logged_in.clone();
            let msg = msg.clone();
            spawn_local(async move {
                let res = if m == "register" {
                    register(&n, &p).await
                } else {
                    login(&n, &p).await
                };
                match res {
                    Ok(s) => cb.emit(s),
                    Err(e) => msg.set(e),
                }
            });
        })
    };

    html! {
        <section class="panel-pixel account-panel lesson-read">
            <h1 class="pixel-title"><BpmfAside text={ "冒險帳號".to_string() } game={props.game.clone()} read=true /></h1>
            <p class="pixel-sub"><BpmfAside text={ "自訂暱稱與密碼，不需 Email。".to_string() } game={props.game.clone()} read=true /></p>
            <div class="account-mode">
                <button type="button" class={classes!("pixel-btn", ((*mode) == "login").then_some("primary"))}
                    onclick={Callback::from({ let mode = mode.clone(); move |_| mode.set("login".into()) })}>
                    {"登入"}
                </button>
                <button type="button" class={classes!("pixel-btn", ((*mode) == "register").then_some("primary"))}
                    onclick={Callback::from({ let mode = mode.clone(); move |_| mode.set("register".into()) })}>
                    {"註冊"}
                </button>
            </div>
            <label class="account-field">{"暱稱"}
                <input type="text" class="pixel-input" value={(*nickname).clone()}
                    oninput={Callback::from({ let nickname = nickname.clone(); move |e: InputEvent| {
                        if let Some(t) = e.target_dyn_into::<web_sys::HtmlInputElement>() {
                            nickname.set(t.value());
                        }
                    }})} />
            </label>
            <label class="account-field">{"密碼"}
                <input type="password" class="pixel-input" value={(*password).clone()}
                    oninput={Callback::from({ let password = password.clone(); move |e: InputEvent| {
                        if let Some(t) = e.target_dyn_into::<web_sys::HtmlInputElement>() {
                            password.set(t.value());
                        }
                    }})} />
            </label>
            if !msg.is_empty() {
                <p class="feedback-soft">{ &*msg }</p>
            }
            <button type="button" class="pixel-btn primary big-touch" onclick={submit}>
                { if *mode == "register" { "建立帳號" } else { "登入" } }
            </button>
            <button type="button" class="pixel-btn ghost" onclick={props.on_back.clone()}>
                <BpmfAside text={ "返回".to_string() } game={props.game.clone()} read=true />
            </button>
        </section>
    }
}
