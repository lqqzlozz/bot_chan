const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const st = require('../utils/store');
const { GUILD } = require('../utils/entryScope');
const schedule = require('../utils/seasonSchedule');
const posts = require('../utils/seasonPosts');
const { translate, NOTICE } = require('../utils/seasonText');
const data = require('../assets/ethna/schedule.json');

function fixture() {
  const messages = new Collection(), sent = [], replies = [];
  let nextId = 0;
  function make(payload) {
    const m = { id: String(++nextId), author: { id: 'bot' }, embeds: payload.embeds.map(e => e.toJSON()),
      edit: async p => { m.embeds = p.embeds.map(e => e.toJSON()); return m; },
      reply: async p => { const reply = make(p); replies.push({ originalId: m.id, payload: p, message: reply }); return reply; } };
    messages.set(m.id, m); return m;
  }
  const channel = { id: posts.CHANNEL_ID, guild: { id: GUILD },
    send: async p => { const m = make(p); sent.push(m); return m; },
    messages: { fetch: async arg => {
      if (typeof arg !== 'string') return messages;
      if (!messages.has(arg)) throw Object.assign(new Error('deleted'), { code: 10008 });
      return messages.get(arg);
    } } };
  return { channel, messages, sent, replies, client: { user: { id: 'bot' }, channels: { fetch: async () => channel } } };
}
async function withStore(run) {
  const save = st.save; st.save = async () => true; st.db.delete(GUILD);
  try { await run(); } finally { st.save = save; st.db.delete(GUILD); }
}

test('display rules preserve names while translating difficulty, labels and numeric magnitudes', () => {
  assert.equal(translate('起源之門-深淵(戰力需求: 18 億)'), '起源の門-アビス(戦力: 1.8B)');
  assert.equal(translate('820萬 8200萬 1.56 億'), '8.2M 82M 0.156B');
  assert.equal(translate('伊格尼斯 國度 古遺物 普通 困難 惡夢 煉獄'), 'イグニス 国 遺物 ノーマル ハード ナイトメア ヘル');
  assert.equal(translate('剑之门-普通(战力要求: 820万)'), '剣の門-ノーマル(戦力: 8.2M)');
  assert.match(NOTICE, /あんまちゃんが定めたルール/);
});

test('each date is its own public post with notice; next season stays in last-day note', () => {
  const result = schedule.range('2026-11-11', data), days = posts.buildDays(result, false);
  assert.equal(new Set(days.map(d => d.date)).size, days.length);
  assert.ok(days.every(d => d.date >= result.start && d.date <= result.end));
  const end = days.at(-1);
  assert.equal(end.date, '2027-02-19');
  assert.match(end.embeds[0].toJSON().description, /2027-02-20 08:00/);
  for (const day of days) for (const embed of day.embeds) {
    const e = embed.toJSON();
    assert.equal(e.title, day.date);
    assert.ok(e.description.length <= 4096);
    assert.ok(JSON.stringify(e).length < 6000);
    assert.equal(e.fields[0].value, NOTICE);
    assert.doesNotMatch(e.description, /戰力需求|普通|困難|惡夢|煉獄|之/);
  }
});

test('only dungeon/relic/next-season reminders are planned at requested offsets', () => {
  const result = schedule.range('2026-11-11', data), days = posts.buildDays(result, false);
  const jobs = days.flatMap(d => posts.jobsFor(d, result, 'message'));
  const opening = jobs.filter(j => j.targetDate === '2026-11-11');
  assert.deepEqual(opening.filter(j => j.kind === 'ダンジョン').map(j => j.due), ['2026-11-04', '2026-11-09']);
  assert.deepEqual(opening.filter(j => j.kind === '遺物').map(j => j.due), ['2026-11-01', '2026-11-08']);
  assert.ok(jobs.every(j => ['ダンジョン', '遺物', '次シーズン'].includes(j.kind)));
  assert.deepEqual(jobs.filter(j => j.kind === '次シーズン').map(j => j.due), ['2027-01-20', '2027-02-13', '2027-02-19']);
  assert.equal(posts.monthBefore('2027-03-31'), '2027-02-28');
  assert.equal(posts.monthBefore('2028-03-31'), '2028-02-29');
});

test('publishing twice and restoring persisted data reuse dated posts and retain reminders', async () => withStore(async () => {
  const f = fixture(), result = schedule.range('2027-02-01', data);
  await posts.publish(f.channel, 'bot', result, false);
  const count = f.sent.length;
  const persisted = JSON.parse(JSON.stringify(st.get(GUILD)));
  st.db.set(GUILD, persisted);
  await posts.publish(f.channel, 'bot', result, false);
  assert.equal(f.sent.length, count);
  assert.ok(Object.keys(st.get(GUILD).seasonSchedulePosts.jobs).length > 0);
}));

