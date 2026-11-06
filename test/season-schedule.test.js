const { test } = require('node:test');
const assert = require('node:assert/strict');
const schedule = require('../utils/seasonSchedule');
const panel = require('../utils/seasonPanel');
const data = require('../assets/ethna/schedule.json');
const { GUILD } = require('../utils/entryScope');
const { MessageFlags } = require('discord.js');

test('date input rejects impossible dates and accepts full-width and slashes', () => {
  for (const date of ['2026-02-29', '2026-11-31', '2026-13-01', '26-11-11', 'tomorrow']) assert.throws(() => schedule.parseDate(date));
  assert.equal(schedule.parseDate('２０２６/１１/１５'), schedule.parseDate('2026-11-15'));
});

test('requested date is inclusive and the next season is excluded across year change', () => {
  assert.equal(schedule.validate(data), data);
  const result = schedule.range('2026-12-01', data);
  assert.equal(result.start, '2026-12-01');
  assert.equal(result.end, '2027-02-19');
  assert.equal(result.season, 'イグニス');
  assert.ok(result.entries.length > 0);
  assert.ok(result.entries.every(e => schedule.dateAt(e.day) >= result.start && e.day < 417));
  const opening = schedule.range('2026-11-11', data);
  assert.ok(opening.entries.some(e => e.category === '國度' && e.day === 316));
  const previous = schedule.range('2026-11-10', data);
  assert.equal(previous.season, 'ハーパティ');
  assert.equal(previous.end, '2026-11-10');
  const last = schedule.range('2027-02-19', data);
  assert.equal(last.end, last.start);
  assert.throws(() => schedule.range('2027-02-20', data), /未公開/);
  assert.throws(() => schedule.range('2025-01-01', data), /初期シーズン/);
});

test('weekly generated events follow original day 8 cadence through requested season', () => {
  const result = schedule.range('2026-11-11', data);
  const weekly = result.entries.filter(e => e.category === '活動');
  assert.equal(weekly.length, 15);
  assert.ok(weekly.every(e => (e.day - 8) % 7 === 0 && e.events.length === 2));
});

test('result pages fit Discord limits, retain every entry and show source/fallback', () => {
  const result = schedule.range('2026-11-11', data);
  const pages = panel.embeds(result, true).map(e => e.toJSON());
  assert.ok(pages.length > 0);
  assert.ok(pages.every(e => e.description.length <= 4096 && JSON.stringify(e).length < 6000));
  assert.ok(pages.every(e => e.fields[0].value.includes('保存済み')));
  const text = pages.map(e => e.description).join('\n');
  for (const entry of result.entries) assert.ok(text.includes(schedule.dateAt(entry.day)));
});

test('member button opens modal, rejects other guilds and rejects invalid dates before fetching', async () => {
  let modal, payload;
  await panel.handle({ guildId: GUILD, customId: 'season_open', isButton: () => true, showModal: async value => { modal = value.toJSON(); } });
  assert.equal(modal.custom_id, 'season_date');
  await panel.handle({ guildId: 'other', reply: async p => { payload = p; } });
  assert.ok(payload.flags & MessageFlags.Ephemeral);
  await panel.handle({ guildId: GUILD, customId: 'season_date', isButton: () => false, isModalSubmit: () => true, fields: { getTextInputValue: () => '2026-02-30' }, reply: async p => { payload = p; } });
  assert.match(payload.content, /存在/);
});

test('source failure uses snapshot and a valid modal returns private dated embeds', async () => {
  const original = global.fetch;
  global.fetch = async () => { throw new Error('offline'); };
  const replies = [];
  try {
    await panel.handle({ guildId: GUILD, customId: 'season_date', isButton: () => false, isModalSubmit: () => true,
      fields: { getTextInputValue: () => '2026-12-01' }, deferReply: async p => replies.push(p), editReply: async p => replies.push(p), followUp: async p => replies.push(p) });
    assert.equal(replies[0].flags, MessageFlags.Ephemeral);
    assert.match(replies[1].embeds[0].toJSON().title, /2026-12-01〜2027-02-19/);
    for (const p of replies.slice(2)) assert.equal(p.flags, MessageFlags.Ephemeral);
  } finally { global.fetch = original; }
});

test('management panel offers schedule only in Entry guild and public panel is reusable', () => {
  const preview = require('../utils/panelTestPreview');
  const own = JSON.stringify(preview.render('home', 'off', GUILD));
  const other = JSON.stringify(preview.render('home', 'off', 'other'));
  assert.ok(own.includes('杖と剣の伝説'));
  assert.ok(!other.includes('杖と剣の伝説'));
  assert.ok(JSON.stringify(preview.render('season', 'off', GUILD)).includes('pt_season_channel'));
  assert.equal(panel.panel().components[0].toJSON().components[0].custom_id, 'season_open');
});

test('installation stores the panel and repeats update it without duplicate posts', async () => {
  const st = require('../utils/store');
  const original = st.save;
  let sends = 0, edits = 0;
  const message = { id: 'panel', author: { id: 'bot' }, edit: async () => { edits++; } };
  const channel = { id: 'schedule', isTextBased: () => true, messages: { fetch: async () => message }, send: async () => { sends++; return message; } };
  const i = { guildId: GUILD, guild: { channels: { fetch: async () => channel } }, values: ['schedule'], client: { user: { id: 'bot' } }, deferReply: async () => {}, editReply: async () => {} };
  st.save = async () => true;
  try {
    await panel.place(i);
    await panel.place(i);
    assert.equal(sends, 1);
    assert.equal(edits, 1);
    assert.deepEqual(st.get(GUILD).seasonPanel, { channelId: 'schedule', messageId: 'panel' });
  } finally { st.save = original; st.db.delete(GUILD); }
});
