# 台股籌碼看板

外資／投信買賣超、一年新高新低、0050 持股明細。**資料每日更新**，並提供**客戶可下載**的專業報表。

**目標部署： [Render](https://render.com)**（見 [`README-RENDER.md`](./README-RENDER.md) 與根目錄 `render.yaml`）。

## 功能

- KPI：創新高／新低、外資／投信買超冠軍、同時買進家數
- 機構籌碼簡報（市場溫度、研究要點、前 30 淨額）
- 外資／投信買賣超前 30 名（單表 CSV）
- 一年新高／新低、0050 持股
- **下載中心**：Excel（11 工作表）· HTML 報告／PDF · 郵件稿 · 摘要 · CSV · JSON
- **每日更新**：三份 Excel 上傳或 GAS 推送
- `GET /api/market` · `GET /api/export` · `GET /api/health`

## 客戶下載

| 格式 | 說明 | 連結 |
|------|------|------|
| Excel | 封面 + 研究摘要 + 籌碼全表 | `/api/export?format=xlsx` |
| HTML | 客戶報告（瀏覽器列印 → PDF） | `/api/export?format=html` |
| 郵件 HTML | 可貼 Gmail / Outlook | `/api/export?format=html-email` |
| 摘要 | 純文字日報 | `/api/export?format=summary` |
| CSV 精選 | Top10 + 新高 | `/api/export?format=csv-bundle` |
| JSON | 系統串接 | `/api/export?format=json` |

## 每日更新

看板「每日更新」上傳三份 Excel，或見 [`google-apps-script/Code.gs`](./google-apps-script/Code.gs)。

```bash
npm run data:parse
npm run data:verify
```

## 本機開發

```bash
npm install
npm run dev
```

## Render 部署（摘要）

```bash
# 與線上相同的建置
npm run build:render
PORT=8080 HOST=0.0.0.0 npm run start:render
```

1. 推到 GitHub  
2. Render → **New → Blueprint** → 選 repo（讀取 `render.yaml`）  
3. 部署完成後開 `/api/health` 確認 `ok: true`  
4. （建議）設定 `DATABASE_URL`（Neon）以免 Free 重啟掉資料  

完整說明：[README-RENDER.md](./README-RENDER.md)

## 技術

React 19 · TanStack Start · Tailwind v4 · Recharts · xlsx · Zod · Nitro `node-server` · PGLite / Neon

## 免責

僅供資訊彙整示範，非投資建議。
