# 注注的國語島（Rust / WebAssembly）

一年級注音國語小遊戲的 **Rust + Yew + Wasm** 正式前端版本，供 **Cloudflare Pages** 靜態部署。遊戲邏輯、畫面與狀態皆在 Rust 編譯的 WebAssembly 中執行；語音合成與音效透過瀏覽器 API 橋接。

同儲存庫的 [`../zhuyin-island/`](../zhuyin-island/) 為先前匯入的 React/TypeScript 參考實作，**保留不刪除**。

## 功能

- 字卡小屋、看圖找字、句子排排、記憶翻牌、故事問答
- 本機進度（星星、印章、音效開關）；無帳號、無後端
- 國字注音：`BpmfHuninn` 字型（IVS）與 ruby 後援；「一」「不」變調與 React 版相同資料來源

## 需求

- Rust stable（含 `wasm32-unknown-unknown`）
- [Trunk](https://trunkrs.dev/) 0.21+
- Node.js 22（僅匯出 `static/data/game.json` 時）

## 匯出教材 JSON（資料與 React 版同步）

在儲存庫根目錄：

```bash
node --experimental-strip-types zhuyin-island-wasm/tools/export_data.mjs
```

## 本機開發

```bash
cd zhuyin-island-wasm
rustup target add wasm32-unknown-unknown
trunk serve
```

開啟 <http://127.0.0.1:8080>（Trunk 預設埠）。

## Cloudflare Pages 建置

**輸出目錄：** `zhuyin-island-wasm/dist/`（Trunk 建置結果，可直接上傳）

```bash
cd zhuyin-island-wasm
rustup target add wasm32-unknown-unknown
node --experimental-strip-types ../zhuyin-island-wasm/tools/export_data.mjs   # 若資料有更新
trunk build --release
```

### Cloudflare Pages 建議設定

| 項目 | 值 |
|------|-----|
| Framework preset | None |
| Build command | `cd zhuyin-island-wasm && rustup target add wasm32-unknown-unknown && node --experimental-strip-types tools/export_data.mjs && trunk build --release` |
| Build output directory | `zhuyin-island-wasm/dist` |
| Root（可選） | 儲存庫根目錄 |

部署後網站根路徑即為遊戲首頁（`index.html` + Wasm），無需子路徑 `base`。

## 測試

```bash
cargo test
```

含注音變調（一／不）黃金句測試。

## 授權

字型與聲明檔位於 `static/fonts/`：`OFL.txt`、`NOTICE.txt`、`README.txt`。
