# FPGA 平台升級提案：由 Lattice MachXO3 遷移至 AMD Spartan-7 / Artix-7

**文件性質：** 主管決策用技術提案  
**日期：** 2025-11-18（台北時間）  
**建議決策：** 核准啟動 FPGA 平台切換與概念驗證（PoC）  
**備註：** 文中「XO3-9600C」若為內部料號，技術上對應 Lattice MachXO3 家族最高密度級距（公開型號 MachXO3L/LF-**9400**，約 9.4K LUT4）。若實際顆粒不同，請於附錄 A 填入正確規格。

---

## 1. 執行摘要

現有產品線採用 **Lattice MachXO3** 作為橋接 / 介面控制 FPGA，在歷史設計中具備 **Instant-on、小封裝、低功耗、高 I/O 密度** 等優勢。然而**新一代功能規格**在資源與架構上已超出 MachXO3 家族可擴充上限，繼續堆疊邏輯將導致：

- 時序餘裕不足、時脈樹過度複雜  
- 缺乏（或嚴重不足）**硬體 DSP** 與大容量 Block RAM，影響影像/訊號處理與緩衝  
- 無法在單一顆料滿足 **PCIe / 高速 SerDes / 更高 DDR 頻寬**（若新設計需要）  
- 專案風險轉嫁為「功能裁切」或「雙 FPGA / 外掛 ASSP」，反而提高系統成本與複雜度  

**建議：** 將運算與介面主平台升級至 **AMD Xilinx 7 系列**，依介面需求在 **Spartan-7（成本與 I/O 優先）** 與 **Artix-7（SerDes / 頻寬優先）** 間選型；並以 **1 個季度內可完成的 PoC** 驗證資源、時序與供應鏈，再進入量產改版。

---

## 2. 問題陳述：為何現有 XO3 已無法承載新設計

### 2.1 MachXO3 家族硬體天花板（公開資料）

| 項目 | MachXO3L/LF-9400（家族最大公開密度） | 對新設計的影響 |
|------|--------------------------------------|----------------|
| 邏輯 | 約 **9,400 LUT4** | 新功能模組疊加後利用率 >85%，時序收斂困難 |
| Block RAM | **432 kbit** EBR + 73 kbit 分散式 RAM | 線路緩衝、影像行緩衝、封包 FIFO 不足 |
| **DSP** | **無專用 DSP 區塊** | FIR/FFT/色彩矩陣等須用 LUT 實作，效能與功耗劣化 |
| SerDes | 無原生 GTP；多為 I/O 模擬 MIPI 等 | 若需 PCIe Gen2、SGMII、原生高速 SERDES 不適用 |
| 處理器 | 無內建硬核 CPU | 複雜協定須全邏輯或外掛 MCU |
| 優勢（仍應肯定） | Instant-on、非揮發設定、高 I/O 比 | **適合純橋接/小板**；不適合運算成長路徑 |

（資料來源：Lattice MachXO3 Family Data Sheet DS1047、產品選型表。）

### 2.2 新設計典型資源壓力（請各專案負責人勾選／填入實測）

| 需求類別 | 說明 | 在 XO3 上的狀況 |
|----------|------|-----------------|
| 邏輯成長 | 【填入：目前估算 LUT + 成長率】 | 已達或接近密度上限 |
| 記憶體 | 【填入：FIFO/Line buffer 所需 kbit】 | EBR 不足，被迫用分散 RAM 拉高時序風險 |
| 訊號處理 | 【填入：MAC 數量 / 資料率】 | 無 DSP48，面積與 Fmax 雙輸 |
| 介面 | 【填入：MIPI / DDR / PCIe / Ethernet】 | 高速協定裕度不足或需外掛 |
| 軟體 | 【填入：是否需軟核 / 驅動堆疊】 | Vivado + MicroBlaze 生態較完整 |

---

## 3. 目標平台：AMD Spartan-7 與 Artix-7

兩者皆為 **28 nm**，工具鏈 **Vivado / Vitis**，IP 與第三方生態成熟，便於團隊建立可複用平台。

### 3.1 規格對照（與 MachXO3-9400 對位）

| 項目 | MachXO3-9400 | Spartan-7 建議候選（例：XC7S50 / XC7S75） | Artix-7 建議候選（例：XC7A35T / XC7A50T） |
|------|--------------|-------------------------------------------|-------------------------------------------|
| 邏輯規模 | ~9.4K LUT4 | **52K～76K Logic Cells** | **33K～52K Logic Cells** |
| Block RAM | 432 kbit | **2.7～3.2 Mb** | **1.8～2.7 Mb** |
| DSP | 0 | **120～140 DSP48E1** | **90～120 DSP48E1** |
| GTP SerDes | 無 | 無 | **4× 6.6 Gb/s**（視型號） |
| PCIe | 軟實作受限 | 有限 | **硬化 Gen2 x1**（視型號） |
| DDR | 軟控制器 | 至 **800 Mb/s** 等級 | 至 **1066 Mb/s** 等級 |
| 非揮發 / Instant-on | 有 | 無（需外部 Flash） | 無（需外部 Flash） |
| 工具 | Diamond / Radiant | **Vivado** | **Vivado** |

