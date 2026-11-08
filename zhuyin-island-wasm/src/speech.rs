use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{SpeechSynthesisUtterance, SpeechSynthesisVoice, Window};

pub enum SpeakResult {
    Ok,
    Missing,
}

fn voice_at(voices: &js_sys::Array, index: u32) -> Option<SpeechSynthesisVoice> {
    voices
        .get(index)
        .dyn_into::<SpeechSynthesisVoice>()
        .ok()
}

pub async fn speak(text: &str) -> SpeakResult {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return SpeakResult::Missing;
    }
    let Some(win) = web_sys::window() else {
        return SpeakResult::Missing;
    };
    let speech = win.speech_synthesis().unwrap();
    let voices = speech.get_voices();
    let has_zh = (0..voices.length())
        .filter_map(|i| voice_at(&voices, i))
        .any(|v| {
            let lang = v.lang().to_lowercase();
            lang.starts_with("zh-tw") || lang.starts_with("zh")
        });
    if voices.length() > 0 && !has_zh {
        return SpeakResult::Missing;
    }
    let utter = SpeechSynthesisUtterance::new().unwrap();
    utter.set_text(trimmed);
    utter.set_lang("zh-TW");
    utter.set_rate(0.82);
    if let Some(voice) = (0..voices.length())
        .filter_map(|i| voice_at(&voices, i))
        .find(|v| {
            let lang = v.lang().to_lowercase();
            lang.replace('_', "-").starts_with("zh-tw") || lang.starts_with("zh")
        })
    {
        utter.set_voice(Some(&voice));
    }
    let promise = js_sys::Promise::new(&mut |resolve, reject| {
        let resolve = resolve.clone();
        let reject = reject.clone();
        let on_end = Closure::wrap(Box::new(move || {
            let _ = resolve.call1(&resolve, &wasm_bindgen::JsValue::TRUE);
        }) as Box<dyn FnMut()>);
        let on_err = Closure::wrap(Box::new(move || {
            let _ = reject.call1(&reject, &wasm_bindgen::JsValue::FALSE);
        }) as Box<dyn FnMut()>);
        utter.set_onend(Some(on_end.as_ref().unchecked_ref()));
        utter.set_onerror(Some(on_err.as_ref().unchecked_ref()));
        on_end.forget();
        on_err.forget();
        speech.cancel();
        speech.speak(&utter);
    });
    match JsFuture::from(promise).await {
        Ok(_) => SpeakResult::Ok,
        Err(_) => SpeakResult::Missing,
    }
}

pub fn speak_fire_and_forget(text: String) {
    wasm_bindgen_futures::spawn_local(async move {
        let _ = speak(&text).await;
    });
}
