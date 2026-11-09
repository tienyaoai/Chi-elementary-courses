use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ZhuyinGlyph {
    pub char: String,
    pub zhuyin: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Grade1Option {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub zhuyin: Option<String>,
    #[serde(default)]
    pub image: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Grade1Question {
    pub id: String,
    pub grade: u8,
    pub semester: String,
    pub unit: u8,
    pub unit_title: String,
    pub unit_title_zhuyin: Vec<ZhuyinGlyph>,
    pub unit_subtitle_teacher: String,
    pub qtype: String,
    pub difficulty: u8,
    pub prompt: String,
    pub prompt_zhuyin: Vec<ZhuyinGlyph>,
    #[serde(default)]
    pub image: Option<String>,
    pub options: Vec<Grade1Option>,
    pub answer: String,
    pub explain: String,
    #[serde(default)]
    pub target_zhuyin: String,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub license: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Grade1BankFile {
    pub title: String,
    pub version: String,
    pub grade: u8,
    pub subject: String,
    #[serde(default)]
    pub notes: Vec<String>,
    pub questions: Vec<Grade1Question>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct UnitKey {
    pub semester: String,
    pub unit: u8,
}

impl UnitKey {
    pub fn level_id(&self) -> String {
        let sem = if self.semester == "上學期" { "S1" } else { "S2" };
        format!("G1-{sem}-U{}", self.unit)
    }

    pub fn reward_id(&self) -> String {
        format!("star-{}", self.level_id())
    }

    pub fn display_order(&self) -> (u8, u8) {
        let sem = if self.semester == "上學期" { 0 } else { 1 };
        (sem, self.unit)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnitPack {
    pub key: UnitKey,
    pub title: String,
    pub title_zhuyin: Vec<ZhuyinGlyph>,
    pub teacher_subtitle: String,
    pub questions: Vec<Grade1Question>,
}

#[derive(Clone, PartialEq)]
pub struct Grade1Bank {
    pub file: Grade1BankFile,
    pub units: Vec<UnitPack>,
    pub by_id: HashMap<String, Grade1Question>,
}

impl Grade1Bank {
    pub fn from_embedded() -> Self {
        let raw = include_str!("../static/data/grade1-chinese.json");
        Self::from_json(raw).expect("embedded grade1 bank json")
    }

    pub fn from_json(raw: &str) -> Result<Self, serde_json::Error> {
        let file: Grade1BankFile = serde_json::from_str(raw)?;
        let mut by_id = HashMap::new();
        let mut units_map: BTreeMap<UnitKey, UnitPack> = BTreeMap::new();
        for q in &file.questions {
            by_id.insert(q.id.clone(), q.clone());
            let key = UnitKey {
                semester: q.semester.clone(),
                unit: q.unit,
            };
            let entry = units_map.entry(key.clone()).or_insert_with(|| UnitPack {
                key: key.clone(),
                title: q.unit_title.clone(),
                title_zhuyin: q.unit_title_zhuyin.clone(),
                teacher_subtitle: q.unit_subtitle_teacher.clone(),
                questions: Vec::new(),
            });
            entry.questions.push(q.clone());
        }
        let mut units: Vec<UnitPack> = units_map.into_values().collect();
        for u in &mut units {
            u.questions.sort_by_key(|q| (q.difficulty, q.id.clone()));
        }
        units.sort_by_key(|u| u.key.display_order());
        Ok(Self { file, units, by_id })
    }

    pub fn unit_by_id(&self, level_id: &str) -> Option<&UnitPack> {
        self.units.iter().find(|u| u.key.level_id() == level_id)
    }

    pub fn all_image_descriptions(&self) -> Vec<String> {
        let mut set = std::collections::HashSet::new();
        for q in &self.file.questions {
            if let Some(img) = &q.image {
                if !img.trim().is_empty() {
                    set.insert(img.clone());
                }
            }
            for o in &q.options {
                if let Some(img) = &o.image {
                    if !img.trim().is_empty() {
                        set.insert(img.clone());
                    }
                }
            }
        }
        let mut v: Vec<_> = set.into_iter().collect();
        v.sort();
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel_art_images::art_supported;

    #[test]
    fn bank_has_110_questions_and_11_units() {
        let bank = Grade1Bank::from_embedded();
        assert_eq!(bank.file.questions.len(), 110);
        assert_eq!(bank.units.len(), 11);
        for u in &bank.units {
            assert_eq!(u.questions.len(), 10, "{}", u.key.level_id());
        }
    }

    #[test]
    fn each_question_valid_options_and_answer() {
        let bank = Grade1Bank::from_embedded();
        for q in &bank.file.questions {
            assert_eq!(q.options.len(), 3, "{}", q.id);
            assert!(["a", "b", "c"].contains(&q.answer.as_str()), "{}", q.id);
            assert!(q.options.iter().any(|o| o.id == q.answer), "{}", q.id);
        }
    }

    #[test]
    fn all_images_have_pixel_art() {
        let bank = Grade1Bank::from_embedded();
        for desc in bank.all_image_descriptions() {
            assert!(art_supported(&desc), "missing art for: {desc}");
        }
    }

    #[test]
    fn qtypes_coverage() {
        let bank = Grade1Bank::from_embedded();
        let mut kinds = std::collections::HashSet::new();
        for q in &bank.file.questions {
            kinds.insert(q.qtype.as_str());
        }
        for k in [
            "choose_zhuyin",
            "choose_char",
            "choose_word",
            "match_image",
            "tone",
            "fill",
        ] {
            assert!(kinds.contains(k), "missing qtype {k}");
        }
    }
}
