# 部署到 Render — 台股籌碼看板（一頁做完）

Repo 已公開：https://github.com/Kevin-Power/tw-market-dashboard

## 5 分鐘上線

1. 打開 [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. 連接 GitHub 帳號 → 選 **`Kevin-Power/tw-market-dashboard`**
3. 確認 Blueprint 讀到根目錄 `render.yaml` → **Apply**
4. 等 Build 變綠（約 3–8 分鐘）
5. 開啟服務網址，驗收：

| 檢查 | 預期 |
|------|------|
| `/api/health` | `{"ok":true,"storage":"file",…}` |
| `/` | 看板有 KPI、簡報、表格 |
| `/api/export?format=xlsx` | 下載 Excel |
| `/api/export?format=html` | 客戶 HTML 報告 |

Blueprint 已寫死：

| 項目 | 值 |
|------|-----|
| Runtime | Node 22 |
| Region | Singapore |
| Build | `npm ci && npm run build:render` |
| Start | `npm run start:render` |
| Health | `/api/health` |
| `MARKET_UPDATE_TOKEN` | 自動產生 |

## 資料會不會不見？

| 情況 | 行為 |
|------|------|
| **預設（無 DATABASE_URL）** | 寫入伺服器 `data/market-snapshot.json`。Free 實例**休眠／重部署**後會回到 seed，需再上傳 |
| **有 DATABASE_URL（Neon）** | 寫入 Postgres，重啟仍保留。啟動時自動 migrate |

### 建議接 Neon（免費）

1. https://neon.tech 建立專案 → 複製 connection string  
2. Render 服務 → **Environment** → 新增 `DATABASE_URL`  
3. **Manual Deploy** → 部署後 `/api/health` 的 `storage` 應為 `postgres`

## 每日更新（上線後）

### A. 看板上傳（最簡單）

「每日更新」分頁 → 丟三份 Excel → 套用  
（同源請求，**不必**在瀏覽器帶 token）

### B. Google Apps Script

1. 看板「GAS 範例」複製 Code.gs  
2. 指令碼屬性：  
   - `DASHBOARD_URL` = `https://你的服務.onrender.com`  
   - `MARKET_TOKEN` = Render 的 `MARKET_UPDATE_TOKEN`  
3. 執行 `setupDailyTrigger()` 一次  

## 客戶下載連結（把網域換掉即可）

```
https://你的服務.onrender.com/api/export?format=xlsx
https://你的服務.onrender.com/api/export?format=html
https://你的服務.onrender.com/api/export?format=html-email
https://你的服務.onrender.com/api/export?format=summary
https://你的服務.onrender.com/api/export?format=csv-bundle
https://你的服務.onrender.com/api/export?format=json
```

## 本機＝Render 建置

```bash
npm ci
npm run build:render
PORT=8080 HOST=0.0.0.0 npm run start:render
npm run verify:deploy -- http://127.0.0.1:8080
```

## 常見問題

| 現象 | 處理 |
|------|------|
| Build 失敗 | 確認 repo 有 `package-lock.json`、Node 22 |
| 白屏無樣式 | 必須用 `build:render`（含 SSR CSS 同步） |
| Health 503 | 看 Render Logs；DATABASE_URL 是否打錯 |
| 上傳 401 | GAS 需 token；看板內上傳應自動過 |
| Free 睡醒資料沒了 | 接 Neon，或每次重新上傳 Excel |
| Cold start 慢 | Free 正常，可升 Starter |

## 手動 Web Service（不用 Blueprint 時）

| 設定 | 值 |
|------|-----|
| Build Command | `npm ci && npm run build:render` |
| Start Command | `npm run start:render` |
| Health Check Path | `/api/health` |
| Env | `NODE_VERSION=22` `NITRO_PRESET=node-server` `HOST=0.0.0.0` `NITRO_HOST=0.0.0.0` |
