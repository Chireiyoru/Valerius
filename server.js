// 狀態頁：Discord 機器人沒有網頁介面，這裡提供一個唯讀儀表板，
// 讓你可以在瀏覽器（預覽）裡看到機器人連線狀態、自動回覆規則與系統設定。
require('dotenv').config();
const http = require('http');
const path = require('path');

// 載入機器人（會同時註冊指令並登入 Discord）
const bot = require('./系統');

const PORT = Number(process.env.PORT || 3000);
const STARTED_AT = Date.now();

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function credentials() {
  return {
    TOKEN: Boolean(process.env.TOKEN),
    CLIENT_ID: Boolean(process.env.CLIENT_ID),
    GUILD_ID: Boolean(process.env.GUILD_ID),
  };
}

// 常見登入錯誤的中文提示（Discord 端設定問題）
function errorHints(message) {
  if (!message) return [];
  if (/disallowed intents/i.test(message)) {
    return ['到 Discord Developer Portal → 你的應用程式 → Bot → Privileged Gateway Intents，開啟 MESSAGE CONTENT INTENT 並按 Save Changes。'];
  }
  if (/Missing Access|50001/.test(message)) {
    return ['機器人還沒有加入 GUILD_ID 指定的伺服器（或伺服器 ID 填錯）。請用 applications.commands 權限邀請機器人。'];
  }
  if (/invalid token|An invalid token/i.test(message)) {
    return ['TOKEN 無效或已被 Reset，請到 Developer Portal → Bot 重新取得 Token 並更新密鑰。'];
  }
  return [];
}

function botSummary() {
  const creds = credentials();
  const missing = Object.keys(creds).filter(k => !creds[k]);
  const ready = bot.client.isReady();

  let status = 'offline';
  if (missing.length > 0) status = 'unconfigured';
  else if (ready) status = 'online';
  else if (bot.botState.error) status = 'error';

  return {
    status,
    ready,
    configured: missing.length === 0,
    missing,
    error: bot.botState.error,
    tag: bot.client.user ? bot.client.user.tag : null,
    guilds: bot.client.guilds ? bot.client.guilds.cache.size : 0,
    ping: bot.client.ws && bot.client.ws.ping >= 0 ? Math.round(bot.client.ws.ping) : null,
    hints: errorHints(bot.botState.error),
  };
}

function buildStatus() {
  const faq = bot.loadFaq();
  const config = bot.loadConfig();
  return {
    now: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    bot: botSummary(),
    config,
    paused: bot.isAutoPausedByAdmin(),
    rules: faq,
    commands: (bot.commands || []).map(c => ({ name: c.name, description: c.description })),
  };
}

const STATUS_LABELS = {
  online: { text: '已連線', color: '#57f287' },
  offline: { text: '連線中…', color: '#faa61a' },
  error: { text: '登入失敗', color: '#ed4245' },
  unconfigured: { text: '尚未設定憑證', color: '#949ba4' },
};

