const snapshot = require('../assets/ethna/schedule.json');
const SOURCE = 'https://qenu.github.io/ethna-timeline/assets/data/schedule.json';
const DAY = 86400000;
// Server-confirmed Ignis opening. UTC arithmetic represents calendar dates in JST.
const ANCHOR = '2026-11-11';
const ANCHOR_DAY = 316;
const names = { 森之國: '森の国', 山之國: '山の国', 澤之國: '沢の国', 龍之國: '龍の国', 羽之國: '羽の国', 哈帕迪: 'ハーパティ', 伊格尼斯: 'イグニス', 艾珀希: '艾珀希（原文）' };
const categories = { 國度: '国', 轉職: '転職', 副本: 'ダンジョン', 賽季地圖: 'シーズンマップ', 古遺物: '遺物', 寵物: 'ペット', 幻獸: '幻獣', 內容: 'コンテンツ', 夥伴: '仲間', 活動: 'イベント' };

function parseDate(input) {
  const text = String(input).normalize('NFKC').trim().replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('日付は 2026-11-15 の形式で入力してください。');
  const ms = Date.parse(text + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== text) throw new Error('存在する日付を入力してください。');
  return ms;
}
const dateAt = day => new Date(parseDate(ANCHOR) + (day - ANCHOR_DAY) * DAY).toISOString().slice(0, 10);

function validate(data) {
  if (!Array.isArray(data) || data.length < 10 || data.length > 5000) throw new Error('日程データが不正です。');
  for (const e of data) {
    if (!Number.isInteger(e.day) || e.day < 1 || e.day > 10000 || typeof e.category !== 'string' ||
      !Array.isArray(e.events) || !e.events.length || !e.events.every(x => typeof x === 'string' && x.length < 1500)) throw new Error('日程データが不正です。');
  }
  if (!data.some(e => e.day === ANCHOR_DAY && e.category === '國度' && e.events[0] === '伊格尼斯')) throw new Error('基準日と元データが一致しません。');
  return data;
}

let cached, cachedAt = 0, pending;
async function load() {
  if (cached && Date.now() - cachedAt < 6 * 3600000) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(SOURCE, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      cached = { data: validate(await response.json()), fallback: false };
    } catch {
      cached = { data: cached?.data || validate(snapshot), fallback: true };
    }
    cachedAt = Date.now();
    return cached;
  })();
  try { return await pending; } finally { pending = null; }
}

function range(input, data) {
  const day = ANCHOR_DAY + Math.round((parseDate(input) - parseDate(ANCHOR)) / DAY);
  // Early kingdom unlocks do not establish a reliable season boundary in this source.
  if (day < 47) throw new Error('初期シーズンの日程は、シーズンの区切りを確認できないため表示できません。');
  const starts = data.filter(e => e.category === '國度' && e.day >= 47).sort((a, b) => a.day - b.day);
  const index = starts.findLastIndex(e => e.day <= day);
  if (index < 0) throw new Error('この日付は取得元の日程開始前です。');
  if (!starts[index + 1]) throw new Error('この日付のシーズンは、次シーズンの開始日が未公開のため最終日を確定できません。');
  const end = starts[index + 1].day - 1;
  const entries = data.filter(e => e.day >= day && e.day <= end).map(e => ({ ...e }));
  // The site's recurring events start on day 8 and rotate weekly; supplemental events start day 15.
  const secondary = ['賓果抽抽樂', '幸運刮刮樂', '菲涅克的謎題'];
  const rewards = ['当期の奇跡遺物選択', '特殊遺物（前半枠）', '転職スキルの欠片選択', '特殊遺物（後半枠）'];
  for (let d = 8; d <= end; d += 7) {
    if (d < day) continue;
    const slot = (d - 8) / 7;
    const events = ['祕寶大作戰（' + rewards[slot % 4] + '）'];
    if (slot >= 1) events.push(secondary[(slot - 1) % 3]);
    entries.push({ day: d, category: '活動', events });
  }
  entries.sort((a, b) => a.day - b.day);
  return { start: dateAt(day), end: dateAt(end), season: names[starts[index].events[0]] || starts[index].events[0], entries,
    nextSeason: { date: dateAt(starts[index + 1].day), name: starts[index + 1].events[0] } };
}

module.exports = { SOURCE, ANCHOR, parseDate, dateAt, validate, load, range, categories };
