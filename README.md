# 國小課程

本儲存庫整理國小各科、各年級的互動教材，方便在本機開發、建置與延伸。

目前收錄：

| 目錄 | 說明 | 適用 |
|------|------|------|
| [zhuyin-island](./zhuyin-island/) | **注注的國語島** — 一年級注音國語小遊戲 | 國小一年級 |

## 注注的國語島（`zhuyin-island/`）

給國小一年級的注音國語小遊戲：字卡、看圖找字、句子排序、記憶翻牌與短故事等關卡；國字使用 [注音粉圓](https://github.com/ButTaiwan/bpmfvs)（BpmfHuninn）以異體選擇符顯示注音。

### 需求

- Node.js 22

### 安裝與執行

```bash
cd zhuyin-island
npm install
npm run dev
```

瀏覽器開啟 <http://localhost:4731>。

### 建置與檢查

```bash
cd zhuyin-island
npm run verify   # 檢查每個國字都有注音，以及「一」「不」變調
npm run lint
npm run build    # 產出 dist/
npm run preview  # 預覽打包結果（同埠 4731）
```

更完整的功能說明與玩法請見 [zhuyin-island/README.md](./zhuyin-island/README.md)。

## 素材授權

各教材目錄內附授權與聲明檔。注音島相關重點如下（詳見 `zhuyin-island/public/fonts/`）：

- **BpmfHuninn-Regular.woff2**：注音粉圓 v1.500 之 TTF 轉為 WOFF2，未改字形或字型名稱；[SIL Open Font License 1.1](http://scripts.sil.org/OFL)（`OFL.txt`）。
- **NOTICE.txt**：注音 IVS 規格之 [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) 聲明。
- **favicon.svg**：本教材自製圖示。
- 畫面中的插圖使用系統表情符號，未另附圖檔。

## 未來擴充

可依科目與年級新增同層級目錄（例如其他年級國語、數學等），並在本 README 表格中補充說明。
