# 學習冒險島（Rust / WebAssembly）

國小低年級 **像素風學習冒險**：選角色、在地圖上走動、進入科目關卡、通關收集獎勵。首版開放 **國語**（看圖找字＋句子排排）；**英語／數學** 入口顯示「即將開放」。

同儲存庫的 [`zhuyin-island-wasm/`](../zhuyin-island-wasm/) 為上一版 **「注注的國語島」** 參考／經典介面，部署與歷史不變，本專案為獨立靜態站入口。

## 注音顯示

國字 **右側直排注音**（程式排版＋變調邏輯），不依賴 IVS 單一路徑。教材資料與 [`zhuyin-island-wasm`](../zhuyin-island-wasm/) 共用 `game.json`。

## 素材授權

- 像素角色：本專案 `src/sprites.rs` 程式化原創點陣，非既有遊戲角色抄襲。
- 注音教材與字型檔：見 `static/fonts/`（自 `zhuyin-island-wasm` 複製，SIL OFL 1.1）。

## 本機開發

```bash
cd zhuyin-pixel-adventure
rustup target add wasm32-unknown-unknown
trunk serve
```

預設 <http://127.0.0.1:8090>。

## 建置（Cloudflare 靜態站根目錄）

```bash
trunk build --release
# 輸出：zhuyin-pixel-adventure/dist/
```

部署 ZIP 請解壓 **dist 內容** 為網站根（`index.html` 在根目錄）。

## Roadmap（未實作）

- 帳號登入、記名、排行榜
- 英語／數學關卡與多年級單元

本地進度僅存 `localStorage`（`zhuzhu-pixel-adventure-v1`），無後端、無兒童姓名蒐集。
