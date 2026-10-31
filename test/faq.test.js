// 題庫比對與設定讀寫的單元測試（不需要連線 Discord）。
// 執行：npm test
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'faq-test-'));
process.env.FAQ_FILE = path.join(tmpDir, 'faq-data.json');
process.env.CONFIG_FILE = path.join(tmpDir, 'faq-config.json');

const {
  DEFAULT_CONFIG,
  normalize,
  matchScore,
  findBestMatch,
  loadFaq,
  saveFaq,
  loadConfig,
  saveConfig
} = require('../系統');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const faq = [
  { id: 'rule_a', keywords: ['簽到', '每日'], answer: '請使用 /簽到 指令。', enabled: true },
  { id: 'rule_b', keywords: ['簽到'], answer: '簽到在頻道 #daily。', enabled: true },
  { id: 'rule_c', keywords: ['抽獎'], answer: '抽獎已停辦。', enabled: false },
  { id: 'rule_d', keywords: [], answer: '沒有關鍵字。', enabled: true }
];

test('normalize 會轉小寫並壓縮空白', () => {
  assert.strictEqual(normalize('  Hello   WORLD \n'), 'hello world');
  assert.strictEqual(normalize(null), '');
});

test('matchScore 計算命中關鍵字數量', () => {
  assert.strictEqual(matchScore('今天要每日簽到一下', faq[0]), 2);
  assert.strictEqual(matchScore('今天要簽到嗎', faq[0]), 1);
  assert.strictEqual(matchScore('完全無關', faq[0]), 0);
});

test('英文關鍵字不分大小寫', () => {
  const rule = { id: 'r', keywords: ['Discord'], answer: 'x', enabled: true };
  assert.strictEqual(matchScore('how do i use discord?', rule), 1);
});

test('findBestMatch 取得分數最高的規則', () => {
  const { rule, score } = findBestMatch('每日簽到', faq);
  assert.strictEqual(rule.id, 'rule_a');
  assert.strictEqual(score, 2);
});

test('findBestMatch 忽略已停用的規則', () => {
  const { rule, score } = findBestMatch('想抽獎', faq);
  assert.strictEqual(rule, null);
  assert.strictEqual(score, 0);
});

test('findBestMatch 忽略沒有關鍵字的規則', () => {
  const { rule } = findBestMatch('任何內容', faq);
  assert.strictEqual(rule, null);
});

test('findBestMatch 沒有命中時回傳 null', () => {
  const { rule, score } = findBestMatch('今天天氣很好', faq);
  assert.strictEqual(rule, null);
  assert.strictEqual(score, 0);
});

test('設定檔讀取會補上預設值', () => {
  fs.writeFileSync(process.env.CONFIG_FILE, JSON.stringify({ cooldownSeconds: 5 }));
  const cfg = loadConfig();
  assert.strictEqual(cfg.cooldownSeconds, 5);
  assert.strictEqual(cfg.enabled, DEFAULT_CONFIG.enabled);
  assert.deepStrictEqual(cfg.channelIds, []);
});

test('題庫可以寫入後再讀回', () => {
  saveFaq(faq);
  assert.deepStrictEqual(loadFaq(), faq);
  const cfg = { ...DEFAULT_CONFIG, cooldownSeconds: 30, channelIds: ['123'] };
  saveConfig(cfg);
  assert.deepStrictEqual(loadConfig(), cfg);
});

test('題庫檔不存在時回傳空陣列', () => {
  fs.rmSync(process.env.FAQ_FILE, { force: true });
  assert.deepStrictEqual(loadFaq(), []);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    failed++;
    console.log(`❌ ${name}\n   ${error.message}`);
  }
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n${tests.length - failed}/${tests.length} 通過`);
process.exit(failed === 0 ? 0 : 1);
