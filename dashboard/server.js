/**
 * Luxien 狀態看板
 *
 * Discord 機器人本身沒有網頁介面，這個小服務只用來讓你在預覽中
 * 看到機器人的即時狀態：是否已上線、所在伺服器、已註冊的指令，
 * 以及 checkin-data.json 裡的簽到紀錄。
 *
 * 唯讀：不寫入任何資料，簽到資料由機器人負責寫入。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, '..', 'checkin-data.json');
const INDEX_FILE = path.join(__dirname, 'index.html');
const API = 'https://discord.com/api/v10';

const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;

const COMMANDS = [
  { name: '/簽到', description: '進行每日簽到' },
  { name: '/簽到資訊', description: '查看自己的簽到紀錄' },
  { name: '/簽到排行', description: '查看連續簽到排行榜' }
];

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return null; // 尚未有簽到紀錄
  }
}

async function discord(pathname) {
  const res = await fetch(API + pathname, {
    headers: { Authorization: `Bot ${TOKEN}` },
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) throw new Error(`Discord API ${res.status}`);
  return res.json();
}

async function buildStatus() {
  const data = readData();
  const rows = Object.entries(data || {})
    .map(([id, info]) => ({ id, ...info }))
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 10);

  const status = {
    configured: Boolean(TOKEN && CLIENT_ID && GUILD_ID),
    missing: [
      !TOKEN && 'TOKEN',
      !CLIENT_ID && 'CLIENT_ID',
      !GUILD_ID && 'GUILD_ID'
    ].filter(Boolean),
    state: 'missing-credentials',
    bot: null,
    guild: null,
    commands: COMMANDS,
    leaderboard: rows,
    playerCount: data ? Object.keys(data).length : 0,
    totalCheckins: data
      ? Object.values(data).reduce((sum, u) => sum + (u.totalCheckins || 0), 0)
      : 0,
    dataUpdatedAt: data
      ? new Date(fs.statSync(DATA_FILE).mtime).toISOString()
      : null,
    checkedAt: new Date().toISOString()
  };

  if (!TOKEN) return status;

  try {
    const me = await discord('/users/@me');
    status.state = 'online';
    status.bot = {
      id: me.id,
      username: me.username,
      avatar: me.avatar
        ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
        : null
    };
  } catch (err) {
    status.state = 'offline';
    status.error = err.message;
  }

  // 顯示名稱（盡力而為，失敗就退回使用者 ID）
  if (GUILD_ID && status.state === 'online') {
    try {
      const guild = await discord(`/guilds/${GUILD_ID}`);
      status.guild = { id: guild.id, name: guild.name };
      await Promise.all(
        status.leaderboard.map(async row => {
          try {
            const member = await discord(`/guilds/${GUILD_ID}/members/${row.id}`);
            row.displayName = member.nick || member.user.global_name || member.user.username;
          } catch {
            row.displayName = null;
          }
        })
      );
    } catch {
      status.guild = null;
    }
  }

  return status;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/status') {
    try {
      const status = await buildStatus();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(status));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ state: 'error', error: err.message }));
    }
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = fs.readFileSync(INDEX_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('看板載入失敗：' + err.message);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Luxien 狀態看板已啟動： http://0.0.0.0:${PORT}`);
});
