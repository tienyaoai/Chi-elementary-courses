use std::collections::HashMap;
use zhuyin_island_wasm::bpmf::{reading_of, resolve, Segment};

/// 將注音拆成直排 glyph（含聲調符號黏在適當音節上）。
pub fn vertical_glyphs(bpmf: &str) -> Vec<char> {
    let mut glyphs = Vec::new();
    let mut chars = bpmf.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '˙' {
            if let Some(last) = glyphs.last_mut() {
                *last = ch;
            } else {
                glyphs.push(ch);
            }
            continue;
        }
        if matches!(ch, 'ˊ' | 'ˇ' | 'ˋ') {
            if let Some(last) = glyphs.last_mut() {
                // 聲調標在最後一個注音字元後（直排顯示於右欄）
                glyphs.push(ch);
            }
            continue;
        }
        glyphs.push(ch);
    }
    glyphs
}

pub struct AsideUnit {
    pub han: String,
    pub bpmf: Option<String>,
}

pub fn aside_units(readings: &HashMap<String, Vec<String>>, input: &str) -> Vec<AsideUnit> {
    resolve(readings, input)
        .into_iter()
        .map(|part| match part {
            Segment::Text(t) => AsideUnit {
                han: t,
                bpmf: None,
            },
            Segment::Han { ch, alt } => AsideUnit {
                han: ch.to_string(),
                bpmf: reading_of(readings, ch, alt),
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn vertical_tone_marks() {
        assert_eq!(vertical_glyphs("ㄓㄨˋ"), vec!['ㄓ', 'ㄨ', 'ˋ']);
        assert_eq!(vertical_glyphs("˙ㄅㄚ"), vec!['˙', 'ㄅ', 'ㄚ']);
    }

    #[test]
    fn sandhi_not_tone() {
        let readings: HashMap<String, Vec<String>> =
            serde_json::from_str(include_str!("../../zhuyin-island-wasm/static/data/game.json"))
                .ok()
                .and_then(|v: serde_json::Value| serde_json::from_value(v["readings"].clone()).ok())
                .unwrap_or_default();
        let units = aside_units(&readings, "不是");
        assert!(units.len() >= 2);
        assert_eq!(units[0].han, "不");
        assert_eq!(units[0].bpmf.as_deref(), Some("ㄅㄨˊ"));
    }
}
