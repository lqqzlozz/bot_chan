const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parsePower, splitTeams } = require('../utils/entryTeams');

test('power accepts integer, comma-separated, and Japanese unit inputs', () => {
  for (const input of ['125000', '１２５，０００', '12.5万']) assert.equal(parsePower(input), 125000);
  assert.equal(parsePower('1.25億'), 125000000);
  assert.equal(parsePower('0.0003万'), 3);
  for (const input of ['0', '-1', '0.00001万', '1,2,3', '1e3', '9007199254740991']) {
    assert.equal(parsePower(input), null);
  }
});

test('pairs spread jobs and balance the total power', () => {
  const players = [
    { id: '1', power: 100, job: '戦士' }, { id: '2', power: 90, job: '戦士' },
    { id: '3', power: 80, job: '魔法使い' }, { id: '4', power: 70, job: '魔法使い' }
  ];
  const teams = splitTeams(players, 2);
  assert.deepEqual(teams.map(team => team.total), [170, 170]);
  assert.ok(teams.every(team => new Set(team.members.map(player => player.job)).size === 2));
});

test('four-player teams keep all participants exactly once, including remainders', () => {
  const players = Array.from({length: 11}, (_, id) => ({ id: String(id), power: id + 1, job: '戦士' }));
  const teams = splitTeams(players, 4);
  assert.deepEqual(teams.map(team => team.members.length), [4, 4, 3]);
  assert.deepEqual(teams.flatMap(team => team.members).map(player => player.id).sort(), players.map(player => player.id).sort());
  assert.equal(teams.reduce((sum, team) => sum + team.total, 0), 66);
});

test('entry roster can be viewed without dividing teams, and only the owner can post teams', async () => {
  const data = {
    msg: '100', roleId: 'role', text: '募集',
    participants: [
      { id: '1', name: 'A', power: 125000, job: '戦士' },
      { id: '2', name: 'B', power: 120000, job: '魔法使い' },
      { id: '3', name: 'C' }
    ]
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../utils/entryPanel'), 'utf8'), {
    module, Intl, Buffer, require(name) {
      if (name === 'discord.js') return { escapeMarkdown: text => text };
      if (name === './store') return { get: () => ({ entry: { channel: data } }) };
      if (name === './perm') return { isOwner: interaction => interaction.user.id === 'owner' };
      if (name === './entryScope') return { isEnabled: guildId => guildId === 'guild' };
      if (name === './entryTeams') return { parsePower, splitTeams };
      throw new Error('Unexpected import ' + name);
    }
  });
  const replies = [], posts = [];
  const interaction = {
    guildId: 'guild', channelId: 'channel', message: { id: '100' }, user: { id: 'member' },
    reply: async payload => replies.push(payload), deferReply: async () => {},
    editReply: async payload => replies.push(payload), channel: { send: async payload => posts.push(payload) }
  };
  await module.exports.handle({ ...interaction, customId: 'entry_roster' });
  assert.match(replies.at(-1).content, /A｜戦士｜戦力 125,000/);
  assert.match(replies.at(-1).content, /C｜戦力・職業 未登録/);
  assert.equal(posts.length, 0);
  await module.exports.handle({ ...interaction, customId: 'entry_pair' });
  assert.match(replies.at(-1).content, /募集主/);
  assert.equal(posts.length, 0);
  await module.exports.handle({ ...interaction, customId: 'entry_pair', user: { id: 'owner' } });
  assert.match(posts[0].content, /合計戦力 245,000/);
  assert.match(posts[0].content, /未登録の1人/);
  await module.exports.handle({ ...interaction, customId: 'entry_roster', message: { id: '99' } });
  assert.match(replies.at(-1).content, /置き換わりました/);
});
