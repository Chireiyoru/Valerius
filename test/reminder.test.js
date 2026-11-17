// 自動提醒系統的單元測試（不需要連線 Discord）。
// 執行：npm test
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const reminder = require('../reminder');

// 讓機器人模組（系統）指向暫存資料檔，避免動到 repo 內的資料
const botTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reminder-bot-'));
process.env.FAQ_FILE = path.join(botTmpDir, 'faq-data.json');
process.env.CONFIG_FILE = path.join(botTmpDir, 'faq-config.json');
process.env.REMINDER_FILE = path.join(botTmpDir, 'reminder-data.json');
process.env.REMINDER_STATE_FILE = path.join(botTmpDir, 'reminder-state.json');
const bot = require('../系統');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// 2026-12-01 23:59 香港時間 = 2026-12-01 15:59 UTC
const DEADLINE_TEXT = '2026-12-01 23:59';
const DEADLINE_MS = Date.UTC(2026, 11, 1, 15, 59);

test('parseHongKongTime 把香港時間換成正確的 UTC 時間點', () => {
  const date = reminder.parseHongKongTime(DEADLINE_TEXT);
  assert.ok(date instanceof Date);
  assert.strictEqual(date.getTime(), DEADLINE_MS);
  assert.strictEqual(date.toISOString(), '2026-12-01T15:59:00.000Z');
});

test('parseHongKongTime 拒絕格式錯誤或不存在的時間', () => {
  assert.strictEqual(reminder.parseHongKongTime('2026/12/01 23:59'), null);
  assert.strictEqual(reminder.parseHongKongTime('2026-12-01'), null);
  assert.strictEqual(reminder.parseHongKongTime('2026-02-31 10:00'), null);
  assert.strictEqual(reminder.parseHongKongTime('2026-12-01 24:00'), null);
  assert.strictEqual(reminder.parseHongKongTime(''), null);
  assert.strictEqual(reminder.parseHongKongTime(undefined), null);
});

test('parseDeadline 同時接受香港時間字串與 ISO 字串', () => {
  assert.strictEqual(reminder.parseDeadline(DEADLINE_TEXT), DEADLINE_MS);
  assert.strictEqual(reminder.parseDeadline('2026-12-01T15:59:00.000Z'), DEADLINE_MS);
  assert.strictEqual(reminder.parseDeadline('亂寫的時間'), null);
  assert.strictEqual(reminder.parseDeadline(null), null);
});

test('距截止 7 天前才會發 7 天提醒', () => {
  const reminders = [{ id: 'r1', name: '報名表', deadline: DEADLINE_TEXT, channelId: '1', enabled: true }];

  assert.deepStrictEqual(
    reminder.dueNotifications({ reminders, state: {}, now: DEADLINE_MS - 8 * DAY }),
    []
  );

  const due = reminder.dueNotifications({ reminders, state: {}, now: DEADLINE_MS - 7 * DAY + HOUR });
  assert.strictEqual(due.length, 1);
  assert.strictEqual(due[0].kind, '7d');
  assert.strictEqual(due[0].stateKey, 'r1_7d');
});

test('7 天提醒已發送過就不會重複', () => {
  const reminders = [{ id: 'r1', name: '報名表', deadline: DEADLINE_TEXT, channelId: '1', enabled: true }];
  const state = { r1_7d: DEADLINE_MS - 7 * DAY };
  assert.deepStrictEqual(
    reminder.dueNotifications({ reminders, state, now: DEADLINE_MS - 6 * DAY }),
    []
  );
});

test('機器人離線後重啟仍會補發 7 天提醒', () => {
  const reminders = [{ id: 'r1', name: '報名表', deadline: DEADLINE_TEXT, channelId: '1', enabled: true }];
  // 距離截止只剩 2 天（錯過了 7 天那小時）
  const due = reminder.dueNotifications({ reminders, state: {}, now: DEADLINE_MS - 2 * DAY });
  assert.strictEqual(due.length, 1);
  assert.strictEqual(due[0].kind, '7d');
});

test('到期提醒只發一次，且過期後不再發 7 天提醒', () => {
  const reminders = [{ id: 'r1', name: '報名表', deadline: DEADLINE_TEXT, channelId: '1', enabled: true }];

  const first = reminder.dueNotifications({ reminders, state: {}, now: DEADLINE_MS + 1000 });
  assert.strictEqual(first.length, 1);
  assert.strictEqual(first[0].kind, 'expired');
  assert.strictEqual(first[0].stateKey, 'r1_expired');

  assert.deepStrictEqual(
    reminder.dueNotifications({ reminders, state: { r1_expired: DEADLINE_MS + 1000 }, now: DEADLINE_MS + DAY }),
    []
  );
});

