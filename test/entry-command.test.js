const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({ save = true, sendError } = {}) {
  const config = { entry: {} };
  const calls = [];
  const module = { exports: {} };
  class Builder {
    setName() { return this; }
    setDescription() { return this; }
    addStringOption() { return this; }
    addRoleOption() { return this; }
  }
  const role = { id: 'role', editable: true, members: new Map([
    ['member', { id: 'member', user: { bot: false }, displayName: '参加者' }]
  ]) };
  const imports = {
    'discord.js': { SlashCommandBuilder: Builder, MessageFlags: { Ephemeral: 64 } },
    '../utils/store': { get: () => config, save: async () => save },
    '../utils/entryPanel': { panel: data => data, serialize: (_, action) => action(), profiles: () => ({ member: { power: 105000000 } }) },
    '../utils/perm': { isOwner: () => true },
    '../utils/entryScope': { GUILD: 'guild', isEnabled: () => true }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../commands/entry'), 'utf8'), {
    module, require: name => imports[name], console: { error() {} }
  });
  const interaction = {
    guildId: 'guild',
    deferReply: async () => calls.push('defer'),
    editReply: async payload => calls.push(payload.embeds[0].description),
    deleteReply: async () => calls.push('done'),
    options: { getString: () => '大会募集', getRole: () => role },
    channel: { id: 'channel', send: async () => {
      calls.push('send');
      if (sendError) throw sendError;
      return { id: 'post', delete: async () => calls.push('rollback') };
    } },
    guild: { roles: { fetch: async () => role }, members: { fetch: async () => {
      assert.fail('must not fetch the entire guild');
    } } }
  };
  return { execute: () => module.exports.execute(interaction), config, calls };
}

test('/entry acknowledges before posting and uses available participant data', async () => {
  const { execute, config, calls } = fixture();
  await execute();
  assert.deepEqual(calls, ['defer', 'send', 'done']);
  assert.equal(config.entry.channel.msg, 'post');
  assert.equal(config.entry.channel.participants[0].power, 105000000);
});

test('/entry reports posting and persistence errors instead of leaving a pending response', async () => {
  const posting = fixture({ sendError: new Error('Missing Permissions') });
  await posting.execute();
  assert.match(posting.calls.at(-1), /募集を投稿できませんでした/);
  assert.equal(posting.config.entry.channel, undefined);

  const persistence = fixture({ save: false });
  await persistence.execute();
  assert.ok(persistence.calls.includes('rollback'));
  assert.match(persistence.calls.at(-1), /募集を保存できませんでした/);
  assert.equal(persistence.config.entry.channel, undefined);
});
