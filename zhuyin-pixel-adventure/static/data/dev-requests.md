# 一年級題庫 v2　給開發者的顯示需求

此檔說明遊戲現在怎麼把 `image` 變成圖片、現有可用圖有哪些，以及新題庫多出來、**必須實作後題目才會顯示正確**的欄位。題庫 JSON 已先寫入這些欄位；若 Rust 端 `Grade1Question` 開了 `deny_unknown_fields`，請把下列欄位加成 `Option<...>`，否則 serde 預設會忽略未知欄位，題目仍能載入，只是畫面還是一張單圖。

請維持既有 schema（`Grade1BankFile` 6 欄、`Grade1Question` 原 20 欄、`Grade1Option` 的 id / text / zhuyin / image），qtype 也沿用現有值，不要改名，遊戲的題型膠囊才對得上：

- 數學：`count_image`、`compare_num`、`add_within_10`、`subtract_within_10`、`shape_time`
- 英文：`english_letter`、`english_color`、`english_number`、`english_vocab`、`english_phrase`

英文題的 `speech_en` 請整段拿去給瀏覽器 `en-US` 發音（例如 `"Thank you"`、`"Good morning"`），不要再截成 `"Thank"` / `"Good"`。

---

## 一、現在遊戲怎麼顯示圖片（已存在，不必改也能用）

1. 題目的 `image` 是 **中文圖名**（不是檔名）。
2. 到 `pixel-art/manifest.json` 查出檔名，再載入 `/pixel-art/<檔名>`。例如 `"一顆紅蘋果"` → `red-apple.png` → `/pixel-art/red-apple.png`。
3. `src/components/pixel_picture.rs` 目前一次只顯示 **一張** 圖，沒有把同一張圖重複排成一列，也沒有畫鐘面或幾何形狀。
4. 特殊圖名 `"三張選項圖"`（國語題用過）：題幹不放圖，改看每個選項的 `options[].image`。本批數學／英文題沒用到這個。
5. 現有圖幾乎都是「一個物件」。例外、**現在就可以拿來數數、不必新功能**的兩張：
   - `"三座連在一起的山"`（three-mountains.png）＝ 3 座山
   - `"一隻張開五指的手"`（open-hand.png）＝ 5 根手指
6. 沒有鐘面圖、沒有三角形圖、沒有純黑色物件（黑白乳牛是兩種顏色，不能當 Black）。

### 現有可用圖片清單（manifest 共 66 張）

