const http = require('http');

// 小型的唯讀狀態頁面。只用來在預覽中確認機器人是否正常運作，
// 不會修改任何設定或題庫資料。
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label, value, tone) {
  return `<div class="row"><span class="k">${esc(label)}</span><span class="v ${tone || ''}">${esc(value)}</span></div>`;
}

function inviteUrl(clientId) {
  if (!clientId) return null;
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot%20applications.commands&permissions=2147567616`;
}

function render(status) {
  const invite = inviteUrl(status.clientId);
  const warnings = [];

  if (!status.ready) warnings.push('機器人尚未連上 Discord（請看下方錯誤訊息）。');
  if (status.ready && status.guilds === 0) warnings.push('機器人目前不在任何伺服器，邀請它加入後才會開始運作。');
  if (status.commandError) warnings.push(`斜線指令註冊失敗：${status.commandError}`);
  if (status.lastError && /disallowed intents/i.test(status.lastError)) {
    warnings.push('Discord 後台未開啟「Message Content Intent」權限：Developer Portal → Bot → Privileged Gateway Intents 開啟後重新啟動。');
  }
  if (status.lastError && /invalid token|an invalid token/i.test(status.lastError)) {
    warnings.push('TOKEN 無效，請更新 TOKEN 環境變數。');
  }

  const warnHtml = warnings.length
    ? `<div class="warn">${warnings.map(w => `<p>⚠️ ${esc(w)}</p>`).join('')}</div>`
    : `<div class="ok"><p>✅ 機器人運作正常</p></div>`;

  const errHtml = status.lastError
    ? `<div class="err"><p>錯誤：${esc(status.lastError)}</p></div>`
    : '';

  const inviteHtml = invite && status.guilds === 0
    ? `<p class="invite"><a href="${esc(invite)}">邀請機器人加入伺服器</a></p>`
    : '';

  const cfg = status.config || {};
  const channels = Array.isArray(cfg.channelIds) && cfg.channelIds.length
    ? cfg.channelIds.map(id => `#${id}`).join('、')
    : '全群生效';

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>自動回覆機器人狀態</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px; min-height: 100vh;
    background: #1e1f22; color: #dbdee1;
    font-family: "Helvetica Neue", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif;
  }
  main { max-width: 680px; margin: 0 auto; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; color: #f2f3f5; }
  .sub { font-size: 13px; color: #949ba4; margin: 0 0 24px; }
  .card { background: #2b2d31; border: 1px solid #3f4147; border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
  .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #949ba4; margin: 0 0 12px; font-weight: 600; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px solid #35373c; font-size: 14px; }
  .row:last-child { border-bottom: 0; }
  .k { color: #949ba4; flex: 0 0 auto; }
  .v { text-align: right; word-break: break-word; }
  .good { color: #57f287; } .bad { color: #ed4245; }
  .ok, .warn, .err { border-radius: 10px; padding: 14px 18px; margin-bottom: 16px; font-size: 14px; }
  .ok { background: #1c3d2b; border: 1px solid #2b6b48; color: #a5f0c3; }
  .warn { background: #3d3113; border: 1px solid #6b551f; color: #f7e39b; }
  .err { background: #3d1c1f; border: 1px solid #6b2b31; color: #f7b3b8; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  .ok p, .warn p, .err p { margin: 4px 0; }
  .invite a { color: #5865f2; }
  footer { font-size: 12px; color: #6d6f78; text-align: center; }
</style>
</head>
<body>
<main>
  <h1>自動回覆機器人狀態</h1>
  <p class="sub">每 10 秒自動更新 · ${esc(new Date().toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' }))}</p>
  ${warnHtml}
  ${errHtml}
  ${inviteHtml}

  <div class="card">
    <h2>機器人</h2>
    ${row('連線狀態', status.ready ? '已上線 🟢' : '未連線 🔴', status.ready ? 'good' : 'bad')}
    ${row('帳號', status.botTag || '尚未登入')}
    ${row('所在伺服器數', status.guilds)}
    ${row('設定的伺服器 ID', status.configuredGuildId || '未設定')}
    ${row('已註冊斜線指令', status.commandCount)}
    ${row('運行時間', status.uptime)}
  </div>

  <div class="card">
    <h2>自動回覆</h2>
    ${row('題庫規則', `${status.faqCount} 條（啟用 ${status.enabledRules} 條）`)}
    ${row('總開關', cfg.enabled ? '啟用 🟢' : '停用 🔴', cfg.enabled ? 'good' : 'bad')}
    ${row('限定頻道', channels)}
    ${row('冷卻秒數', cfg.cooldownSeconds)}
    ${row('命中門檻', cfg.minMatchScore)}
    ${row('回覆格式', cfg.replyWithEmbed ? 'Embed' : '純文字')}
  </div>

  <footer>Luxien · Valerius FAQ Bot</footer>
</main>
</body>
</html>`;
}

module.exports = function startStatusServer({ port, getStatus }) {
  const server = http.createServer((req, res) => {
    const path = String(req.url || '/').split('?')[0];

    let status;
    try {
      status = getStatus();
    } catch (err) {
      status = { lastError: String(err && err.message ? err.message : err) };
    }

    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ process: 'ok', discord_ready: Boolean(status.ready) }));
      return;
    }

    if (path === '/status.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(status));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(render(status));
  });

  server.listen(Number(port), '0.0.0.0', () => {
    console.log(`狀態頁面已啟動：http://0.0.0.0:${port}`);
  });

  return server;
};
