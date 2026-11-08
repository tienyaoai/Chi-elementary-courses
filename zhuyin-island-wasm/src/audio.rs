use crate::progress::Progress;
use gloo::storage::{LocalStorage, Storage};
use wasm_bindgen::JsCast;
use web_sys::{AudioContext, GainNode, OscillatorNode};

fn ctx() -> Option<AudioContext> {
    let progress: Progress = LocalStorage::get(crate::progress::STORAGE_KEY).unwrap_or_default();
    if !progress.sound {
        return None;
    }
    let ctx = AudioContext::new().ok()?;
    let _ = ctx.resume();
    Some(ctx)
}

fn tone(ctx: &AudioContext, frequency: f32, when: f64, duration: f64, gain: f64) {
    let osc: OscillatorNode = ctx.create_oscillator().unwrap();
    osc.set_type(web_sys::OscillatorType::Triangle);
    osc.frequency().set_value(frequency);
    let amp: GainNode = ctx.create_gain().unwrap();
    amp.gain()
        .set_value_at_time(0.0001, when)
        .unwrap();
    amp.gain()
        .exponential_ramp_to_value_at_time(gain as f32, when + 0.02)
        .unwrap();
    amp.gain()
        .exponential_ramp_to_value_at_time(0.0001_f32, when + duration)
        .unwrap();
    osc.connect_with_audio_node(&amp).unwrap();
    amp.connect_with_audio_node(&ctx.destination()).unwrap();
    osc.start_with_when(when).unwrap();
    osc.stop_with_when(when + duration + 0.02).unwrap();
}

pub fn play_correct() {
    let Some(ctx) = ctx() else { return };
    let now = ctx.current_time();
    tone(&ctx, 523.0, now, 0.12, 0.06);
    tone(&ctx, 659.0, now + 0.09, 0.12, 0.06);
    tone(&ctx, 784.0, now + 0.18, 0.22, 0.07);
}

pub fn play_wrong() {
    let Some(ctx) = ctx() else { return };
    let now = ctx.current_time();
    tone(&ctx, 392.0, now, 0.12, 0.04);
    tone(&ctx, 330.0, now + 0.1, 0.16, 0.04);
}

pub fn play_match() {
    let Some(ctx) = ctx() else { return };
    let now = ctx.current_time();
    tone(&ctx, 784.0, now, 0.1, 0.05);
    tone(&ctx, 988.0, now + 0.08, 0.16, 0.05);
}

pub fn play_win() {
    let Some(ctx) = ctx() else { return };
    let now = ctx.current_time();
    for (i, f) in [523.0, 659.0, 784.0, 1046.0].iter().enumerate() {
        tone(&ctx, *f, now + i as f64 * 0.12, 0.2, 0.06);
    }
}
