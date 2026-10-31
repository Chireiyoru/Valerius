# AGENTS.md

## What this repo is

A single-process Discord bot (`系統`, Traditional Chinese source) that answers FAQ
keywords automatically and exposes `/問答*` slash commands for admins. There is no
frontend; the only web surface is `status-server.js`, a read-only status page used by
the Base44 preview.

## Running locally / in the sandbox

- Requires Node 20+ and `npm install` (discord.js v14 + dotenv).
- `npm start` runs the bot; `npm test` runs the unit tests of the matching logic
  (`test/faq.test.js`, no Discord connection needed).
- Compose: `docker compose -f docker-compose.base44.yml up -d`.
  The bot service mounts the repo at `/app`, installs deps on startup, and stores
  `faq-data.json` / `faq-config.json` in the `bot-data` volume (paths injected via
  `FAQ_FILE` / `CONFIG_FILE`) so runtime state is never committed into the repo.
- The status page is only started when `STATUS_PORT` is set (compose sets 3000).
  `GET /health` is a process liveness probe, `GET /status.json` returns the raw state.

## Required secrets (delivered at /run/base44/app.env)

`TOKEN`, `CLIENT_ID`, `GUILD_ID` — a bot token, its application id, and the target
guild id. Without them the bot registers nothing and stays offline.

Note: `GUILD_ID` is also used by the code as the single target server. If the bot is
not a member of that server, Discord answers `Missing Access (50001)` when the bot
tries to register the slash commands at startup.

## Discord-side prerequisites (must be done in the Developer Portal / by invitation)

1. Bot → Privileged Gateway Intents → **Message Content Intent** must be ON. The code
   matches keywords against message content; with the intent off, `client.login()`
   fails with `Used disallowed intents` and the bot never comes online.
2. The bot must be invited to the guild in `GUILD_ID` with the `bot` and
   `applications.commands` scopes (Send Messages, Embed Links, Read Message History,
   Use Slash Commands). The status page renders the invite URL built from `CLIENT_ID`.

## How to verify

1. `npm test` — matching/config logic (10 assertions).
2. `docker compose -f docker-compose.base44.yml ps` — bot service must be `healthy`.
3. `docker compose -f docker-compose.base44.yml logs bot` — expect
   `指令註冊完成！共 7 個。` and `已登入為 ...`.
4. `curl -s localhost:3000/status.json` — `ready: true`, `guilds: 1`, `commandCount: 7`.
5. In Discord, run `/問答狀態` and send any message containing a configured keyword.