function renderPage() {
  const s = buildStatus();
  const label = STATUS_LABELS[s.bot.status];
  const alertInner = s.bot.hints.length
    ? `<strong>機器人登入失敗：</strong>${esc(s.bot.error)}<ul>${s.bot.hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`
    : '';
  const credRows = Object.keys(credentials())
    .map(k => {
      const ok = credentials()[k];
      return `<tr><td class="mono">${k}</td><td><span class="chip ${ok ? 'good' : 'bad'}">${ok ? '已設定' : '缺少'}</span></td></tr>`;
    })
    .join('');

  const ruleRows = s.rules.length
    ? s.rules
        .map(
          r => `<tr>
            <td class="mono">${esc(r.id)}</td>
            <td><span class="chip ${r.enabled ? 'good' : 'muted'}">${r.enabled ? '啟用' : '停用'}</span></td>
            <td>${r.keywords.map(k => `<span class="kw">${esc(k)}</span>`).join('')}</td>
            <td class="answer">${esc(r.answer)}</td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="4" class="empty">目前沒有任何自動回覆規則（在 Discord 使用 /問答新增 即可新增）</td></tr>';

  const commandRows = s.commands
    .map(c => `<li><span class="mono cmd">/${esc(c.name)}</span> <span class="desc">${esc(c.description)}</span></li>`)
    .join('');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Luxien · 自動回覆機器人</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 56px;
    font-family: "Segoe UI", system-ui, -apple-system, "Noto Sans TC", sans-serif;
    background: #1e1f22; color: #dbdee1;
  }
  .wrap { max-width: 960px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 6px; }
  h1 { font-size: 22px; margin: 0; letter-spacing: .3px; }
  .sub { color: #949ba4; font-size: 13px; margin: 0 0 26px; }
  .pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px;
          background: #2b2d31; font-size: 13px; font-weight: 600; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: ${label.color}; box-shadow: 0 0 10px ${label.color}; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 22px; }
  .card { background: #2b2d31; border-radius: 12px; padding: 16px; border: 1px solid #3c3f45; }
  .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .8px; color: #949ba4; margin: 0 0 10px; }
  .stat { font-size: 18px; font-weight: 600; color: #f2f3f5; word-break: break-word; }
  .stat.small { font-size: 14px; font-weight: 500; }
  section { background: #2b2d31; border: 1px solid #3c3f45; border-radius: 12px; padding: 18px; margin-bottom: 18px; }
  section h2 { font-size: 14px; margin: 0 0 14px; color: #f2f3f5; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #949ba4; font-weight: 600; font-size: 11px; text-transform: uppercase;
       letter-spacing: .6px; padding: 0 10px 8px 0; }
  td { padding: 9px 10px 9px 0; border-top: 1px solid #3c3f45; vertical-align: top; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #c4c9d0; }
  .answer { color: #dbdee1; max-width: 380px; white-space: pre-wrap; }
  .kw { display: inline-block; background: #404249; border-radius: 6px; padding: 2px 7px; margin: 0 4px 4px 0;
        font-size: 12px; color: #f2f3f5; }
  .chip { display: inline-block; border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 700; }
  .chip.good { background: rgba(87,242,135,.14); color: #57f287; }
  .chip.bad { background: rgba(237,66,69,.14); color: #ed4245; }
  .chip.muted { background: #404249; color: #b5bac1; }
  .empty { color: #949ba4; font-style: italic; }
  .kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; font-size: 13px; }
  .kv div span { display: block; color: #949ba4; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 3px; }
  ul { list-style: none; margin: 0; padding: 0; font-size: 13px; }
  li { padding: 8px 0; border-top: 1px solid #3c3f45; }
  li:first-child { border-top: 0; padding-top: 0; }
  .cmd { color: #5865f2; font-weight: 700; margin-right: 8px; }
  .desc { color: #b5bac1; }
  .hint { margin-top: 8px; font-size: 13px; color: #faa61a; line-height: 1.6; }
  .alert { display: none; margin-top: 12px; padding: 12px 14px; font-size: 13px; line-height: 1.7;
           background: rgba(237,66,69,.1); border-left: 3px solid #ed4245; border-radius: 8px; color: #f2f3f5; }
  .alert ul { margin: 8px 0 0; padding-left: 18px; list-style: disc; }
  .alert li { border: 0; padding: 2px 0; color: #dbdee1; }
  .alert li:first-child { padding-top: 2px; }
  footer { color: #6d6f78; font-size: 12px; text-align: center; margin-top: 8px; }
  @media (max-width: 640px) {
    body { padding: 20px 12px 40px; }
    .answer { max-width: 160px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Luxien · 自動回覆機器人</h1>
    <span class="pill" id="status-pill"><span class="dot"></span><span id="status-text">${label.text}</span></span>
  </header>
  <p class="sub">Discord 關鍵字自動回覆系統 — 唯讀狀態頁（資料每 3 秒更新）</p>

  <div class="grid">
    <div class="card"><h2>機器人</h2><div class="stat small" id="bot-tag">${esc(s.bot.tag || '—')}</div></div>
    <div class="card"><h2>伺服器數</h2><div class="stat" id="guilds">${s.bot.guilds}</div></div>
    <div class="card"><h2>WebSocket 延遲</h2><div class="stat" id="ping">${s.bot.ping == null ? '—' : s.bot.ping + ' ms'}</div></div>
    <div class="card"><h2>規則數量</h2><div class="stat" id="rule-count">${s.rules.length}</div></div>
    <div class="card"><h2>總開關</h2><div class="stat" id="switch">${s.config.enabled ? '啟用' : '停用'}</div></div>
  </div>

  <section>
    <h2>憑證狀態</h2>
    <table>
      <thead><tr><th>環境變數</th><th>狀態</th></tr></thead>
      <tbody>${credRows}</tbody>
    </table>
    <div class="hint" id="cred-hint" ${s.bot.configured ? 'style="display:none"' : ''}>
      缺少 TOKEN / CLIENT_ID / GUILD_ID，機器人還無法登入 Discord。
      補上憑證後容器會自動重啟，機器人就會上線。
    </div>
    <div class="alert" id="bot-alert" ${s.bot.hints.length ? '' : 'style="display:none"'}>${alertInner}</div>
  </section>

  <section>
    <h2>自動回覆規則</h2>
    <table>
      <thead><tr><th>編號</th><th>狀態</th><th>關鍵字</th><th>回覆內容</th></tr></thead>
      <tbody id="rule-rows">${ruleRows}</tbody>
    </table>
  </section>

  <section>
    <h2>系統設定</h2>
    <div class="kv">
      <div><span>冷卻秒數</span>${s.config.cooldownSeconds} 秒</div>
      <div><span>管理員暫停</span>${s.config.adminPauseMinutes > 0 ? s.config.adminPauseMinutes + ' 分鐘' : '未啟用'}</div>
      <div><span>目前暫停</span>${s.paused ? '是（管理員剛發言）' : '否'}</div>
      <div><span>限定頻道</span>${s.config.channelIds.length === 0 ? '全群生效' : esc(s.config.channelIds.join('、'))}</div>
      <div><span>回覆格式</span>${s.config.replyWithEmbed ? 'Embed' : '純文字'}</div>
      <div><span>最低匹配分數</span>${s.config.minMatchScore}</div>
    </div>
  </section>

  <section>
    <h2>斜線指令</h2>
    <ul>${commandRows}</ul>
  </section>

  <footer>Luxien Bot · 執行目錄 ${esc(path.basename(process.cwd()))} · 已運行 <span id="uptime">${s.uptimeSeconds}</span> 秒</footer>
</div>
<script>
  const LABELS = ${JSON.stringify(STATUS_LABELS)};
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  async function refresh() {
    try {
      const res = await fetch('/api/status');
      const s = await res.json();
      const label = LABELS[s.bot.status] || LABELS.offline;
      document.getElementById('status-text').textContent = label.text;
      document.querySelector('.dot').style.background = label.color;
      document.querySelector('.dot').style.boxShadow = '0 0 10px ' + label.color;
      document.getElementById('bot-tag').textContent = s.bot.tag || '—';
      document.getElementById('guilds').textContent = s.bot.guilds;
      document.getElementById('ping').textContent = s.bot.ping == null ? '—' : s.bot.ping + ' ms';
      document.getElementById('rule-count').textContent = s.rules.length;
      document.getElementById('switch').textContent = s.config.enabled ? '啟用' : '停用';
      document.getElementById('uptime').textContent = s.uptimeSeconds;
      document.getElementById('cred-hint').style.display = s.bot.configured ? 'none' : 'block';
      const alertBox = document.getElementById('bot-alert');
      if (s.bot.hints && s.bot.hints.length) {
        alertBox.style.display = 'block';
        alertBox.innerHTML = '<strong>機器人登入失敗：</strong>' + esc(s.bot.error)
          + '<ul>' + s.bot.hints.map(h => '<li>' + esc(h) + '</li>').join('') + '</ul>';
      } else {
        alertBox.style.display = 'none';
      }
      const body = document.getElementById('rule-rows');
      body.innerHTML = s.rules.length
        ? s.rules.map(r => '<tr><td class="mono">' + esc(r.id) + '</td>'
            + '<td><span class="chip ' + (r.enabled ? 'good' : 'muted') + '">' + (r.enabled ? '啟用' : '停用') + '</span></td>'
            + '<td>' + r.keywords.map(k => '<span class="kw">' + esc(k) + '</span>').join('') + '</td>'
            + '<td class="answer">' + esc(r.answer) + '</td></tr>').join('')
        : '<tr><td colspan="4" class="empty">目前沒有任何自動回覆規則（在 Discord 使用 /問答新增 即可新增）</td></tr>';
    } catch (e) { /* 下一輪再試 */ }
  }
  setInterval(refresh, 3000);
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(buildStatus()));
  }

  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(renderPage());
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`狀態頁已啟動：http://0.0.0.0:${PORT}`);
});
