use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::rc::Rc;

#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "kind")]
pub enum Picture {
    #[serde(rename = "emoji")]
    Emoji { emoji: String },
    #[serde(rename = "swatch")]
    Swatch { color: String },
    #[serde(rename = "digit")]
    Digit { digit: String },
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct QuizItem {
    pub id: String,
    pub picture: Picture,
    pub ask: String,
    pub answer: String,
    pub options: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct OrderItem {
    pub id: String,
    pub emoji: String,
    pub chunks: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct StoryQuestion {
    pub ask: String,
    pub answer: String,
    pub options: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct StoryItem {
    pub id: String,
    pub title: String,
    pub emoji: String,
    pub lines: Vec<String>,
    pub questions: Vec<StoryQuestion>,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct LessonCard {
    pub id: String,
    pub word: String,
    pub emoji: String,
    pub sentence: String,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct Theme {
    pub id: String,
    pub title: String,
    pub cards: Vec<LessonCard>,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct MemoryPair {
    pub id: String,
    pub word: String,
    pub emoji: String,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct MemoryDeck {
    pub id: String,
    pub title: String,
    pub pairs: Vec<MemoryPair>,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct Content {
    pub themes: Vec<Theme>,
    #[serde(rename = "quizItems")]
    pub quiz_items: Vec<QuizItem>,
    #[serde(rename = "orderItems")]
    pub order_items: Vec<OrderItem>,
    pub stories: Vec<StoryItem>,
    pub decks: Vec<MemoryDeck>,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct Meta {
    #[serde(rename = "cardTotal")]
    pub card_total: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
pub struct UiStrings {
    #[serde(flatten)]
    pub fields: HashMap<String, Value>,
}

impl UiStrings {
    pub fn text(&self, key: &str) -> String {
        self.fields
            .get(key)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default()
    }
}

#[derive(Clone, PartialEq)]
pub struct GameData {
    pub readings: HashMap<String, Vec<String>>,
    pub ui: UiStrings,
    pub content: Content,
    pub card_total: usize,
}

#[derive(Deserialize)]
struct RawBundle {
    readings: HashMap<String, Vec<String>>,
    ui: HashMap<String, Value>,
    content: Value,
    meta: Meta,
}

pub async fn load_game_data() -> Result<Rc<GameData>, String> {
    let resp = gloo_net::http::Request::get("/data/game.json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let raw: RawBundle = resp.json().await.map_err(|e| e.to_string())?;
    let content: Content = serde_json::from_value(raw.content).map_err(|e| e.to_string())?;
    Ok(Rc::new(GameData {
        readings: raw.readings,
        ui: UiStrings { fields: raw.ui },
        content,
        card_total: raw.meta.card_total,
    }))
}

pub fn collected_line(count: usize) -> String {
    format!("收集到的星星：{count}")
}

pub fn stamp_count(done: usize, total: usize) -> String {
    format!("印章：{done}／{total}")
}

pub fn ask_step(current: usize, total: usize) -> String {
    format!("第{current}題，共{total}題")
}

pub fn story_step(current: usize, total: usize) -> String {
    format!("第{current}個故事，共{total}個")
}

pub fn quiz_detail(first: usize, total: usize) -> String {
    format!("{total}題裡面，有{first}題一次就答對")
}

pub fn memory_detail(moves: usize) -> String {
    format!("這組卡片一共翻了{moves}次")
}

pub fn star_count(count: u8) -> String {
    format!("{count}顆星")
}
