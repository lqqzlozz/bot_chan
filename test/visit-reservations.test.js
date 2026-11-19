const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, ChannelType } = require('discord.js');
const st = require('../utils/store');
const model = require('../utils/visitReservations');
const panel = require('../utils/visitPanel');

const base = { venues: [], bookings: [] };

test('venue identity survives renames and normalized duplicate names are rejected', () => {
  const data = structuredClone(base);
  const venue = model.addVenue(data, ' 札幌　会場 ');
  assert.throws(() => model.addVenue(data, '札幌 会場'), /同じ名前/);
  model.addBooking(data, { venueId: venue.id, date: '2026-11-28', time: '09:30', name: '山田 様' }, '2026-11-01');
  model.renameVenue(data, venue.id, '札幌見学会場');
  assert.equal(data.bookings[0].venueId, venue.id);
  assert.equal(data.bookings[0].name, '山田');
  assert.equal(data.venues[0].name, '札幌見学会場');
});

test('only booked dates appear, fixed half-hour slots and exceptional times stay visible', () => {
  const data = structuredClone(base), venue = model.addVenue(data, '見学会場');
  for (const [date, time] of [['2026-11-28', '09:30'], ['2026-11-29', '10:15'], ['2026-12-05', '17:30']]) {
    model.addBooking(data, { venueId: venue.id, date, time, name: '山田' }, '2026-11-01');
  }
  const view = model.schedule(data, venue.id, 0, '2026-11-01');
  assert.deepEqual(view.dates, ['2026-11-28', '2026-11-29', '2026-12-05']);
  assert.equal(view.times.length, 18);
  assert.equal(view.times[0], '09:30');
  assert.equal(view.times.at(-1), '17:30');
  assert.ok(view.times.includes('12:30'));
  assert.ok(!view.dates.includes('2026-11-30'));
  const later = model.schedule(data, venue.id, 0, '2026-12-01');
  assert.deepEqual(later.dates, ['2026-12-05']);
  assert.ok(!later.times.includes('09:30'));
});

test('three days per image bounds width, pages clamp after cancellation and empty days vanish', () => {
  const data = structuredClone(base), venue = model.addVenue(data, '会場');
  for (let day = 1; day <= 9; day++) model.addBooking(data, { venueId: venue.id, date: `2026-12-0${day}`, time: '10:00', name: '山田' }, '2026-11-01');
  assert.equal(model.schedule(data, venue.id, 99, '2026-11-01').page, 2);
  assert.equal(model.schedule(data, venue.id, 0, '2026-11-01').dates.length, 3);
  assert.equal(model.schedule(data, venue.id, 1, '2026-11-01').dates[0], '2026-12-04');
  data.bookings = data.bookings.slice(0, 1);
  const view = model.schedule(data, venue.id, 2, '2026-11-01');
  assert.equal(view.page, 0);
  assert.equal(view.pages, 1);
  assert.deepEqual(view.dates, ['2026-12-01']);
});

test('retries deduplicate an identical booking while multiple guests can share one time', () => {
  const data = structuredClone(base), venue = model.addVenue(data, '会場');
  const booking = { venueId: venue.id, date: '2026-11-28', time: '10:00', name: '山田' };
  const first = model.addBooking(data, booking, '2026-11-01');
  assert.equal(model.addBooking(data, { ...booking, name: '山田　様' }, '2026-11-01').id, first.id);
  model.addBooking(data, { ...booking, name: '佐藤' }, '2026-11-01');
  assert.equal(data.bookings.length, 2);
  assert.throws(() => model.addBooking(data, { ...booking, date: '2026-02-30' }, '2026-01-01'), /日時/);
  assert.throws(() => model.addBooking(data, { ...booking, time: '24:00' }, '2026-11-01'), /日時/);
  assert.throws(() => model.addBooking(data, booking, '2026-12-01'), /日時/);
});

function fixture() {
  let sequence = 0;
  const messages = new Collection(), sends = [], edits = [];
  const client = { user: { id: 'bot' }, guilds: { cache: new Collection() } };
  const guild = { id: model.GUILD, client, members: { me: {} }, channels: { fetch: async () => channel } };
  const channel = { id: 'visit-channel', type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }),
    send: async value => {
      sends.push(value);
      const message = { id: String(++sequence), author: client.user, embeds: value.embeds.map(item => item.toJSON()),
        components: value.components.map(item => ({ components: item.components.map(button => ({ customId: button.data.custom_id })) })),
        edit: async value => { edits.push(value); message.embeds = value.embeds.map(item => item.toJSON()); return message; },
        delete: async () => messages.delete(message.id) };
      messages.set(message.id, message);
      return message;
    }, messages: { fetch: async id => {
      if (typeof id === 'object') return messages;
      if (!messages.has(id)) throw Object.assign(new Error('unknown message'), { code: 10008 });
      return messages.get(id);
    } },
  };
  client.guilds.cache.set(guild.id, guild);
  function interaction(customId, values = []) {
    const responses = [];
    return { guild, guildId: guild.id, channel, channelId: channel.id, client, user: { id: 'staff' },
      memberPermissions: { has: () => true }, customId, values, message: [...messages.values()].at(-1), responses,
      fields: { getTextInputValue: () => '山田' },
      reply: async value => { responses.push(value); },
      update: async value => { responses.push(value); },
      editReply: async value => { responses.push(value); },
      showModal: async value => { responses.push(value); },
      deferUpdate: async () => {}, deleteReply: async () => {},
    };
  }
  return { client, guild, channel, sends, edits, messages, interaction };
}