（7 系列資料：AMD DS180、Spartan-7 / Artix-7 Product Brief。）

### 3.2 選型決策樹

```
新設計是否需要原生 GTP（PCIe / SGMII / Aurora 等）？
├─ 否、且成本與封裝面積最敏感 → Spartan-7（如 XC7S50-2CSGA324）
└─ 是、或需要更高 DSP / BRAM 密度 → Artix-7（如 XC7A50T-2CSG324）
```

**Spartan-7 適用：** 介面擴展、感測器融合、中等 DSP、無 SerDes 或 SerDes 由外置 PHY 負責。  
**Artix-7 適用：** 需 **PCIe endpoint**、影像/通訊管道頻寬升級、單晶片整合更多高速 I/O。

---

## 4. 建議方案（推薦路徑）

### 方案 A（推薦）：Spartan-7 平台化 — **XC7S50 或 XC7S75**

- **理由：** 在無 SerDes 需求時，以較佳 **$/LUT、$/DSP** 滿足邏輯與訊號處理成長；封裝可選 CSGA324 / FGGA484，與既有 PCB 尺寸有機會對齊。  
- **代價：** 需外掃 SPI Flash、上電設定時間較 XO3 長；軟體流程改為 Vivado。  
- **風險緩解：** 沿用 JTAG 產測；Boot 時間若為產品訴求，可量化預載入並與系統 MCU 分工。

### 方案 B：Artix-7 — **XC7A35T 或 XC7A50T**

- **理由：** 新規格明確需要 **PCIe / 高速 SerDes / 更高記憶體頻寬** 時，單晶片整合度最佳。  
- **代價：** 單價與 PCB（差分對佈局、參考時脈）要求較高。  
- **適用：** 需與 x86 / SoC 以 PCIe 通訊、或 1G+ 等級乙太網路 MAC+PCS 整合。

### 方案 C（不推薦）：維持 XO3 + 外掛 ASSP / 第二顆 FPGA

- 短期看似不改 FPGA，實際 **BOM↑、供應鏈↑、除錯↑**；且 XO3 仍為瓶頸，技術債延後爆炸。

---

## 5. 成本、NRE 與時程（供預算與排程參考）

| 項目 | 粗估影響 | 說明 |
|------|----------|------|
| 單顆料價 | FPGA 單價可能較 XO3 上升 | 以 Avnet/DigiKey 量級報價 + 年採量談判；DSP/BRAM 帶來功能節省可抵消 |
| PCB | 小幅～中幅改版 | Artix-7 SerDes 需嚴格阻抗控制；Spartan-7 若僅 HR I/O 則較低 |
| NRE | 工具授權、工程人力 | Vivado 授權（若尚無）、IP 驗證、重新 timing closure |
| 韌體 | Boot / Flash 架構 | 需定義 golden image、現場更新流程（可參考 XO3 雙 boot 概念改實作） |
| 時程 | PoC **4～8 週**；量產改版 **+1～2 個硬體世代** | 含 pin-out、SI 模擬、EMI 複測 |

---

## 6. 風險與緩解

| 風險 | 等級 | 緩解措施 |
|------|------|----------|
| Instant-on 需求 | 中 | 系統架構上由 MCU/PMIC 延遲上電敏感路徑；或預載 bitstream 至 SRAM 方案評估 |
| 供應鏈 / EOL | 低～中 | 7 系列為長週期量產族；優先選工規/車規有案的料號 |
| 團隊技能 | 中 | 內部 Vivado 培訓 + 建立參考設計（Clocking、XDC、ILA） |
| 腳位不相容 | 高（必然） | 視為新版 PCB；保留除錯插座與量測點 |

---

## 7. 建議行動與主管決策點

**請核准：**

1. **啟動 PoC**：以【建議首選：XC7S50 或 XC7A50T】完成新設計關鍵路徑（【填入：模組名稱】）之綜合、時序與功耗量測。  
2. **編列預算**：Vivado 授權（若需要）、評估板 2 套、SI 複核 1 輪。  
3. **凍結決策時點**：PoC 報告後 **2 週內** 選定 Spartan-7 或 Artix-7 單一平台，避免雙軌維護。

---

## 附錄 A：專案自填表（提交前請補齊）

| 欄位 | 數值 |
|------|------|
| 現用料號（含 XO3-9600C 完整 P/N） | |
| Vivado 目標裝置 | |
| 估算 LUT / FF 利用率 | |
| 估算 BRAM (kb) | |
| 估算 DSP 用量 | |
| 必要 SerDes / PCIe | |
| 目標 Fmax | |
| 目標功耗 (W) | |
| 目標單價上限 ($) | |

---

## 參考資料

- [Lattice MachXO3 Family Data Sheet (DS1047)](https://www.latticesemi.com/en/Products/FPGAandCPLD/MachXO3)  
- [AMD Spartan-7 產品頁](https://www.amd.com/en/products/adaptive-socs-and-fpgas/fpga/spartan-7.html)  
- [AMD Artix-7 產品頁](https://www.amd.com/en/products/adaptive-socs-and-fpgas/fpga/artix-7.html)  
- [7 Series FPGAs Overview (DS180)](https://docs.amd.com/r/en-US/ds180_7Series_Overview)