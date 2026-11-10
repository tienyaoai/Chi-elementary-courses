use crate::map_config::{character_by_id, character_display_name};

pub fn find_character_name(id: &str) -> String {
    character_display_name(id)
}

pub fn find_character(id: &str) -> crate::map_config::CharacterEntry {
    character_by_id(id).unwrap_or_else(|| {
        crate::map_config::config().characters[0].clone()
    })
}
