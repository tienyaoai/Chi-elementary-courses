# v9.21g-hotfix: keyboard auto-repeat walk stutter

## Root cause

Window `keydown` for arrow keys always ran `on_prime()` (opens/resumes a new `AudioContext` per call), `on_clear()` (click-to-walk path cancel), and `held.set_dir(..., true)` even when `event.repeat === true`.

macOS/Windows auto-repeat delivers those keydowns every ~30–50ms while the physical key is held. That spams audio priming on the main thread and perturbs walk/input state synchronously with the RAF mover, so movement looks stepped (“卡”) and the sprite often stays on walk column 0.

`Enter` door handling already ignored `e.repeat()`; arrows did not.

## Fix

In `map_input.rs`, after `preventDefault` on arrows, return early when `e.repeat()` is true so movement and leg animation advance only from the RAF loop + first keydown.

## Verification

`e2e/autorepeat_walk.mjs`: one `keyboard.down`, synthetic `keydown` with `repeat: true` every 33ms for 3s, rAF samples of position + `data-walk-col`. All four directions, tap-release, and Right+Up together.
