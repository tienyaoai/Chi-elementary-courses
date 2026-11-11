# Walk harness start positions (v9.21f)

`v920_walk_verify.mjs` uses fixed starts so a **3s** hold at `WALK_SPEED_PX_PER_SEC` (285) can move ≥60px **and** avoid >150ms stalls while the key stays down. After v9.21e’s strict art masks, old v9.21d starts often sat on short tree-blocked runs (v9.21d treated non-water as walkable, which falsely extended those runs).

## Landscape (1280 / 1920 fit)

| Direction | Start `[x,y]` | Runway (steps×8px) | Notes |
|-----------|---------------|-------------------|--------|
| right | 1100, 1020 | ~80 | Main southern road eastbound |
| left | 1740, 1020 | ~80 | Road westbound toward math wing |
| up | 1140, 1380 | ~85 | Treasure spine (y must stay ≤ map height 1440) |
| down | 1140, 640 | ~90 | Treasure spine southbound (≥3s before south cap) |

**Landscape E–W:** `right` 720,1020 · `left` 1780,1020 on southern ring override (`y≈1020`).

**Door bubble latch (1280/1920 fit):** away probe at `[950,1020]` — masked southern ring (invalid coords snap to spawn and falsely show a door bubble); return at `[790,1040]` 國語學校 door foot.

Stall tails after a **real wall** are avoided by choosing mask+BFS-valid corridors, not by changing stall thresholds.

## Portrait (390 touch)

| Direction | Start `[x,y]` | Notes |
|-----------|---------------|--------|
| right | 180, 1260 | East along `walk_overrides` main spine `y≈1268` |
| left | 820, 1260 | West along same spine |
| up | 860, 1400 | Vertical override at dock / east avenue |
| down | 860, 680 | Same avenue southbound |

Horizontal spine overrides mirror paved art (bridge + loop); they do not open NE landscape tree/water cheats.
