const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, MessageFlags } = require('discord.js');
const image = require('../utils/imageGenerator');
let imageCalls = 0, imageFails = false;
image.jstToday = () => ({ y: 2026, m: 11, d: 7 });
image.generateWelcomeImage = async () => { imageCalls++; if (imageFails) throw new Error('image unavailable'); return Buffer.from('image'); };
const panel = require('../utils/welcomePanel');
const welcome = require('../utils/welcome');
const st = require('../utils/store');

function fixture() {
  const messages = new Collection(), sends = [], deletes = [];
  let sequence = 0;
  const client = { user: { id: 'bot' }, guilds: { cache: new Collection() }, channels: { fetch: async () => channel } };
  const guild = { id: panel.GUILD, client, channels: { fetch: async () => channel } };
  client.guilds.cache.set(guild.id, guild);
  const channel = { id: panel.CHANNEL, guildId: guild.id, guild, client,
    send: async payload => { sends.push(payload); return make(payload); },
    messages: {
      fetch: async arg => {
        if (typeof arg !== 'string') return new Collection([...messages].reverse().slice(0, arg.limit));
        if (!messages.has(arg)) throw Object.assign(new Error('unknown message'), { code: 10008 });
        return messages.get(arg);
      },
      delete: async id => { messages.delete(id); deletes.push(id); },
    },
  };
  function make(payload, author = 'bot') {
    const p = typeof payload === 'string' ? { content: payload } : payload;
    const m = { id: String(++sequence), guildId: guild.id, channelId: channel.id, channel, guild, client,
      author: { id: author, bot: author === 'bot' }, content: p.content, components: p.components || [], payload: p,
      delete: async () => { deletes.push(m.id); messages.delete(m.id); },
      edit: async value => { m.payload = value; m.components = value.components || m.components; return m; },
      reply: async value => channel.send(value),
    };
    messages.set(m.id, m); return m;
  }
  return { client, guild, channel, make, messages, sends, deletes };
}
async function isolated(run) {
  const save = st.save;
  st.save = async () => true; st.db.delete(panel.GUILD); imageCalls = 0; imageFails = false;
  try { await run(); } finally { st.save = save; st.db.delete(panel.GUILD); imageFails = false; }
}
function interaction(f, id) {
  const responses = [], calls = [];
  const i = { customId: id, guildId: f.guild.id, guild: f.guild, channelId: f.channel.id, channel: f.channel,
    user: { id: 'staff' }, fields: { getTextInputValue: () => '山田' }, responses,
    calls, isFromMessage: () => true,
    reply: async p => { calls.push('reply'); responses.push(p); }, update: async p => { calls.push('update'); responses.push(p); },
    editReply: async p => { calls.push('editReply'); responses.push(p); }, deferUpdate: async () => { calls.push('deferUpdate'); },
    deleteReply: async () => { calls.push('deleteReply'); i.closed = true; },
  };
  return i;
}

test('Welcome panel returns to the bottom once for concurrent bumps without losing the working controls', async () => isolated(async () => {
  const f = fixture();
  await panel.ensure(f.guild);
  const first = st.get(f.guild.id).welcomePanel.msg;
  f.make({ content: 'conversation' }, 'human');
  const before = f.sends.length;
  await Promise.all([panel.bump(f.channel), panel.bump(f.channel), panel.bump(f.channel)]);
  assert.equal(f.sends.length, before + 1);
  assert.ok(!f.messages.has(first));
  assert.equal([...f.messages.values()].at(-1).id, st.get(f.guild.id).welcomePanel.msg);
  assert.ok(f.sends.at(-1).flags & MessageFlags.SuppressNotifications);
  const working = st.get(f.guild.id).welcomePanel.msg;
  f.make({ content: 'more conversation' }, 'human');
  const send = f.channel.send;
  f.channel.send = async () => { throw new Error('send failed'); };
  await assert.rejects(panel.bump(f.channel), /send failed/);
  assert.ok(f.messages.has(working));
  f.channel.send = send;
  await panel.bump(f.channel);
  assert.ok(!f.messages.has(working));
}));

test('message receiving moves the Welcome panel after a staff message but ignores its own controls', async () => isolated(async () => {
  const f = fixture();
  await panel.ensure(f.guild);
  const event = require('../events/messageCreate');
  const inactive = require('../utils/inactive'), record = inactive.record;
  inactive.record = () => {};
  try {
    const before = f.sends.length;
    const msg = f.make({ content: '連絡です' }, 'human');
    msg.content = '連絡です';
    await event.execute(msg, f.client);
    await new Promise(resolve => setTimeout(resolve, 650));
    assert.equal(f.sends.length, before + 1);
    const control = [...f.messages.values()].at(-1);
    panel.schedule(control, f.client);
    await new Promise(resolve => setTimeout(resolve, 650));
    assert.equal(f.sends.length, before + 1);
  } finally { inactive.record = record; }
}));

