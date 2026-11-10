# v9.21e portrait E2E failures → v9.21f disposition

| Failure (v9.21e) | Real or harness? | v9.21f fix |
|------------------|------------------|------------|
| `390-touch-*` moved &lt;60px / stall while held | **Harness** (starts on runs that v9.21d treated as “open” because any non-water pixel walked — including trees). v9.21e strict mask ends runs early; stall tail is expected physics, not input bug. | Documented `e2e/WALK_HARNESS_STARTS.md`; portrait starts on paved spine overrides (`y≈1268`, `x≈860` vertical). |
| `390-clamp-up-5s: fit-label-chinese overlaps hero` | **Real** UI layout when hero climbs north near 國語學校. | Raised chinese phone-label nudge rise to 280px in `layout_phone_labels`. |
| Doors unreachable (BFS) after strict mask | **Real** gameplay — bridge/tree gaps broke the main loop. | `map_config.json` corridor overrides + `regen_walk_masks.py` 3-of-5 cell rule (center must be walkable); `walk_mask.mjs` loads overrides from JSON. |
| Landscape NE water walk (v9.21e) | **Real** collision. | Kept strict center sampling + no broad NE overrides; NE foot audit still passes (~y=738 from 1900,1050). |

Thresholds in `v920_walk_verify.mjs` (`stall >150ms`, `Δ≥60px`) unchanged.
