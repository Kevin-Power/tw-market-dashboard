# 台股籌碼看板

外資／投信買賣超、一年新高新低、0050 持股。**每日更新** + **客戶可下載**專業報表。

**GitHub：** https://github.com/Kevin-Power/tw-market-dashboard  
**部署：** [Render Blueprint](./README-RENDER.md)（`render.yaml` 已就緒）

## 功能

- 機構研究簡報（市場溫度、前 30 淨額、同時買進、0050 集中度）
- 外資／投信買賣超、一年新高／新低、0050
- **下載中心**：Excel（11 表）· HTML→PDF · 郵件稿 · 摘要 · CSV · JSON
- **每日更新**：三份 Excel 上傳或 GAS
- API：`/api/market` · `/api/export` · `/api/health`

## 每日自動籌碼

- 看板「每日更新」→ **立即抓取最新交易日**（證交所／櫃買）
- 或排程 `POST /api/cron/daily?force=1`（GAS 每日 16:00）
- 資料來源：TWSE T86、櫃買三大法人、收盤行情

## 5 分鐘上 Render

1. [Render](https://dashboard.render.com) → **New** → **Blueprint**
2. 連接本 repo
3. Apply → 等 Build 完成
4. 開 `/api/health` 確認 `"ok": true`

詳見 [README-RENDER.md](./README-RENDER.md)。建議加 Neon `DATABASE_URL` 持久化資料。

## 本機

```bash
npm ci
npm run dev                 # 開發
npm run build:render        # 與 Render 相同建置
PORT=8080 npm run start:render
npm run verify:deploy -- http://127.0.0.1:8080
```

## 免責

僅供資訊彙整示範，非投資建議。
