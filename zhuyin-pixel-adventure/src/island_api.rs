use gloo::storage::{LocalStorage, Storage};
use gloo_net::http::Request;
use serde::{Deserialize, Serialize};

pub const SESSION_KEY: &str = "zhuzhu-island-session-v1";

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct IslandSession {
    pub token: String,
    pub nickname: String,
}

pub fn api_base() -> String {
    let Some(w) = web_sys::window() else {
        return "http://127.0.0.1:8787".to_string();
    };
    js_sys::Reflect::get(&w, &JsValue::from_str("__ISLAND_API__"))
        .ok()
        .and_then(|v| v.as_string())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "http://127.0.0.1:8787".to_string())
}

pub fn load_session() -> Option<IslandSession> {
    LocalStorage::get(SESSION_KEY).ok().filter(|s: &IslandSession| !s.token.is_empty())
}

pub fn save_session(s: &IslandSession) {
    let _ = LocalStorage::set(SESSION_KEY, s);
}

pub fn clear_session() {
    let _ = LocalStorage::delete(SESSION_KEY);
}

#[derive(Deserialize)]
pub struct ApiError {
    pub error: Option<String>,
}

#[derive(Deserialize)]
pub struct LeaderboardResp {
    pub rows: Vec<LeaderRow>,
}

#[derive(Clone, Deserialize, PartialEq)]
pub struct LeaderRow {
    pub nickname: String,
    pub points: i64,
}

#[derive(Deserialize)]
pub struct AnnouncementsResp {
    pub announcements: Vec<Announcement>,
}

#[derive(Clone, Deserialize, PartialEq)]
pub struct Announcement {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub created_at: String,
}

use wasm_bindgen::JsValue;

pub async fn register(nickname: &str, password: &str) -> Result<IslandSession, String> {
    let url = format!("{}/api/register", api_base());
    let resp = Request::post(&url)
        .header("Content-Type", "application/json")
        .body(serde_json::json!({ "nickname": nickname, "password": password }).to_string())
        .map_err(|e| e.to_string())?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.ok() {
        let err: ApiError = resp.json().await.unwrap_or(ApiError { error: None });
        return Err(err.error.unwrap_or_else(|| "註冊失敗".into()));
    }
    #[derive(Deserialize)]
    struct OkBody {
        token: String,
        nickname: String,
    }
    let body: OkBody = resp.json().await.map_err(|e| e.to_string())?;
    let s = IslandSession {
        token: body.token,
        nickname: body.nickname,
    };
    save_session(&s);
    Ok(s)
}

pub async fn login(nickname: &str, password: &str) -> Result<IslandSession, String> {
    let url = format!("{}/api/login", api_base());
    let resp = Request::post(&url)
        .header("Content-Type", "application/json")
        .body(serde_json::json!({ "nickname": nickname, "password": password }).to_string())
        .map_err(|e| e.to_string())?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.ok() {
        let err: ApiError = resp.json().await.unwrap_or(ApiError { error: None });
        return Err(err.error.unwrap_or_else(|| "登入失敗".into()));
    }
    #[derive(Deserialize)]
    struct OkBody {
        token: String,
        nickname: String,
    }
    let body: OkBody = resp.json().await.map_err(|e| e.to_string())?;
    let s = IslandSession {
        token: body.token,
        nickname: body.nickname,
    };
    save_session(&s);
    Ok(s)
}

pub async fn logout() {
    if let Some(s) = load_session() {
        let url = format!("{}/api/logout", api_base());
        let _ = Request::post(&url)
            .header("Authorization", &format!("Bearer {}", s.token))
            .send()
            .await;
    }
    clear_session();
}

pub async fn fetch_leaderboard(scope: &str) -> Result<Vec<LeaderRow>, String> {
    let url = format!(
        "{}/api/leaderboard?scope={}",
        api_base(),
        js_sys_encode_uri(scope)
    );
    let resp = Request::get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.ok() {
        return Err("讀取排行榜失敗".into());
    }
    let body: LeaderboardResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body.rows)
}

pub async fn fetch_announcements() -> Result<Vec<Announcement>, String> {
    let url = format!("{}/api/announcements", api_base());
    let resp = Request::get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.ok() {
        return Err("讀取公告失敗".into());
    }
    let body: AnnouncementsResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body.announcements)
}

pub async fn submit_score(subject: &str, unit_id: &str, points: u32) {
    let Some(s) = load_session() else {
        return;
    };
    let url = format!("{}/api/score", api_base());
    if let Ok(req) = Request::post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", &format!("Bearer {}", s.token))
        .body(
            serde_json::json!({
                "subject": subject,
                "unit_id": unit_id,
                "points": points
            })
            .to_string(),
        )
    {
        let _ = req.send().await;
    }
}

fn js_sys_encode_uri(s: &str) -> String {
    js_sys::encode_uri_component(s).into()
}

