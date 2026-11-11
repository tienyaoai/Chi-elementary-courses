use crate::map_config::{character_by_id, character_display_name, config};
use crate::progress::stored_character_id;

pub fn find_character_name(id: &str) -> String {
    character_display_name(id)
}

pub fn find_character(id: &str) -> crate::map_config::CharacterEntry {
    character_by_id(id)
        .or_else(|| stored_character_id().and_then(|cid| character_by_id(&cid)))
        .unwrap_or_else(|| config().characters[0].clone())
}