async function isolated(run) {
  const save = st.save;
  st.save = async () => true;
  st.db.delete(model.GUILD);
  try { await run(); } finally { st.save = save; st.db.delete(model.GUILD); }
}

function idFrom(response, suffix) {
  const components = response.components.flatMap(item => item.toJSON().components || []);
  return components.find(item => item.custom_id?.endsWith(':' + suffix)).custom_id;
}

test('save failure rolls back reservations and concurrent successful registrations both persist', async () => isolated(async () => {
  const f = fixture(), venue = model.addVenue(model.config(f.guild.id), '会場');
  st.save = async () => false;
  await assert.rejects(model.serialized(f.guild.id, () => model.saveChange(f.guild, data => model.addBooking(data, { venueId: venue.id, date: model.today(), time: '10:00', name: '山田' }))), /保存/);
  assert.equal(model.config(f.guild.id).bookings.length, 0);
  st.save = async () => { await new Promise(resolve => setTimeout(resolve, 2)); return true; };
  await Promise.all(['山田', '佐藤'].map(name => model.serialized(f.guild.id, () => model.saveChange(f.guild, data => model.addBooking(data, { venueId: venue.id, date: model.today(), time: '10:00', name })))));
  assert.equal(model.config(f.guild.id).bookings.length, 2);
}));

test('board registration updates one persistent post, restart restores it and cancellation removes the date', async () => isolated(async () => {
  const f = fixture(), data = model.config(f.guild.id), venue = model.addVenue(data, '札幌会場');
  venue.channelId = f.channel.id;
  await panel.tick(f.client, true);
  assert.equal(f.sends.length, 1);
  const boardId = venue.messageId;
  const start = f.interaction('visit_book:' + venue.id);
  await panel.handle(start);
  const date = start.responses[0];
  for (const component of date.components) component.toJSON();
  const sessionId = idFrom(date, 'time').split(':')[1];
  const name = f.interaction(`visit_session:${sessionId}:name`);
  await panel.handle(name);
  assert.doesNotThrow(() => name.responses[0].toJSON());
  await panel.handle(f.interaction(`visit_session:${sessionId}:submit`));
  assert.equal(data.bookings.length, 1);
  assert.equal(f.sends.length, 1);
  assert.equal(venue.messageId, boardId);
  assert.ok(f.edits.at(-1).files[0].attachment.length > 1000);
  const snapshot = JSON.parse(JSON.stringify(data));
  st.get(f.guild.id).visitReservations = snapshot;
  await panel.tick(f.client, true);
  assert.equal(f.sends.length, 1);
  const remove = f.interaction('visit_cancel:' + venue.id);
  await panel.handle(remove);
  const pickId = idFrom(remove.responses[0], 'cancel_pick');
  const pick = f.interaction(pickId, [snapshot.bookings[0].id]);
  await panel.handle(pick);
  await panel.handle(f.interaction(idFrom(pick.responses[0], 'cancel_confirm')));
  assert.equal(model.config(f.guild.id).bookings.length, 0);
  assert.equal(f.edits.at(-1).files.length, 0);
  assert.equal(f.edits.at(-1).attachments.length, 0);
}));

test('a failed image update keeps saved bookings and is retried by the regular tick', async () => isolated(async () => {
  const f = fixture(), venue = model.addVenue(model.config(f.guild.id), '会場');
  venue.channelId = f.channel.id;
  await panel.tick(f.client, true);
  const message = f.messages.get(venue.messageId), edit = message.edit;
  message.edit = async () => { throw new Error('temporary API failure'); };
  const start = f.interaction('visit_book:' + venue.id);
  await panel.handle(start);
  const sessionId = idFrom(start.responses[0], 'time').split(':')[1];
  const submit = f.interaction(`visit_session:${sessionId}:submit`);
  await panel.handle(submit);
  assert.equal(model.config(f.guild.id).bookings.length, 1);
  assert.equal(venue.dirty, true);
  assert.match(submit.responses[0].embeds[0].toJSON().description, /保存されています/);
  message.edit = edit;
  await panel.tick(f.client);
  assert.equal(venue.dirty, false);
  assert.equal(f.sends.length, 1);
}));

