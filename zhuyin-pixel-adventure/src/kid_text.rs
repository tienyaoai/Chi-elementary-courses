//! 所有給小朋友看的固定中文文案（測試用：每字須有注音）。
use crate::map_config;
use crate::world::GateLabel;
use crate::world::Portal;

pub fn kid_facing_strings() -> Vec<String> {
    let mut list = vec![
        "學習冒險島".to_string(),
        "選一位冒險夥伴".to_string(),
        "出發".to_string(),
        "看收藏".to_string(),
        "關閉音效".to_string(),
        "開啟音效".to_string(),
        "換角色".to_string(),
        "載入中…".to_string(),
        "地圖載入中…".to_string(),
        "點地圖移動，或用方向鍵走到建築前".to_string(),
        "這個科目即將開放".to_string(),
        "這個地方還在蓋，稍後再來".to_string(),
        "回地圖".to_string(),
        "回選關".to_string(),
        "國語小島".to_string(),
        "選一個小島，從簡單題開始挑戰。".to_string(),
        "我的收藏".to_string(),
        "返回".to_string(),
        "進入".to_string(),
        "即將開放".to_string(),
        "獲得獎勵".to_string(),
        "再想一想。".to_string(),
        "英語即將開放".to_string(),
        "數學即將開放".to_string(),
    ];
    for ch in &map_config::config().characters {
        list.push(ch.short.clone());
    }
    for p in [
        Portal::Chinese,
        Portal::English,
        Portal::Math,
        Portal::Treasure,
    ] {
        list.push(GateLabel::name(p).to_string());
        list.push(GateLabel::hint(p).to_string());
        list.push(GateLabel::enter_label(p).to_string());
    }
    list
}

pub fn assert_kid_copies_have_zhuyin(
    readings: &std::collections::HashMap<String, Vec<String>>,
) -> Result<(), Vec<String>> {
    use crate::bpmf_aside::aside_units;
    let mut errors = Vec::new();
    for text in kid_facing_strings() {
        for unit in aside_units(readings, &text) {
            if unit.han.chars().all(|c| !is_han(c)) {
                continue;
            }
            if unit.bpmf.is_none() {
                errors.push(format!("「{text}」缺注音字：{}", unit.han));
            }
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn is_han(ch: char) -> bool {
    matches!(ch, '\u{4E00}'..='\u{9FFF}')
        || matches!(ch, '\u{3400}'..='\u{4DBF}')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_readings() -> std::collections::HashMap<String, Vec<String>> {
        let raw = include_str!("../../zhuyin-island-wasm/static/data/game.json");
        let v: serde_json::Value = serde_json::from_str(raw).expect("game.json");
        serde_json::from_value(v["readings"].clone()).expect("readings")
    }

    #[test]
    fn every_kid_string_han_has_zhuyin() {
        let readings = load_readings();
        match assert_kid_copies_have_zhuyin(&readings) {
            Ok(()) => {}
            Err(errs) => panic!("missing zhuyin:\n{}", errs.join("\n")),
        }
    }
}
