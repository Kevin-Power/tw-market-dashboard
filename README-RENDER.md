# 部署到 Render — 台股籌碼看板

依下列步驟即可上線。建議 **Blueprint**（讀取根目錄 `render.yaml`）。

## 方式 A：Blueprint（推薦）

1. 將本專案推到 **GitHub**（private 亦可）
2. 打開 [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
3. 連接 repo，確認讀到 `render.yaml`
4. 建立服務 → 等待 Build / Deploy（約 3–8 分鐘）
5. 取得網址：`https://tw-market-dashboard-xxxx.onrender.com`

Blueprint 已設定：

| 項目 | 值 |
|------|-----|
| Runtime | Node 22 |
| Region | Singapore |
| Build | `npm ci && npm run build:render` |
| Start | `npm run start:render` |
| Health | `GET /api/health` |
| `MARKET_UPDATE_TOKEN` | 自動產生（GAS 用；看板同源上傳免帶） |

## 方式 B：手動 Web Service

| 設定 | 值 |
|------|-----|
| Runtime | Node |
| Build Command | `npm ci && npm run build:render` |
| Start Command | `npm run start:render` |
| Health Check Path | `/api/health` |
| Instance | Free 或 Starter |
| Region | Singapore |

環境變數：

```
NODE_VERSION=22
NODE_ENV=production
NITRO_PRESET=node-server
HOST=0.0.0.0
NITRO_HOST=0.0.0.0
MARKET_UPDATE_TOKEN=你的密鑰          # 建議設定（GAS / 外部 POST）
DATABASE_URL=postgres://…              # 可選，見下方「持久化」
```

Render 會注入 `PORT`；Nitro 會監聽該埠。

## 上線後立刻檢查

```text
GET https://你的網域/api/health
→ { "ok": true, "asOf": "2026-07-29", "db": "pglite"|"neon", … }

GET https://你的網域/
→ 看板正常、有 KPI 與簡報

GET https://你的網域/api/export?format=xlsx
→ 下載 Excel

GET https://你的網域/api/export?format=html
→ 客戶 HTML 報告
```

## 持久化每日資料（強烈建議）

| 方案 | 說明 |
|------|------|
| **未設 DATABASE_URL** | 使用記憶體 **PGLite**。Free 實例休眠／重啟後會回到 seed，需重新上傳 Excel |
| **設 DATABASE_URL（Neon 等）** | 資料寫入 Postgres，重啟仍保留。啟動時 `render-start` 會自動 migrate |

Neon 免費：https://neon.tech → 建立專案 → 複製 connection string → Render 環境變數 `DATABASE_URL` → Redeploy。

## 每日更新

1. **看板「每日更新」**：上傳三份 Excel（同源，免 token）
2. **Google Apps Script**：見 `google-apps-script/Code.gs`  
   - `DASHBOARD_URL` = 你的 Render 網址  
   - `MARKET_TOKEN` = Render 的 `MARKET_UPDATE_TOKEN`

## 客戶下載（上線後）

| 格式 | 路徑 |
|------|------|
| Excel 完整日報 | `/api/export?format=xlsx` |
| HTML → 列印 PDF | `/api/export?format=html` |
| 郵件 HTML | `/api/export?format=html-email` |
| 文字摘要 | `/api/export?format=summary` |
| JSON | `/api/export?format=json` |
| 精選 CSV | `/api/export?format=csv-bundle` |

## 本機驗證生產建置（與 Render 相同）

```bash
npm run build:render
PORT=8080 HOST=0.0.0.0 npm run start:render
# 另開終端：
curl -s http://127.0.0.1:8080/api/health
```

## 常見問題

| 現象 | 處理 |
|------|------|
| Build 失敗 | 確認 Node 22、`package-lock.json` 有提交 |
| 白屏 / CSS 沒樣式 | 確認用 `build:render`（含 `sync-ssr-assets`） |
| Health 503 | 看 Render logs；DB 連線是否錯誤 |
| 上傳 401 | GAS 需帶 token；看板內上傳應同源自動通過 |
| Free 休眠後資料不見 | 接 `DATABASE_URL`，或每次喚醒後重新上傳 |
| Cold start 慢 | Free 正常；可升級 Starter |

## 推到 GitHub 後再 Blueprint

```bash
git init
git add .
git commit -m "feat: TW market dashboard ready for Render"
git remote add origin https://github.com/你的帳號/tw-market-dashboard.git
git push -u origin main
```

然後 Render → New → Blueprint → 選該 repo。
