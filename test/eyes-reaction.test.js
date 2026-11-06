const { test } = require('node:test');
const assert = require('node:assert/strict');
const eyes = require('../utils/eyesReaction');
const { GUILD, isEnabled } = require('../utils/entryScope');

test('sensitive detection covers requested words and spelling variations', () => {
  for (const text of ['フェラ', '犯すぞ', '金よこせ', '殺すぞ', 'バカ', 'うざい', 'キモい',
    'ﾌｪﾗ', 'フ ェ ラ', 'フェ\u200bラ', 'ころすぞ', 'コ・ロ・ス', 'お前シネ', '死ね',
    'ぶっ殺す', '殴るぞ', 'レイプするぞ', '金を払え', 'カネダセ', 'セックス', 'ちんこ', 'まんこ']) {
    assert.equal(eyes.detects(text), true, text);
  }
});

test('ordinary words, payments, URLs and Discord emoji names are ignored', () => {
  for (const text of ['', 'こんにちは', 'フェラーリ', 'バカンス', 'ばかり', '金払った',
    'お金を出せる', 'バカみたいに楽しい', 'シネマに行こう', 'キモノ',
    'https://example.com/フェラ', '<:バカ:123456789>']) {
    assert.equal(eyes.detects(text), false, text);
  }
});

test('Entry command scope is reused; only eligible human guild messages get one eyes reaction', async () => {
  const entry = require('../commands/entry');
  assert.equal(entry.guild, GUILD);
  assert.equal(isEnabled(entry.guild), true);
  const reactions = [];
  const message = { guild: { id: GUILD }, guildId: GUILD, author: { bot: false }, content: 'バカ、殺すぞ', react: async emoji => reactions.push(emoji) };
  await eyes.onMessage(message);
  assert.deepEqual(reactions, ['👀']);
  for (const override of [{ author: { bot: true } }, { webhookId: 'hook' }, { guild: null }, { guildId: 'other' }, { content: '普通の会話' }]) {
    await eyes.onMessage({ ...message, ...override });
  }
  assert.deepEqual(reactions, ['👀']);
});

test('messageCreate keeps processing after a rejected reaction and never sends a warning', async () => {
  const event = require('../events/messageCreate');
  const inactive = require('../utils/inactive');
  const original = inactive.record, log = console.error;
  let recorded = 0, reacted = 0;
  inactive.record = () => recorded++;
  console.error = () => {};
  try {
    await event.execute({ guild: { id: GUILD }, guildId: GUILD, channelId: 'eyes-test', author: { id: 'human', bot: false }, content: 'フェラ', react: async () => { reacted++; throw Object.assign(new Error(), { code: 50013 }); } }, { user: { id: 'bot' } });
    assert.equal(reacted, 1);
    assert.equal(recorded, 1);
  } finally { inactive.record = original; console.error = log; }
});
