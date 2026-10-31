# Luxien Bot — 開發環境筆記

## 這是什麼
Discord 關鍵字自動回覆機器人。程式本體是專案根目錄的單一檔案 `系統`（沒有副檔名，CommonJS；以 `require('./系統')` 載入即可）。
它沒有網頁介面，因此 `server.js` 啟動一個唯讀狀態頁（連接埠 3000），同時載入機器人本體：
顯示連線狀態、憑證狀態、自動回覆規則、系統設定與斜線指令清單。

## 執行
```bash
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml logs -f bot   # 看機器人日誌
```
容器啟動時以 `npm ci` 依 `package-lock.json` 安裝依賴（依賴目錄在 bind mount 內，不進映像），
再由 nodemon 監看 `系統` 與 `server.js` 自動重啟 —— 修改這兩個檔案後不需要手動重啟。

## 環境變數（外部服務憑證，來自 /run/base44/app.env）
- `TOKEN` — Discord 機器人 Token
- `CLIENT_ID` — Discord Application ID
- `GUILD_ID` — 註冊斜線指令的伺服器 ID

缺少憑證時程式不會崩潰：狀態頁會顯示「尚未設定憑證」與缺少的變數名稱。

`.env.base44-defaults`（可提交）提供 `your_token` / `your_client_id` / `your_guild_id` 佔位值，
在 compose 的 `env_file` 中排在 `/run/base44/app.env` **之前**，因此只作為後備；
真實憑證來自平台密鑰檔，永遠優先。不要把真實值寫進 compose 的 `environment:`，那會永久蓋掉密鑰檔。

## Discord 端前置設定（在 Developer Portal 完成，程式無法代替）
1. Bot → Privileged Gateway Intents → 開啟 **MESSAGE CONTENT INTENT**。未開啟時登入會回
   `Used disallowed intents`（本機器人需要讀取訊息內容才能比對關鍵字）。
2. 機器人必須已加入 `GUILD_ID` 指定的伺服器，並帶 `applications.commands` scope；
   否則指令註冊會回 `Missing Access`（50001）。
3. 每次啟動都會重新註冊該伺服器的斜線指令，屬正常行為。

## 資料檔案
`faq-data.json`（題庫）與 `faq-config.json`（設定）由程式寫在工作目錄（容器內 `/app`），
首次讀取時自動建立預設值。兩者已列入 `.gitignore`，屬執行期資料，不要提交。

## 驗證
```bash
curl -s localhost:3000/api/health          # {"ok":true}
curl -s localhost:3000/api/status          # 機器人狀態、規則、設定
```
`/api/status` 中 `bot.status` 應為 `online`，且 `bot.error` 為 `null`，才代表機器人真的已登入 Discord。
