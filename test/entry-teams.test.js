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
    { id: '1', power: 100, job: '闘志' }, { id: '2', power: 90, job: '闘志' },
    { id: '3', power: 80, job: '魔導' }, { id: '4', power: 70, job: '魔導' }
  ];
  const teams = splitTeams(players, 2);
  assert.deepEqual(teams.map(team => team.total), [170, 170]);
  assert.ok(teams.every(team => new Set(team.members.map(player => player.job)).size === 2));
});

test('four-player teams keep all participants exactly once, including remainders', () => {
  const players = Array.from({length: 11}, (_, id) => ({ id: String(id), power: id + 1, job: '闘志' }));
  const teams = splitTeams(players, 4);
  assert.deepEqual(teams.map(team => team.members.length), [4, 4, 3]);
  assert.deepEqual(teams.flatMap(team => team.members).map(player => player.id).sort(), players.map(player => player.id).sort());
  assert.equal(teams.reduce((sum, team) => sum + team.total, 0), 66);
});

test('entry roster can be viewed without dividing teams, and only the owner can post teams', async () => {
  const data = {
    msg: '100', roleId: 'role', text: '募集',
    participants: [
      { id: '1', name: 'A', power: 125000, job: '闘志' },
      { id: '2', name: 'B', power: 120000, job: '魔導' },
      { id: '3', name: 'C' }
    ]
  };
  const module = { exports: {} };
  class Builder {
    setCustomId(value) { this.id = value; return this; }
    addOptions(options) { this.options = options; return this; }
    addLabelComponents(...labels) { this.labels = labels; return this; }
    setStringSelectMenuComponent(select) { this.select = select; return this; }
    setTextInputComponent() { return this; }
    setTitle() { return this; }
    setLabel() { return this; }
    setStyle() { return this; }
    setPlaceholder() { return this; }
    setRequired() { return this; }
    setMaxLength() { return this; }
    setValue() { return this; }
    setColor() { return this; }
    setDescription() { return this; }
    addFields() { return this; }
    addComponents() { return this; }
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../utils/entryPanel'), 'utf8'), {
    module, Intl, Buffer, require(name) {
      if (name === 'discord.js') return {
        escapeMarkdown: text => text, ActionRowBuilder: Builder, ButtonBuilder: Builder,
        ButtonStyle: {}, EmbedBuilder: Builder, ModalBuilder: Builder, TextInputBuilder: Builder,
        TextInputStyle: {}, LabelBuilder: Builder, StringSelectMenuBuilder: Builder
      };
      if (name === './store') return { get: () => ({ entry: { channel: data } }), saveLater() {} };
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
  assert.match(replies.at(-1).content, /A｜闘志｜戦力 125,000/);
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
  const owner = { ...interaction, user: { id: 'owner' } };
  await module.exports.handle({ ...owner, customId: 'entry_roster' });
  assert.equal(replies.at(-1).components[0].components[0].options[2].value, '3');
  let modal;
  await module.exports.handle({ ...owner, customId: 'entry_edit_pick_100', values: ['3'], showModal: async value => { modal = value; } });
  assert.equal(modal.id, 'entry_edit_100_3');
  assert.equal(modal.labels[1].select.options.map(option => option.value).join(','), '闘志,騎士,賢者,魔導');
  const edit = {
    customId: 'entry_edit_100_3',
    fields: { getTextInputValue: () => '12.5万', getStringSelectValues: () => ['騎士'] }
  };
  await module.exports.handle({ ...interaction, ...edit });
  assert.equal(data.participants[2].power, undefined);
  await module.exports.handle({ ...owner, ...edit, fields: { ...edit.fields, getStringSelectValues: () => ['戦士'] } });
  assert.equal(data.participants[2].power, undefined);
  await module.exports.handle({ ...owner, ...edit, guild: {}, message: { id: '100', edit: async () => {} } });
  assert.equal(data.participants[2].power, 125000);
  assert.equal(data.participants[2].job, '騎士');
});
