//! English TTS via browser speechSynthesis (hidden when unavailable).

pub fn speech_supported() -> bool {
    web_sys::window().is_some()
}

pub fn speak_english(text: &str) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Ok(synth) = window.speech_synthesis() else {
        return;
    };
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    if let Ok(utt) = web_sys::SpeechSynthesisUtterance::new_with_text(trimmed) {
        utt.set_lang("en-US");
        let _ = synth.speak(&utt);
    }
}