test('停用的提醒與無效的截止時間會被跳過', () => {
  const reminders = [
    { id: 'off', name: '停用', deadline: DEADLINE_TEXT, channelId: '1', enabled: false },
    { id: 'bad', name: '亂寫', deadline: '明天', channelId: '1', enabled: true }
  ];
  assert.deepStrictEqual(
    reminder.dueNotifications({ reminders, state: {}, now: DEADLINE_MS + DAY }),
    []
  );
});

test('buildMessage 產生 7 天與到期兩種訊息，並包含香港時間', () => {
  const entry = { id: 'r1', name: '報名表', deadline: DEADLINE_TEXT, channelId: '1', mentionId: '999', enabled: true };
  const sevenDay = reminder.buildMessage({ reminder: entry, kind: '7d', deadlineMs: DEADLINE_MS });
  assert.ok(sevenDay.includes('還有 **7 天**'));
  assert.ok(sevenDay.includes('<@999>'));
  assert.ok(sevenDay.includes('報名表'));

  const expired = reminder.buildMessage({ reminder: entry, kind: 'expired', deadlineMs: DEADLINE_MS });
  assert.ok(expired.includes('時限已到'));

  const noMention = reminder.buildMessage({
    reminder: { ...entry, mentionId: null },
    kind: 'expired',
    deadlineMs: DEADLINE_MS
  });
  assert.ok(!noMention.includes('<@'), '沒有標註對象時不應出現 mention');
});

test('提醒資料可以讀寫，且檔案損壞時回傳空陣列', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reminder-test-'));
  const file = path.join(tmpDir, 'reminder-data.json');
  const stateFile = path.join(tmpDir, 'reminder-state.json');

  assert.deepStrictEqual(reminder.loadReminders(file), []);
  const list = [{ id: 'r1', name: '報名表', deadline: DEADLINE_TEXT, channelId: '1', enabled: true }];
  reminder.saveReminders(file, list);
  assert.deepStrictEqual(reminder.loadReminders(file), list);

  reminder.saveState(stateFile, { r1_7d: 123 });
  assert.deepStrictEqual(reminder.loadState(stateFile), { r1_7d: 123 });

  fs.writeFileSync(file, '{ 壞掉的 JSON');
  assert.deepStrictEqual(reminder.loadReminders(file), []);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('deliverDue 發送成功後記錄狀態，之後不再重複發送', async () => {
  const reminders = [{ id: 'r1', name: '報名表', deadline: DEADLINE_TEXT, channelId: '1', mentionId: '9', enabled: true }];
  const state = {};
  const sentTexts = [];
  const now = DEADLINE_MS + 1000;

  const changed = await reminder.deliverDue({
    reminders,
    state,
    now,
    send: async item => {
      sentTexts.push(reminder.buildMessage(item));
      return true;
    }
  });

  assert.strictEqual(changed, true);
  assert.strictEqual(sentTexts.length, 1);
  assert.ok(sentTexts[0].includes('時限已到'));
  assert.strictEqual(state.r1_expired, now);

  const again = await reminder.deliverDue({ reminders, state, now: now + HOUR, send: async () => true });
  assert.strictEqual(again, false);
  assert.strictEqual(sentTexts.length, 1);
});

test('deliverDue 發送失敗時不記錄狀態，下一次會重試', async () => {
  const reminders = [{ id: 'r2', name: '報名表', deadline: DEADLINE_TEXT, channelId: '1', enabled: true }];
  const state = {};

  const changed = await reminder.deliverDue({
    reminders,
    state,
    now: DEADLINE_MS - 7 * DAY,
    send: async () => false
  });
  assert.strictEqual(changed, false);
  assert.deepStrictEqual(state, {});

  const retried = await reminder.deliverDue({
    reminders,
    state,
    now: DEADLINE_MS - 6 * DAY,
    send: async () => true
  });
  assert.strictEqual(retried, true);
  assert.ok(state.r2_7d);
});

test('機器人已註冊提醒相關的斜線指令', () => {
  const byName = new Map(bot.commands.map(c => [c.name, c]));
  for (const name of ['提醒新增', '提醒列表', '提醒刪除']) {
    assert.ok(byName.has(name), `缺少指令 /${name}`);
  }

  const add = byName.get('提醒新增');
  const optionNames = add.options.map(o => o.name);
  assert.deepStrictEqual(optionNames.slice(0, 2), ['表單名稱', '截止時間']);
  assert.ok(add.options.filter(o => o.required).every(o => ['表單名稱', '截止時間'].includes(o.name)));
  assert.ok(Number(add.default_member_permissions) > 0, '提醒指令應限管理員使用');

  const del = byName.get('提醒刪除');
  assert.strictEqual(del.options.find(o => o.name === '編號').autocomplete, true);
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ ${name}`);
    } catch (error) {
      failed++;
      console.log(`❌ ${name}\n   ${error.message}`);
    }
  }

  fs.rmSync(botTmpDir, { recursive: true, force: true });
  console.log(`\n${tests.length - failed}/${tests.length} 通過`);
  process.exit(failed === 0 ? 0 : 1);
})();