- `一件藍色上衣` → `/pixel-art/blue-shirt.png`
- `一位微笑的媽媽` → `/pixel-art/smiling-mom.png`
- `一個圓圓的鼻子` → `/pixel-art/round-nose.png`
- `一個小朋友在跑步` → `/pixel-art/kid-running.png`
- `一個小朋友拿牙刷刷牙` → `/pixel-art/kid-brushing-teeth.png`
- `一個彎彎的月亮` → `/pixel-art/crescent-moon.png`
- `一個籃子` → `/pixel-art/basket.png`
- `一個紅太陽` → `/pixel-art/red-sun.png`
- `一個紅紅的太陽` → `/pixel-art/red-sun-bright.png`
- `一個紙箱子` → `/pixel-art/cardboard-box.png`
- `一個背帶書包` → `/pixel-art/backpack.png`
- `一個藍色杯子` → `/pixel-art/blue-cup.png`
- `一匹棕色小馬` → `/pixel-art/brown-pony.png`
- `一堆紅紅的營火` → `/pixel-art/campfire.png`
- `一塊方方的稻田` → `/pixel-art/rice-paddy.png`
- `一座綠色的山` → `/pixel-art/green-mountain.png`
- `一張小床` → `/pixel-art/small-bed.png`
- `一張張開的嘴巴` → `/pixel-art/open-mouth.png`
- `一張木頭桌子` → `/pixel-art/wooden-table.png`
- `一張白紙` → `/pixel-art/blank-paper.png`
- `一扇木門` → `/pixel-art/wooden-door.png`
- `一扇窗戶` → `/pixel-art/window.png`
- `一把打開的雨傘` → `/pixel-art/open-umbrella.png`
- `一把黃色雨傘` → `/pixel-art/yellow-umbrella.png`
- `一本打開的書` → `/pixel-art/open-book.png`
- `一朵下雨的雲` → `/pixel-art/rain-cloud.png`
- `一朵紅色的花` → `/pixel-art/red-flower.png`
- `一枝削好的鉛筆` → `/pixel-art/sharpened-pencil.png`
- `一根綠色竹子` → `/pixel-art/green-bamboo.png`
- `一條橘色小魚` → `/pixel-art/orange-fish.png`
- `一棵大樹` → `/pixel-art/big-tree.png`
- `一片綠皮紅肉的西瓜` → `/pixel-art/watermelon-slice.png`
- `一片綠色小草` → `/pixel-art/green-grass.png`
- `一片綠色葉子` → `/pixel-art/green-leaf.png`
- `一盞亮亮的檯燈` → `/pixel-art/desk-lamp.png`
- `一碗白飯` → `/pixel-art/bowl-of-rice.png`
- `一艘小帆船` → `/pixel-art/sailboat.png`
- `一輛紅色小汽車` → `/pixel-art/red-car.png`
- `一輛藍色汽車` → `/pixel-art/blue-car.png`
- `一輛載很多人的公車` → `/pixel-art/bus-with-people.png`
- `一間小木屋` → `/pixel-art/wooden-cabin.png`
- `一隻大耳朵` → `/pixel-art/big-ear.png`
- `一隻張開五指的手` → `/pixel-art/open-hand.png`
- `一隻彩色蝴蝶` → `/pixel-art/colorful-butterfly.png`
- `一隻彩色蝴蝶停在花上` → `/pixel-art/butterfly-on-flower.png`
- `一隻棕色小熊` → `/pixel-art/brown-bear.png`
- `一隻灰色小貓` → `/pixel-art/gray-kitten.png`
- `一隻白色兔子` → `/pixel-art/white-rabbit.png`
- `一隻白色大鵝` → `/pixel-art/white-goose.png`
- `一隻站在樹枝上的小鳥` → `/pixel-art/bird-on-branch.png`
- `一隻站著的小鳥` → `/pixel-art/standing-bird.png`
- `一隻綠色青蛙` → `/pixel-art/green-frog.png`
- `一隻黃色小狗` → `/pixel-art/yellow-puppy.png`
- `一隻黃色小雞` → `/pixel-art/yellow-chick.png`
- `一雙紅色布鞋` → `/pixel-art/red-cloth-shoes.png`
- `一頭灰色大象` → `/pixel-art/gray-elephant.png`
- `一頭黑白乳牛` → `/pixel-art/black-white-cow.png`
- `一顆包著糖紙的糖果` → `/pixel-art/wrapped-candy.png`
- `一顆白白的牙齒` → `/pixel-art/white-tooth.png`
- `一顆白色雞蛋` → `/pixel-art/white-egg.png`
- `一顆紅色皮球` → `/pixel-art/red-ball.png`
- `一顆紅蘋果` → `/pixel-art/red-apple.png`
- `一顆黃色星星` → `/pixel-art/yellow-star.png`
- `三座連在一起的山` → `/pixel-art/three-mountains.png`
- `夜空中一個彎彎的月亮` → `/pixel-art/night-crescent-moon.png`
- `雲下面在下雨` → `/pixel-art/raining-from-cloud.png`

---

## 二、需要新增的顯示能力

下列欄位請加在 `Grade1Question`（皆為可選）。沒實作之前，相關題目會「看得到題幹、但圖不對」（例如 2＋3 卻只出現 1 顆蘋果）。

### 1. `count`：把同一張圖重複顯示 N 次

- 型別：`count: number`（整數 1–10）
- 搭配既有 `image`（中文圖名），把該物件排成一列或兩列（建議 5 個一列，物件夠大，手機也看得清，不可縮小到難以點數）。
- 例：

```json
"image": "一顆黃色星星",
"count": 4
```

畫面應出現 **4 顆**黃色星星，供學生數。`count` 為 1 或省略時，維持現在的單圖即可。

本題庫需要 `count >= 2` 的題號：
G1-MATH-S1-U1-02(×2), G1-MATH-S1-U1-04(×4), G1-MATH-S1-U1-06(×6), G1-MATH-S1-U1-07(×7), G1-MATH-S1-U1-08(×8), G1-MATH-S1-U1-09(×9), G1-MATH-S1-U1-10(×10), G1-ENG-S1-U3-01(×2), G1-ENG-S1-U3-03(×4)

### 2. `add_groups`：加法分兩堆顯示

- 型別：`add_groups: [number, number]`
- 搭配 `image`。左邊（或上一排）顯示第一個數字那麼多個物件，中間可加一個「＋」，右邊（或下一排）顯示第二個數字那麼多個。不要只放 1 個物件。
- 例：

```json
"image": "一顆紅蘋果",
"add_groups": [2, 3]
```