test('management supports venue registration before a channel exists and authenticates every interaction', async () => isolated(async () => {
  const f = fixture(), open = f.interaction();
  await panel.openManagement(open);
  const addId = idFrom(open.responses[0], 'add');
  const stranger = f.interaction(addId); stranger.user.id = 'stranger';
  await panel.handle(stranger);
  assert.match(stranger.responses[0].embeds[0].toJSON().description, /自分で/);
  const add = f.interaction(addId); await panel.handle(add);
  assert.doesNotThrow(() => add.responses[0].toJSON());
  const submit = f.interaction(add.responses[0].data.custom_id);
  submit.fields.getTextInputValue = () => '見学会場';
  await panel.handle(submit);
  const venue = model.config(f.guild.id).venues[0];
  assert.equal(venue.name, '見学会場');
  assert.equal(venue.channelId, null);
  const channelId = idFrom(submit.responses[0], 'channel');
  const denied = f.interaction(channelId, [f.channel.id]); denied.memberPermissions.has = () => false;
  await panel.handle(denied);
  assert.equal(venue.channelId, null);
  const target = f.interaction(channelId, [f.channel.id]);
  await panel.handle(target);
  assert.equal(venue.channelId, f.channel.id);
  assert.equal(f.sends.length, 1);
  assert.ok(!JSON.stringify(target.responses).includes('"flags":64'));
}));

test('command registration exposes visit only to the company guild', () => {
  const command = require('../commands/visit');
  const { guildCommands } = require('../utils/registerCommands');
  const client = { commands: new Collection([['visit', command]]) };
  assert.equal(guildCommands(client, model.GUILD)[0].name, 'visit');
  assert.equal(guildCommands(client, 'other-guild').length, 0);
});

test('lost board metadata recovers the original message and a deleted post is replaced once', async () => isolated(async () => {
  const f = fixture(), venue = model.addVenue(model.config(f.guild.id), '会場');
  venue.channelId = f.channel.id;
  await panel.tick(f.client, true);
  const original = venue.messageId;
  venue.messageId = null;
  await panel.tick(f.client, true);
  assert.equal(venue.messageId, original);
  assert.equal(f.sends.length, 1);
  f.messages.delete(original);
  await panel.tick(f.client, true);
  assert.equal(f.sends.length, 2);
  assert.notEqual(venue.messageId, original);
}));

test('designated channel is persisted and its setup button creates venues with an automatic board', async () => isolated(async () => {
  const f = fixture();
  f.channel.id = model.DEFAULT_CHANNEL;
  const data = model.config(f.guild.id);
  const unassigned = model.addVenue(data, '未設定の会場');
  const elsewhere = model.addVenue(data, '別の会場');
  elsewhere.channelId = 'other-channel';
  await panel.ensureSetup(f.client);
  assert.equal(data.channelId, model.DEFAULT_CHANNEL);
  assert.equal(unassigned.channelId, model.DEFAULT_CHANNEL);
  assert.equal(elsewhere.channelId, 'other-channel');
  const original = data.setupMessageId;
  await panel.ensureSetup(f.client);
  assert.equal(f.sends.length, 1);
  delete data.setupMessageId;
  await panel.ensureSetup(f.client);
  assert.equal(data.setupMessageId, original);
  assert.equal(f.sends.length, 1);
  const denied = f.interaction('visit_manage'); denied.memberPermissions.has = () => false;
  await panel.handle(denied);
  assert.match(denied.responses[0].embeds[0].toJSON().description, /管理者/);
  const open = f.interaction('visit_manage');
  await panel.handle(open);
  const add = f.interaction(idFrom(open.responses[0], 'add'));
  await panel.handle(add);
  const submit = f.interaction(add.responses[0].data.custom_id);
  submit.fields.getTextInputValue = () => '新しい会場';
  await panel.handle(submit);
  const venue = data.venues.at(-1);
  assert.equal(venue.channelId, model.DEFAULT_CHANNEL);
  assert.ok(venue.messageId);
  assert.equal(f.sends.length, 2);
}));

test('failed channel setup cannot publish a panel or leave an unsaved channel assignment', async () => isolated(async () => {
  const f = fixture();
  const venue = model.addVenue(model.config(f.guild.id), '会場');
  f.channel.permissionsFor = () => ({ has: () => false });
  await assert.rejects(panel.ensureSetup(f.client), /権限/);
  assert.equal(f.sends.length, 0);
  assert.equal(model.config(f.guild.id).channelId, undefined);
  f.channel.permissionsFor = () => ({ has: () => true });
  st.save = async () => false;
  await assert.rejects(panel.ensureSetup(f.client), /保存/);
  assert.equal(f.sends.length, 0);
  assert.equal(model.config(f.guild.id).channelId, undefined);
  assert.equal(model.config(f.guild.id).venues.find(item => item.id === venue.id).channelId, null);
}));