test('08:00 JST starts a game day; sends once as reply to matching post across restart/concurrency', async () => withStore(async () => {
  const f = fixture(), result = schedule.range('2027-02-01', data);
  await posts.publish(f.channel, 'bot', result, false);
  await posts.tick(f.client, Date.parse('2027-02-13T07:59:59+09:00'));
  assert.equal(f.replies.length, 0);
  await Promise.all([posts.tick(f.client, Date.parse('2027-02-13T08:00:00+09:00')), posts.tick(f.client, Date.parse('2027-02-13T08:00:00+09:00'))]);
  assert.equal(f.replies.length, 1);
  const reply = f.replies[0];
  assert.equal(reply.originalId, st.get(GUILD).seasonSchedulePosts.dates['2027-02-19'].ids[0]);
  assert.equal(reply.payload.allowedMentions.repliedUser, false);
  assert.equal(reply.payload.flags, undefined);
  assert.equal(reply.payload.embeds[0].toJSON().title, '2027-02-20');
  st.db.set(GUILD, JSON.parse(JSON.stringify(st.get(GUILD))));
  await posts.tick(f.client, Date.parse('2027-02-14T07:59:00+09:00'));
  assert.equal(f.replies.length, 1);
}));

test('failed persistence prevents new sends and interrupted publication recovers by footer', async () => withStore(async () => {
  const f = fixture(), result = schedule.range('2027-02-19', data);
  st.save = async () => false;
  await assert.rejects(posts.publish(f.channel, 'bot', result, false), /保存/);
  assert.equal(f.sent.length, 0);
  let calls = 0, persisted;
  st.save = async () => { calls++; if (calls === 1) { persisted = JSON.parse(JSON.stringify(st.get(GUILD))); return true; } return false; };
  await assert.rejects(posts.publish(f.channel, 'bot', result, false), /保存/);
  assert.equal(f.sent.length, 1);
  st.db.set(GUILD, persisted);
  st.save = async () => true;
  await posts.publish(f.channel, 'bot', result, false);
  assert.equal(f.sent.length, 1);
}));

test('relic and dungeon alerts reply to their date post and exclude other event lines', async () => withStore(async () => {
  const f = fixture(), result = schedule.range('2026-11-11', data);
  await posts.publish(f.channel, 'bot', result, false);
  const originalId = st.get(GUILD).seasonSchedulePosts.dates['2026-11-11'].ids[0];
  await posts.tick(f.client, Date.parse('2026-11-08T08:00:00+09:00'));
  assert.equal(f.replies.length, 1);
  assert.equal(f.replies[0].originalId, originalId);
  assert.match(f.replies[0].payload.embeds[0].toJSON().description, /遺物まで3日/);
  assert.doesNotMatch(f.replies[0].payload.embeds[0].toJSON().description, /・ダンジョン|・イベント/);
  await posts.tick(f.client, Date.parse('2026-11-09T08:00:00+09:00'));
  assert.equal(f.replies.length, 2);
  assert.equal(f.replies[1].originalId, originalId);
  assert.match(f.replies[1].payload.embeds[0].toJSON().description, /ダンジョンまで2日/);
  assert.doesNotMatch(f.replies[1].payload.embeds[0].toJSON().description, /・遺物|・イベント/);
}));

test('reminder recovers interrupted reply, skips deleted targets and never sends when save fails', async () => withStore(async () => {
  const f = fixture(), result = schedule.range('2027-02-01', data);
  await posts.publish(f.channel, 'bot', result, false);
  const time = Date.parse('2027-02-13T08:00:00+09:00');
  st.save = async () => false;
  await assert.rejects(posts.tick(f.client, time), /保存/);
  assert.equal(f.replies.length, 0);
  let persisted, calls = 0;
  st.save = async () => { calls++; if (calls === 1) { persisted = JSON.parse(JSON.stringify(st.get(GUILD))); return true; } return false; };
  await assert.rejects(posts.tick(f.client, time), /保存/);
  assert.equal(f.replies.length, 1);
  st.db.set(GUILD, persisted); st.save = async () => true;
  await posts.tick(f.client, time);
  assert.equal(f.replies.length, 1);
  const job = Object.values(st.get(GUILD).seasonSchedulePosts.jobs).find(j => j.kind === '次シーズン' && j.label === '前日');
  f.messages.delete(job.messageId);
  await posts.tick(f.client, Date.parse('2027-02-19T08:00:00+09:00'));
  assert.equal(f.replies.length, 1);
}));
