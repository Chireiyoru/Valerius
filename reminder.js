// 自動提醒系統：資料讀寫 + 排程判斷（不連線 Discord，方便單元測試）
// 提醒資料格式：
// [
//   {
//     id: 'reminder_1700000000000',
//     name: '表單名稱',
//     deadline: '2026-12-01T15:59:00.000Z', // ISO 字串（UTC）
//     channelId: '123456789',
//     mentionId: '987654321',              // 可空
//     enabled: true,
//     createdBy: '111222333',
//     createdAt: '2026-11-17T15:00:00.000Z'
//   }
// ]
const fs = require('fs');

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAY_MS = 7 * DAY_MS;
// 每小時檢查一次；判斷條件用「已到提醒時間且還沒發過」，
// 所以即使機器人中途離線，重啟後仍會補發漏掉的提醒。
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;

function loadJSON(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(fallback) && !Array.isArray(data) ? fallback : data;
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadReminders(file) {
  return loadJSON(file, []);
}

function saveReminders(file, list) {
  saveJSON(file, list);
}

function loadState(file) {
  return loadJSON(file, {});
}

function saveState(file, state) {
  saveJSON(file, state);
}

// 解析「2026-12-01 23:59」這種格式，視為香港時間 (UTC+8)
function parseHongKongTime(str) {
  const m = String(str || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const utcMs = Date.UTC(y, mo - 1, d, h, mi) - HONG_KONG_OFFSET_MS;
  const date = new Date(utcMs);
  // 擋掉 2026-02-31 這種不存在的日期
  const hk = new Date(utcMs + HONG_KONG_OFFSET_MS);
  if (hk.getUTCFullYear() !== y || hk.getUTCMonth() !== mo - 1 || hk.getUTCDate() !== d) return null;
  return date;
}

// 截止時間可以存成 ISO 字串，也接受「YYYY-MM-DD HH:mm」（香港時間）
function parseDeadline(value) {
  if (value === null || value === undefined || value === '') return null;
  const hk = parseHongKongTime(value);
  if (hk) return hk.getTime();
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatDeadline(ms) {
  return new Date(ms).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });
}

// 依「現在時間 + 已發送紀錄」算出應該發出的提醒
function dueNotifications({ reminders, state, now } = {}) {
  const list = Array.isArray(reminders) ? reminders : [];
  const sent = state && typeof state === 'object' ? state : {};
  const current = Number.isFinite(now) ? now : Date.now();
  const due = [];

  for (const reminder of list) {
    if (!reminder || !reminder.enabled) continue;
    const deadlineMs = parseDeadline(reminder.deadline);
    if (deadlineMs === null) continue;

    if (current >= deadlineMs) {
      const stateKey = `${reminder.id}_expired`;
      if (!sent[stateKey]) due.push({ reminder, kind: 'expired', stateKey, deadlineMs });
      continue; // 已經過期就不再發「還有 7 天」
    }

    if (current >= deadlineMs - SEVEN_DAY_MS) {
      const stateKey = `${reminder.id}_7d`;
      if (!sent[stateKey]) due.push({ reminder, kind: '7d', stateKey, deadlineMs });
    }
  }

  return due;
}

function buildMessage({ reminder, kind, deadlineMs }) {
  const name = reminder.name || '未命名表單';
  const mention = reminder.mentionId ? `<@${reminder.mentionId}> ` : '';
  const deadlineText = formatDeadline(deadlineMs);
  if (kind === 'expired') {
    return `🚨 **時限已到**：${mention}表單 **${name}** 的填寫期限已經結束！\n截止時間：${deadlineText}（香港時間）`;
  }
  return `⏰ **提醒**：${mention}表單 **${name}** 距離截止還有 **7 天**！\n截止時間：${deadlineText}（香港時間）`;
}

function findReminder(list, id) {
  return (Array.isArray(list) ? list : []).find(r => r && r.id === id) || null;
}

// 逐筆發送到期提醒：send(item) 回傳 true 代表成功，成功後才記錄已發送，
// 避免發送失敗（例如頻道暫時不可用）時漏掉提醒。
async function deliverDue({ reminders, state, now, send } = {}) {
  const sent = state && typeof state === 'object' ? state : {};
  const due = dueNotifications({ reminders, state: sent, now });
  let changed = false;

  for (const item of due) {
    const ok = await send(item);
    if (ok) {
      sent[item.stateKey] = Number.isFinite(now) ? now : Date.now();
      changed = true;
    }
  }

  return changed;
}

module.exports = {
  DAY_MS,
  SEVEN_DAY_MS,
  CHECK_INTERVAL_MS,
  loadReminders,
  saveReminders,
  loadState,
  saveState,
  parseHongKongTime,
  parseDeadline,
  formatDeadline,
  dueNotifications,
  deliverDue,
  buildMessage,
  findReminder
};