test('name submission and close survive a process restart with the selected date and time', async () => isolated(async () => {
  const f = fixture(), venue = model.addVenue(model.config(f.guild.id), '会場');
  venue.channelId = f.channel.id;
  await panel.tick(f.client, true);
  const start = f.interaction('visit_book:' + venue.id);
  await panel.handle(start);
  const id = idFrom(start.responses[0], 'time').split(':')[1];
  await panel.handle(f.interaction(`visit_session:${id}:time`));
  await panel.handle(f.interaction(`visit_session:${id}:hour`, ['09']));
  await panel.handle(f.interaction(`visit_session:${id}:minute`, ['30']));
  const saved = JSON.parse(JSON.stringify(st.get(f.guild.id)));
  st.db.delete(f.guild.id);
  st.db.set(f.guild.id, saved);
  delete require.cache[require.resolve('../utils/visitPanel')];
  const restarted = require('../utils/visitPanel');
  const name = f.interaction(`visit_session:${id}:name`);
  await restarted.handle(name);
  const modal = name.responses[0].toJSON();
  assert.equal(modal.title, '来場予約を登録');
  assert.equal(modal.components[0].components[0].value, undefined);
  await restarted.handle(f.interaction(modal.custom_id));
  assert.equal(model.config(f.guild.id).bookings[0].time, '09:30');
  assert.equal(st.get(f.guild.id).visitDrafts[id], undefined);
  const next = f.interaction('visit_book:' + venue.id);
  await restarted.handle(next);
  const close = f.interaction(idFrom(next.responses[0], 'close'));
  let closed = false;
  close.deleteReply = async () => { closed = true; };
  await restarted.handle(close);
  assert.equal(closed, true);
}));

test('idle expiry edits the input post once and its owner can resume the saved time', async () => isolated(async () => {
  const f = fixture(), venue = model.addVenue(model.config(f.guild.id), '会場');
  venue.channelId = f.channel.id;
  await panel.tick(f.client, true);
  const start = f.interaction('visit_book:' + venue.id);
  await panel.handle(start);
  const id = idFrom(start.responses[0], 'time').split(':')[1];
  const time = f.interaction(`visit_session:${id}:time`);
  await panel.handle(time);
  const input = await f.channel.send(time.responses[0]);
  const draft = st.get(f.guild.id).visitDrafts[id];
  Object.assign(draft, { messageId: input.id, time: '09:30', expires: Date.now() - 1000 });
  const count = f.sends.length;
  await panel.tick(f.client);
  assert.equal(f.sends.length, count);
  assert.equal(draft.closed, true);
  const expired = f.edits.at(-1);
  const resumeId = idFrom(expired, id);
  const wrongUser = f.interaction(resumeId); wrongUser.user.id = 'other';
  await panel.handle(wrongUser);
  assert.match(wrongUser.responses[0].embeds[0].toJSON().description, /自分で/);
  const resume = f.interaction(resumeId);
  await panel.handle(resume);
  assert.match(resume.responses[0].embeds[0].toJSON().description, /09:30/);
  assert.equal(draft.closed, false);
  assert.equal(f.sends.length, count);
}));

test('existing time screens recover safely after deployment and stale actions update the same message', async () => isolated(async () => {
  const f = fixture(), venue = model.addVenue(model.config(f.guild.id), '会場');
  venue.channelId = f.channel.id;
  await panel.tick(f.client, true);
  const start = f.interaction('visit_book:' + venue.id);
  await panel.handle(start);
  const id = idFrom(start.responses[0], 'time').split(':')[1];
  const time = f.interaction(`visit_session:${id}:time`);
  await panel.handle(time);
  const input = await f.channel.send(time.responses[0]);
  input.interactionMetadata = { user: { id: 'staff' } };
  delete st.get(f.guild.id).visitDrafts;
  const name = f.interaction(`visit_session:${id}:name`);
  name.message = input;
  await panel.handle(name);
  assert.equal(name.responses[0].toJSON().title, '来場予約を登録');
  assert.equal(st.get(f.guild.id).visitDrafts[id].venueId, venue.id);
  const stale = f.interaction('visit_session:missing:name');
  stale.message = { id: 'missing', embeds: [], components: [] };
  let replies = 0, updates = 0;
  stale.reply = async () => { replies++; };
  stale.update = async () => { updates++; };
  await panel.handle(stale);
  assert.equal(replies, 0);
  assert.equal(updates, 1);
}));