畫面：2 顆蘋果 ＋ 3 顆蘋果。題幹是「2 加 3 等於幾？」。

本題庫全部 10 道加法題都有此欄：G1-MATH-S1-U3-01, G1-MATH-S1-U3-02, G1-MATH-S1-U3-03, G1-MATH-S1-U3-04, G1-MATH-S1-U3-05, G1-MATH-S1-U3-06, G1-MATH-S1-U3-07, G1-MATH-S1-U3-08, G1-MATH-S1-U3-09, G1-MATH-S1-U3-10

### 3. `subtract`：減法先排出來再拿走

- 型別：`subtract: {"from": number, "take": number}`
- 搭配 `image`。先排出 `from` 個物件，再把其中 `take` 個劃掉、變淡或移到旁邊，讓學生看見「還剩幾個」。
- 例：

```json
"image": "一顆紅色皮球",
"subtract": {"from": 7, "take": 2}
```

畫面：7 顆皮球，其中 2 顆被劃掉，還剩 5 顆。題幹是「7 減 2 還剩幾？」。

本題庫全部 10 道減法題都有此欄：G1-MATH-S1-U4-01, G1-MATH-S1-U4-02, G1-MATH-S1-U4-03, G1-MATH-S1-U4-04, G1-MATH-S1-U4-05, G1-MATH-S1-U4-06, G1-MATH-S1-U4-07, G1-MATH-S1-U4-08, G1-MATH-S1-U4-09, G1-MATH-S1-U4-10

### 4. `clock`：畫整點鐘面

- 型別：`clock: {"hour": number, "minute": number}`
- `hour` 為 1–12，整點題 `minute` 固定為 0。
- **請用程式畫鐘面**（圓盤、12 個刻度、短針指小時、長針指 12），不要再用檯燈或其他插圖充當時鐘。
- 題幹是「現在是幾點？」，不要在題幹再寫一次指針位置以免變成讀句子而不是讀鐘。
- `image` 為 `null`，請優先畫鐘面，不要顯示空白占位。
- 例：

```json
"image": null,
"clock": {"hour": 3, "minute": 0}
```

本題庫：G1-MATH-S1-U5-04（3 點）, G1-MATH-S1-U5-06（6 點）, G1-MATH-S1-U5-08（9 點）, G1-MATH-S1-U5-10（12 點）

### 5. `shape`：畫幾何形狀

- 型別：`shape: "triangle" | "circle" | "square" | "rectangle" | "star"`
- 現有圖庫沒有清晰的三角形。此題 `image` 為 `null`，請畫一個填色、邊線清楚、夠大的三角形。
- 例：

```json
"image": null,
"shape": "triangle"
```

本題庫：G1-MATH-S1-U5-09

（圓形／方形／星形／長方形題已改用現有圖：皮球、窗戶、星星、桌子、稻田，不必新圖。）

### 6. `color_swatch`：純色色塊

- 型別：`color_swatch: "black" | "red" | "blue" | "yellow" | "green" | "white" | "orange" | "brown"`
- 現有圖沒有「純黑」物件（乳牛是黑加白）。此題 `image` 為 `null`，請顯示一塊夠大的黑色色塊（建議圓角方塊，旁邊不要寫英文顏色字以免洩題）。
- 例：

```json
"image": null,
"color_swatch": "black"
```

本題庫：G1-ENG-S1-U2-08

其他顏色題都用現有圖（紅蘋果、藍車、黃星星、綠草、白兔、橘魚、棕熊、藍杯子、紅皮球），不必新圖。

---

## 三、建議的選配（不是本題庫過關條件）

- 家人目前只有「一位微笑的媽媽」。若要擴充 Dad / Grandma，請再畫對應像素圖並加入 manifest。
- 水果目前只有蘋果、西瓜。
- 若之後要數「混種物件」或「兩種東西加在一起」，再另訂欄位；本題庫加法兩堆用同一種物件。
- 顯示多個物件時請保持物件夠大，學習內容不要縮小。

---

## 四、現在不用新功能就能正確顯示的題

- 比大小 10 題：只有數字，無圖。
- 數數／英文數字裡，單物件圖或「3 座山／5 根手指」：G1-MATH-S1-U1-01, G1-MATH-S1-U1-03, G1-MATH-S1-U1-05, G1-ENG-S1-U3-02, G1-ENG-S1-U3-04, G1-ENG-S1-U3-06
- 字母大小寫配對、部分數字英文對譯、多數招呼語與看圖單字／顏色：只要既有單圖與聽發音即可。