test('panel booking registration and deletion are text-only while keeping daily guest data', async () => isolated(async () => {
  const f = fixture();
  await panel.handle(interaction(f, 'wel_create'));
  const submit = interaction(f, 'wel_submit');
  await panel.handle(submit);
  assert.doesNotMatch(JSON.stringify(submit.responses[0]), /画像/);
  assert.deepEqual(submit.calls, ['update']);
  const finish = interaction(f, 'wel_finish');
  await panel.handle(finish);
  assert.equal(imageCalls, 0);
  const day = st.get(f.guild.id).welcome['2026-11-07'];
  assert.equal(day.guests.length, 1);
  assert.equal(day.guests[0].name, '山田　様');
  assert.equal(day.rem, false);
  assert.ok(f.sends.every(p => !p.files?.length));
  assert.equal(f.sends.length, 1);
  assert.ok(!day.msg);
  assert.equal(finish.closed, true);
  assert.deepEqual(finish.calls, ['deferUpdate', 'deleteReply']);
  const remove = interaction(f, 'wel_confirm:' + day.guests[0].id);
  await panel.handle(remove);
  assert.equal(imageCalls, 0);
  assert.ok(!st.get(f.guild.id).welcome['2026-11-07']);
  assert.equal(remove.closed, true);
  assert.deepEqual(remove.calls, ['deferUpdate', 'deleteReply']);
}));

test('additional guests reuse one private V2 screen and starting again removes the old private view', async () => isolated(async () => {
  const f = fixture();
  const create = interaction(f, 'wel_create');
  await panel.handle(create);
  const restart = interaction(f, 'wel_create');
  await panel.handle(restart);
  assert.equal(create.closed, true);
  assert.equal(restart.calls.filter(c => c === 'reply').length, 1);
  const submit = interaction(f, 'wel_submit');
  await panel.handle(submit);
  assert.deepEqual(submit.calls, ['update']);
  assert.ok(submit.responses[0].flags & MessageFlags.IsComponentsV2);
  const next = interaction(f, 'wel_next');
  await panel.handle(next);
  assert.deepEqual(next.calls, ['update']);
  const second = interaction(f, 'wel_submit');
  second.fields.getTextInputValue = () => '佐藤';
  await panel.handle(second);
  assert.deepEqual(second.calls, ['update']);
  assert.match(JSON.stringify(second.responses[0]), /入力中：2組/);
  const finish = interaction(f, 'wel_finish');
  await panel.handle(finish);
  assert.equal(f.sends.length, 2);
  assert.equal(st.get(f.guild.id).welcome['2026-11-07'].guests.length, 2);
  assert.equal(finish.closed, true);
}));

test('startup removes existing redundant lists but preserves booking cards, legacy posts and stored guests', async () => isolated(async () => {
  const f = fixture();
  const card = f.make({ content: 'reservation card' });
  const redundant = f.make({ content: '**Welcome｜2026-11-12**\n• 13:30　山田　様　予約を見る' });
  const legacy = f.make({ content: 'old text registration' });
  const d = st.get(f.guild.id);
  d.welcome['2026-11-12'] = { ch: f.channel.id, msg: redundant.id, guests: [{ id: 'a', msg: card.id, name: '山田　様', time: '13:30' }], rem: false };
  d.welcome['2026-11-13'] = { ch: f.channel.id, msg: legacy.id, guests: [{ name: '佐藤　様', time: '10:00' }], rem: false };
  await panel.ensure(f.guild);
  assert.ok(!f.messages.has(redundant.id));
  assert.ok(f.messages.has(card.id));
  assert.ok(f.messages.has(legacy.id));
  assert.equal(d.welcome['2026-11-12'].guests.length, 1);
  assert.equal(d.welcome['2026-11-12'].msg, undefined);
  assert.equal(d.welcome['2026-11-13'].msg, legacy.id);
  assert.ok(f.sends.every(p => !p.content?.includes('予約を見る')));
}));

test('legacy text registration no longer generates an image, but 08:15 daily summary still does', async () => isolated(async () => {
  const f = fixture(), message = f.make({ content: '予約' }, 'human');
  await welcome.handle(message, { guests: [{ date: '2026-11-07', time: '10:00', name: '山田　様' }] });
  assert.equal(imageCalls, 0);
  assert.ok(f.sends.every(p => !p.files?.length));
  // The system clock may be later than reminder time; explicitly simulate a pending summary.
  st.get(f.guild.id).welcome['2026-11-07'].rem = false;
  await welcome.tick(f.client, '08:14');
  assert.equal(imageCalls, 0);
  await Promise.all([welcome.tick(f.client, '08:15'), welcome.tick(f.client, '08:15')]);
  assert.equal(imageCalls, 1);
  assert.equal(f.sends.at(-1).files.length, 1);
  await welcome.tick(f.client, '08:16');
  assert.equal(imageCalls, 1);
}));

test('daily image failures remain pending for retry rather than discarding the summary', async () => isolated(async () => {
  const f = fixture(), log = console.error;
  st.get(f.guild.id).welcome['2026-11-07'] = { ch: f.channel.id, guests: [{ date: '2026-11-07', time: '10:00', name: '山田　様' }], rem: false };
  console.error = () => {};
  try {
    imageFails = true;
    await welcome.tick(f.client, '08:15');
    assert.equal(st.get(f.guild.id).welcome['2026-11-07'].rem, false);
    imageFails = false;
    await welcome.tick(f.client, '08:16');
    assert.equal(st.get(f.guild.id).welcome['2026-11-07'].rem, true);
    assert.equal(f.sends.length, 1);
    assert.equal(f.sends[0].reply, undefined);
  } finally { console.error = log; }
}));
