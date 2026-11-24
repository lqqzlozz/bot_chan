const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, Collection, ComponentType, PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const { onMessage } = require('../utils/messageLinkPreview');

const guildId = '111111111111111111', channelId = '222222222222222222', messageId = '333333333333333333';
const link = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
function fixture() {
  const read = P.ReadMessageHistory | P.ViewChannel;
  const guild = { roles: { everyone: { id: guildId } } };
  const channel = {
    guild, id: channelId, name: '雑談', type: ChannelType.GuildText, isThread: () => false,
    permissionOverwrites: { cache: new Collection() }, permissionsFor: () => new PermissionsBitField(read)
  };
  const original = { content: 'こんにちは', url: link, channel, flags: { has: () => false },
    author: { username: '投稿者', displayAvatarURL: () => 'https://example.com/avatar.png' },
    createdAt: new Date(), attachments: new Collection(), embeds: [], stickers: new Collection() };
  const fetched = [], replies = [];
  channel.messages = { fetch: async options => { fetched.push(options); return original; } };
  guild.channels = { fetch: async () => channel };
  const message = { guild, guildId, channelId: '444444444444444444', channel: { ...channel, id: '444444444444444444' },
    member: {}, author: { bot: false }, content: link, reply: async payload => replies.push(payload) };
  return { message, original, channel, fetched, replies };
}

test('expands a public link once, showing author, content, image and jump link without notifying anyone', async () => {
  const f = fixture();
  f.original.attachments.set('hidden', { spoiler: true, contentType: 'image/png', url: 'hidden' });
  f.original.attachments.set('image', { contentType: 'image/png', url: 'https://example.com/photo.png' });
  f.message.content = link + '\n' + link;
  await onMessage(f.message);
  assert.deepEqual(f.fetched, [{ message: messageId, force: true }]);
  const [payload] = f.replies, [embed] = payload.embeds;
  assert.deepEqual(payload.allowedMentions, { parse: [], repliedUser: false });
  assert.equal(embed.author.name, '投稿者');
  assert.equal(embed.description, 'こんにちは');
  assert.equal(embed.url, link);
  assert.equal(embed.image.url, 'https://example.com/photo.png');
});

test('restricted channels, private threads, age restrictions and hidden history cannot leak into public replies', async () => {
  for (const restrict of [
    f => { f.channel.permissionsFor = who => new PermissionsBitField(who.id === guildId ? P.ReadMessageHistory : P.ReadMessageHistory | P.ViewChannel); },
    f => { f.channel.permissionOverwrites.cache.set('role', { id: 'role', deny: new PermissionsBitField(P.ViewChannel) }); },
    f => { f.channel.type = ChannelType.PrivateThread; },
    f => { f.channel.nsfw = true; },
    f => { f.channel.permissionOverwrites.cache.set('member', { id: 'member', deny: new PermissionsBitField(P.ReadMessageHistory) }); },
    f => { f.channel.permissionsFor = who => new PermissionsBitField(who === f.message.member ? 0n : P.ReadMessageHistory | P.ViewChannel); }
  ]) {
    const f = fixture(); restrict(f);
    await onMessage(f.message);
    assert.equal(f.fetched.length, 0);
    assert.equal(f.replies.length, 0);
  }
});

test('private threads can quote themselves and read text from Components V2', async () => {
  const f = fixture();
  const thread = { ...f.channel, isThread: () => true, parent: f.channel, type: ChannelType.PrivateThread };
  Object.assign(f.message, { channelId, channel: thread });
  f.original.content = '';
  f.original.components = [{ components: [{ type: ComponentType.TextDisplay, content: '案内' }] },
    { spoiler: true, components: [{ type: ComponentType.TextDisplay, content: '非表示' }] }];
  await onMessage(f.message);
  assert.equal(f.replies[0].embeds[0].description, '案内');
});

test('ignores opt-outs, other servers, bots, and deleted messages', async () => {
  const f = fixture();
  for (const content of ['<' + link + '>', '||' + link + '||', '`' + link + '`', link.replace(guildId, channelId)]) {
    await onMessage({ ...f.message, content });
  }
  await onMessage({ ...f.message, author: { bot: true } });
  assert.equal(f.fetched.length, 0);
  f.channel.messages.fetch = async () => { throw Object.assign(new Error(), { code: 10008 }); };
  await onMessage(f.message);
  assert.equal(f.replies.length, 0);
});
