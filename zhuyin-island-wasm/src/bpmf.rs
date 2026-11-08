use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Segment {
    Han { ch: char, alt: usize },
    Text(String),
}

const VARIATION_BASE: u32 = 0xe01e0;

pub fn parse_markup(input: &str) -> Vec<Segment> {
    let mut parts = Vec::new();
    let mut chars = input.chars().peekable();
    let mut text_buf = String::new();
    while let Some(ch) = chars.next() {
        if is_han(ch) {
            if !text_buf.is_empty() {
                parts.push(Segment::Text(std::mem::take(&mut text_buf)));
            }
            let mut alt = 0usize;
            if matches!(chars.peek(), Some('{')) {
                chars.next();
                let mut digits = String::new();
                while let Some(&d) = chars.peek() {
                    if d == '}' {
                        chars.next();
                        break;
                    }
                    if d.is_ascii_digit() {
                        digits.push(d);
                        chars.next();
                    } else {
                        break;
                    }
                }
                alt = digits.parse().unwrap_or(0);
            }
            parts.push(Segment::Han { ch, alt });
        } else {
            text_buf.push(ch);
        }
    }
    if !text_buf.is_empty() {
        parts.push(Segment::Text(text_buf));
    }
    parts
}

fn is_han(ch: char) -> bool {
    matches!(ch, '\u{4E00}'..='\u{9FFF}')
        || matches!(ch, '\u{3400}'..='\u{4DBF}')
        || matches!(ch, '\u{20000}'..='\u{2A6DF}')
}

pub fn tone_of(bpmf: &str) -> u8 {
    if bpmf.starts_with('˙') {
        return 5;
    }
    if bpmf.ends_with('ˊ') {
        return 2;
    }
    if bpmf.ends_with('ˇ') {
        return 3;
    }
    if bpmf.ends_with('ˋ') {
        return 4;
    }
    1
}

pub fn reading_of(readings: &HashMap<String, Vec<String>>, character: char, alt: usize) -> Option<String> {
    let key = character.to_string();
    readings.get(&key).and_then(|list| list.get(alt).cloned())
}

fn following_han(parts: &[Segment], index: usize) -> Option<(char, usize, bool)> {
    let mut blocked = false;
    for part in parts.iter().skip(index + 1) {
        match part {
            Segment::Text(text) => {
                if text.chars().any(|c| !c.is_whitespace()) {
                    blocked = true;
                }
            }
            Segment::Han { ch, alt } => return Some((*ch, *alt, blocked)),
        }
    }
    None
}

pub fn resolve(readings: &HashMap<String, Vec<String>>, input: &str) -> Vec<Segment> {
    let mut parts = parse_markup(input);
    let len = parts.len();
    let mut updates: Vec<Option<usize>> = vec![None; len];
    for index in 0..len {
        let Segment::Han { ch, alt } = parts[index] else {
            continue;
        };
        if ch != '一' && ch != '不' {
            continue;
        }
        let Some((next_ch, next_alt, blocked)) = following_han(&parts, index) else {
            updates[index] = Some(0);
            continue;
        };
        if blocked {
            updates[index] = Some(0);
            continue;
        }
        let tone = tone_of(&reading_of(readings, next_ch, next_alt).unwrap_or_default());
        let new_alt = if ch == '一' {
            if tone == 4 {
                1
            } else if (1..=3).contains(&tone) {
                2
            } else {
                0
            }
        } else if tone == 4 {
            1
        } else {
            0
        };
        if new_alt != alt {
            updates[index] = Some(new_alt);
        }
    }
    for (index, alt) in updates.into_iter().enumerate() {
        if let (Some(alt), Segment::Han { alt: ref mut slot, .. }) = (alt, &mut parts[index]) {
            *slot = alt;
        }
    }
    parts
}

pub fn to_ivs(parts: &[Segment]) -> String {
    let mut out = String::new();
    for part in parts {
        match part {
            Segment::Text(t) => out.push_str(t),
            Segment::Han { ch, alt } => {
                out.push(*ch);
                if *alt > 0 {
                    if let Some(ivs) = char::from_u32(VARIATION_BASE + *alt as u32) {
                        out.push(ivs);
                    }
                }
            }
        }
    }
    out
}

pub fn plain(readings: &HashMap<String, Vec<String>>, input: &str) -> String {
    resolve(readings, input)
        .into_iter()
        .map(|p| match p {
            Segment::Text(t) => t,
            Segment::Han { ch, .. } => ch.to_string(),
        })
        .collect()
}

pub fn ruby_fallback(readings: &HashMap<String, Vec<String>>, input: &str) -> Vec<(String, Option<String>)> {
    resolve(readings, input)
        .into_iter()
        .map(|p| match p {
            Segment::Text(t) => (t, None),
            Segment::Han { ch, alt } => (ch.to_string(), reading_of(readings, ch, alt)),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn readings() -> HashMap<String, Vec<String>> {
        serde_json::from_str(include_str!("../static/data/game.json"))
            .map(|v: serde_json::Value| {
                serde_json::from_value(v["readings"].clone()).unwrap_or_default()
            })
            .unwrap_or_default()
    }

    fn transcribe(readings: &HashMap<String, Vec<String>>, input: &str) -> String {
        resolve(readings, input)
            .into_iter()
            .map(|p| match p {
                Segment::Text(t) => t,
                Segment::Han { ch, alt } => {
                    format!(
                        "{}({})",
                        ch,
                        reading_of(readings, ch, alt).unwrap_or_else(|| "?".into())
                    )
                }
            })
            .collect()
    }

    #[test]
    fn golden_tone_sandhi() {
        let r = readings();
        let pairs = [
            ("一個", "一(ㄧˊ)個(ㄍㄜˋ)"),
            ("一隻", "一(ㄧˋ)隻(ㄓ)"),
            ("不是", "不(ㄅㄨˊ)是(ㄕˋ)"),
            ("不會", "不(ㄅㄨˊ)會(ㄏㄨㄟˋ)"),
            ("睡覺{1}", "睡(ㄕㄨㄟˋ)覺(ㄐㄧㄠˋ)"),
            ("爸爸{1}", "爸(ㄅㄚˋ)爸(˙ㄅㄚ)"),
        ];
        for (input, want) in pairs {
            assert_eq!(transcribe(&r, input), want, "input={input}");
        }
    }
}
