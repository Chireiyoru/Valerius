# Luxien — 簽到 Discord 機器人

Discord 機器人（`系統` 這支腳本，無副檔名，以 `node 系統` 執行）。它會註冊 `/簽到`、`/簽到資訊`、`/簽到排行` 三個斜線指令，並把紀錄寫進 repo 根目錄的 `checkin-data.json`。

## 本機／預覽環境

```bash
docker compose -f docker-compose.base44.yml up -d
```

- `web` — 唯讀狀態看板，`http://localhost:3000`。Discord 機器人本身沒有網頁介面，這個看板是唯一能在瀏覽器看到機器人狀態（是否上線、所在伺服器、指令清單、排行榜）的地方。它只讀 `checkin-data.json` 並呼叫 Discord REST API，不寫入任何資料。
- `bot` — 機器人本體。以 `npm ci` 安裝依賴後執行 `node 系統`。

## 憑證

機器人從 `/run/base44/app.env`（平台管理的 secrets 檔，不在 repo 內）讀取三個變數，名稱必須完全一致，因為 `系統` 直接讀 `process.env`：

| 變數 | 用途 |
| --- | --- |
| `TOKEN` | Bot Token |
| `CLIENT_ID` | Application ID，用來註冊斜線指令 |
| `GUILD_ID` | 測試用伺服器 ID，指令會註冊在該伺服器 |

缺少 `TOKEN` 時 `bot` 服務會印出提示並以 exit 0 結束（不會 crash loop）。憑證補上後重啟服務即可：`docker compose -f docker-compose.base44.yml up -d --force-recreate bot`。

## 疑難排解

- 改了 `系統` 或 `dashboard/` 底下的檔案後要重啟對應服務才會生效（兩者都沒有 watch mode）：`docker compose -f docker-compose.base44.yml restart bot web`。
- `checkin-data.json` 是執行期資料，已列入 `.gitignore`；刪掉就會清空所有簽到紀錄。
- `npm ci` 讀 `package-lock.json`，改動 `package.json` 的依賴後要同步更新 lockfile，否則 `bot` 服務啟動會失敗。
- `bot` 的 healthcheck 直接打 Discord `/users/@me`，所以它同時驗證了 token 有效性和對外網路連線。
