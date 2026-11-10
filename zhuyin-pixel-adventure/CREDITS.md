# 學習冒險島 — 素材與授權

## 原創（本專案程式生成）

- 像素角色點陣（小竹／小藍／小粉）與行走幀：`src/sprites.rs`
- 地圖瓦片與建築繪製：`src/tile_art.rs`、`src/world.rs`
- 國字右側直排注音 UI：`src/components/bpmf_aside.rs`（非嵌圖文字）

## 教材與字型（沿用注注的國語島）

- `data/game.json`、注音讀音資料：與 `zhuyin-island-wasm` 相同
- `fonts/BpmfHuninn-Regular.woff2` 等：SIL OFL 1.1（見 `fonts/OFL.txt`、`NOTICE.txt`）

## 參考（未使用其生成物或付費服務）

- [PixelLab](https://www.pixellab.ai/) — 僅作像素 RPG 風格參考
- [WaveSpeed 遊戲素材庫](https://wavespeed.ai/zh-TW/free-tools/ai-game-asset-gallery) — 僅作配色參考
- [MindVideo 音效](https://www.mindvideo.ai/zh-TW/ai-sound-effects-generator/) — 未未採用；遊戲音效為 Web Audio 程式合成
