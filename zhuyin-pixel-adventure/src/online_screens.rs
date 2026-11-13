use crate::components::BpmfAside;
use crate::island_api::{
    fetch_announcements, fetch_leaderboard, login, logout, register, Announcement, IslandSession,
    LeaderRow, load_session,
};
use std::rc::Rc;
use wasm_bindgen_futures::spawn_local;
use yew::prelude::*;
use zhuyin_island_wasm::data::GameData;

#[derive(Clone, PartialEq)]
enum BulletinTab {
    Leaderboard,
    Announcements,
}

fn medal_icon(rank: usize) -> Option<&'static str> {
    match rank {
        0 => Some("🥇"),
        1 => Some("🥈"),
        2 => Some("🥉"),
        _ => None,
    }
}

fn scope_label(id: &str) -> &'static str {
    match id {
        "total" => "總分",
        "chinese" => "國語",
        "math" => "數學",
        "english" => "英語",
        _ => "總分",
    }
}

#[derive(Properties, PartialEq)]
pub struct BulletinProps {
    pub game: Rc<GameData>,
    pub on_back: Callback<MouseEvent>,
    pub on_open_account: Callback<MouseEvent>,
}

#[function_component(BulletinScreen)]
pub fn bulletin_screen(props: &BulletinProps) -> Html {
    let scope = use_state(|| "total".to_string());
    let tab = use_state(|| BulletinTab::Announcements);
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

    let game = props.game.clone();
    let tab_class = match *tab {
        BulletinTab::Announcements => "tab-announce",
        BulletinTab::Leaderboard => "tab-leader",
    };

    let scope_chips = html! {
        <div class="bulletin-scope" role="group" aria-label="排行榜範圍">
            { for ["total", "chinese", "math", "english"].iter().map(|s| {
                let label = scope_label(s);
                let scope = scope.clone();
                let id = s.to_string();
                let game = game.clone();
                html! {
                    <button type="button"
                        class={classes!(
                            "pixel-btn",
                            "bulletin-chip-btn",
                            ((*scope) == id).then_some("primary")
                        )}
                        onclick={Callback::from(move |_| scope.set(id.clone()))}>
                        <BpmfAside text={ label.to_string() } game={game.clone()} read=true compact=true />
                    </button>
                }
            })}
        </div>
    };

    html! {
        <section class={classes!(
            "panel-pixel",
            "bulletin-panel",
            "lesson-read",
            "bulletin-shell",
            tab_class
        )}>
            <div class="bulletin-header">
                <h1 class="pixel-title bulletin-title">
                    <BpmfAside text={ "佈告欄".to_string() } game={game.clone()} read=true />
                </h1>
                if let Some(ref s) = *session {
                    <p class="pixel-sub bulletin-logged-in">
                        <BpmfAside text={ "已登入：".to_string() } game={game.clone()} read=true />
                        <span class="bulletin-nickname-plain">{ &s.nickname }</span>
                    </p>
                } else {
                    <p class="pixel-sub bulletin-login-hint">
                        <span class="bulletin-hint-line">
                            <BpmfAside text={ "不登入也能玩；".to_string() } game={game.clone()} read=true compact=true />
                        </span>
                        <span class="bulletin-hint-line bulletin-hint-phrase">
                            <BpmfAside text={ "登入後才會上榜。".to_string() } game={game.clone()} read=true compact=true />
                        </span>
                    </p>
                }
                <div class="bulletin-actions">
                    <button type="button" class="pixel-btn ghost bulletin-inline-btn" onclick={props.on_open_account.clone()}>
                        if session.is_some() {
                            <BpmfAside text={ "帳號".to_string() } game={game.clone()} read=true compact=true />
                        } else {
                            <BpmfAside text={ "登入／註冊".to_string() } game={game.clone()} read=true compact=true />
                        }
                    </button>
                    if session.is_some() {
                        <button type="button" class="pixel-btn ghost bulletin-inline-btn" onclick={Callback::from({
                            let session = session.clone();
                            move |_| {
                                spawn_local(async move { logout().await; });
                                session.set(None);
                            }
                        })}>
                            <BpmfAside text={ "登出".to_string() } game={game.clone()} read=true compact=true />
                        </button>
                    }
                </div>
                <div class="bulletin-tabs" role="tablist">
                    <button type="button" role="tab"
                        class={classes!(
                            "pixel-btn",
                            "bulletin-tab-btn",
                            matches!(*tab, BulletinTab::Announcements).then_some("primary")
                        )}
                        aria-selected={matches!(*tab, BulletinTab::Announcements).to_string()}
                        onclick={Callback::from({
                            let tab = tab.clone();
                            move |_| tab.set(BulletinTab::Announcements)
                        })}>
                        <BpmfAside text={ "公告".to_string() } game={game.clone()} read=true compact=true />
                    </button>
                    <button type="button" role="tab"
                        class={classes!(
                            "pixel-btn",
                            "bulletin-tab-btn",
                            matches!(*tab, BulletinTab::Leaderboard).then_some("primary")
                        )}
                        aria-selected={matches!(*tab, BulletinTab::Leaderboard).to_string()}
                        onclick={Callback::from({
                            let tab = tab.clone();
                            move |_| tab.set(BulletinTab::Leaderboard)
                        })}>
                        <BpmfAside text={ "排行榜".to_string() } game={game.clone()} read=true compact=true />
                    </button>
                </div>
            </div>

            <div class="bulletin-body">
                if !err.is_empty() {
                    <p class="feedback-soft bulletin-err">
                        <BpmfAside text={(*err).clone()} game={game.clone()} read=true />
                    </p>
                }
                <div class="bulletin-split">
                    <section class="bulletin-pane bulletin-pane-announcements" role="tabpanel">
                        <ul class="announcement-list">
                            { for announcements.iter().map(|a| html! {
                                <li key={a.id} class="announcement-item">
                                    <p class="announcement-title-plain">{ &a.title }</p>
                                    <p class="announcement-body-plain">{ &a.body }</p>
                                </li>
                            })}
                            if announcements.is_empty() {
                                <li class="announcement-item muted">
                                    <BpmfAside text={ "目前沒有公告。".to_string() } game={game.clone()} read=true />
                                </li>
                            }
                        </ul>
                    </section>
                    <section class="bulletin-pane bulletin-pane-leaderboard" role="tabpanel">
                        { scope_chips }
                        <div class="leaderboard-head" aria-hidden="true">
                            <span class="lb-h"><BpmfAside text={ "名次".to_string() } game={game.clone()} read=true compact=true /></span>
                            <span class="lb-h"><BpmfAside text={ "暱稱".to_string() } game={game.clone()} read=true compact=true /></span>
                            <span class="lb-h"><BpmfAside text={ "分數".to_string() } game={game.clone()} read=true compact=true /></span>
                        </div>
                        <ul class="leaderboard-list">
                            { for leaders.iter().enumerate().map(|(i, r)| {
                                let rank = i + 1;
                                let medal = medal_icon(i);
                                html! {
                                    <li key={format!("{}-{}", r.nickname, i)} class="leaderboard-row">
                                        <span class="lb-col lb-rank" aria-label={format!("第{rank}名")}>
                                            if let Some(m) = medal {
                                                <span class="lb-medal" aria-hidden="true">{ m }</span>
                                            } else {
                                                <span class="lb-rank-num">{ rank }</span>
                                            }
                                        </span>
                                        <span class="lb-col lb-nick">{ &r.nickname }</span>
                                        <span class="lb-col lb-pts">{ r.points }</span>
                                    </li>
                                }
                            })}
                        </ul>
                    </section>
                </div>
            </div>

            <div class="bulletin-footer">
                <button type="button" class="pixel-btn primary bulletin-back" onclick={props.on_back.clone()}>
                    <BpmfAside text={ "回地圖".to_string() } game={game.clone()} read=true compact=true />
                </button>
            </div>
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
    let game = props.game.clone();

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
        <section class="panel-pixel account-panel lesson-read account-shell">
            <h1 class="pixel-title"><BpmfAside text={ "冒險帳號".to_string() } game={game.clone()} read=true /></h1>
            <p class="pixel-sub account-sub-full">
                <BpmfAside text={ "自訂暱稱與密碼，不需 Email。".to_string() } game={game.clone()} read=true />
            </p>
            <div class="account-mode">
                <button type="button" class={classes!("pixel-btn", "account-mode-btn", ((*mode) == "login").then_some("primary"))}
                    onclick={Callback::from({ let mode = mode.clone(); move |_| mode.set("login".into()) })}>
                    <BpmfAside text={ "登入".to_string() } game={game.clone()} read=true />
                </button>
                <button type="button" class={classes!("pixel-btn", "account-mode-btn", ((*mode) == "register").then_some("primary"))}
                    onclick={Callback::from({ let mode = mode.clone(); move |_| mode.set("register".into()) })}>
                    <BpmfAside text={ "註冊".to_string() } game={game.clone()} read=true />
                </button>
            </div>
            <label class="account-field">
                <span class="account-label"><BpmfAside text={ "暱稱".to_string() } game={game.clone()} read=true /></span>
                <input type="text" class="pixel-input" value={(*nickname).clone()}
                    oninput={Callback::from({ let nickname = nickname.clone(); move |e: InputEvent| {
                        if let Some(t) = e.target_dyn_into::<web_sys::HtmlInputElement>() {
                            nickname.set(t.value());
                        }
                    }})} />
            </label>
            <label class="account-field">
                <span class="account-label"><BpmfAside text={ "密碼".to_string() } game={game.clone()} read=true /></span>
                <input type="password" class="pixel-input" value={(*password).clone()}
                    oninput={Callback::from({ let password = password.clone(); move |e: InputEvent| {
                        if let Some(t) = e.target_dyn_into::<web_sys::HtmlInputElement>() {
                            password.set(t.value());
                        }
                    }})} />
            </label>
            if !msg.is_empty() {
                <p class="feedback-soft">
                    <BpmfAside text={(*msg).clone()} game={game.clone()} read=true />
                </p>
            }
            <button type="button" class="pixel-btn primary big-touch account-submit" onclick={submit.clone()}>
                if *mode == "register" {
                    <BpmfAside text={ "建立帳號".to_string() } game={game.clone()} read=true />
                } else {
                    <BpmfAside text={ "登入".to_string() } game={game.clone()} read=true />
                }
            </button>
            <button type="button" class="pixel-btn ghost account-back" onclick={props.on_back.clone()}>
                <BpmfAside text={ "返回".to_string() } game={game.clone()} read=true />
            </button>
        </section>
    }
}
