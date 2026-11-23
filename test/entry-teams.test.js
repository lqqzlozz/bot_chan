const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parsePower, splitTeams, strategies } = require('../utils/entryTeams');

test('power accepts integer, comma-separated, and Japanese unit inputs', () => {
  for (const input of ['125000', '１２５，０００', '12.5万']) assert.equal(parsePower(input), 125000);
  assert.equal(parsePower('1.25億'), 125000000);
  assert.equal(parsePower('0.0003万'), 3);
  assert.equal(parsePower('１Ｂ'), 1000000000);
  assert.equal(parsePower('１０３M'), 103000000);
  assert.equal(parsePower('７５．６Ｍ'), 75600000);
  for (const input of ['0', '-1', '0.00001万', '1,2,3', '1e3', '9007199254740991']) {
    assert.equal(parsePower(input), null);
  }
});

test('assignment strategies distinguish power proximity, team totals, randomness and job grouping', () => {
  const players = [100, 90, 40, 30].map((power, index) => ({
    id: String(index), power, job: index % 2 === 0 ? '闘志' : '騎士'
  }));
  const totals = (mode, random) => splitTeams(players, 2, mode, random).map(team => team.total);
  assert.deepEqual(totals('close'), [190, 70]);
  assert.deepEqual(totals('balanced'), [130, 130]);
  assert.deepEqual(totals('random', () => 0), [130, 130]);
  assert.ok(splitTeams(players, 2, 'job').every(team => team.members[0].job === team.members[1].job));
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

test('server members can update their own power and assign teams from a recruitment', async () => {
  const data = {
    msg: '100', roleId: 'role', text: '募集',
    participants: [
      { id: '1', name: 'きつね', power: 125000, job: '闘志' },
      { id: '2', name: 'Edouard', power: 132000000, job: '魔導' },
      { id: '3', name: 'C' }
    ]
  };
  const module = { exports: {} };
  class Builder {
    setCustomId(value) { this.id = value; return this; }
    addOptions(options) { this.options = options; return this; }
    addLabelComponents(...labels) { this.labels = labels; return this; }
    setStringSelectMenuComponent(select) { this.select = select; return this; }
    setTextInputComponent(input) { this.input = input; return this; }
    setTitle() { return this; }
    setLabel(label) { this.label = label; return this; }
    setStyle(style) { this.style = style; return this; }
    setPlaceholder() { return this; }
    setRequired() { return this; }
    setMinValues() { return this; }
    setMaxLength() { return this; }
    setValue(value) { this.value = value; return this; }
    setColor() { return this; }
    setDescription() { return this; }
    addFields(...fields) { this.fields = fields; return this; }
    addComponents(...components) { this.components = components; return this; }
  }
  const config = { entry: { channel: data } };
  let saveResult;
  vm.runInNewContext(fs.readFileSync(require.resolve('../utils/entryPanel'), 'utf8'), {
    module, Intl, Buffer, require(name) {
      if (name === 'discord.js') return {
        escapeMarkdown: text => text, ActionRowBuilder: Builder, ButtonBuilder: Builder,
        ButtonStyle: { Primary: 1, Secondary: 2, Danger: 4 }, EmbedBuilder: Builder, ModalBuilder: Builder, TextInputBuilder: Builder,
        TextInputStyle: {}, LabelBuilder: Builder, StringSelectMenuBuilder: Builder
      };
      if (name === './store') return { get: () => config, save: async () => saveResult ?? true };
      if (name === './perm') return { isOwner: interaction => interaction.user.id === 'owner' };
      if (name === './entryScope') return { isEnabled: guildId => guildId === 'guild' };
      if (name === './entryTeams') return { parsePower, splitTeams, strategies };
      throw new Error('Unexpected import ' + name);
    }
  });
  const replies = [], posts = [], edits = [];
  let recruitment;
  const message = { id: '100', author: { id: 'bot' }, edit: async payload => { recruitment = payload; } };
  const list = { id: '101', edit: async () => {} };
  let deleted = false;
  const announcement = { id: '102', edit: async payload => edits.push(payload), delete: async () => { deleted = true; } };
  const interaction = {
    guildId: 'guild', channelId: 'channel', message, user: { id: 'member' }, guild: {},
    reply: async payload => replies.push(payload), deferUpdate: async () => {}, deferReply: async () => {},
    update: async payload => replies.push(payload), editReply: async payload => replies.push(payload),
    followUp: async payload => replies.push(payload), deleteReply: async () => {},
    channel: {
      send: async payload => { posts.push(payload); return announcement; },
      messages: { fetch: async id => ({100:message,101:list,102:announcement}[id]) }
    }
  };
  await module.exports.refresh({
    id: 'guild', channels: { fetch: async () => ({ isTextBased: () => true, messages: interaction.channel.messages }) }
  }, 'bot');
  assert.equal(recruitment.components.map(row => row.components.map(button => button.label).join('｜')).join('\n'),
    '参加｜辞退｜戦力変更｜チーム分け');
  assert.equal(recruitment.components[0].components[1].style, 4);
  assert.equal(data.participants.length, 3);
  const table = recruitment.embeds[0].fields[0].value;
  assert.equal(table.split('\n').slice(1, -1).join('\n'), [
    '名前     戦力     職業',
    'きつね   125,000  闘志',
    'Edouard     132M  魔導',
    'C              -  -'
  ].join('\n'));
  const many = Array.from({ length: 100 }, () => ({ name: 'チーム🏳️‍🌈長い名前`\nまだ続く名前', power: 132000000, job: '騎士' }));
  const longTable = module.exports.panel({ ...data, participants: many }).embeds[0].fields[0].value;
  assert.ok(longTable.length <= 1024);
  assert.match(longTable, /チーム🏳️‍🌈長い名前ˋ…/);
  assert.match(longTable, /\nほか \d+ 人\n```$/);
  const largeRoster = { ...data, participants: many.map((player, index) => ({ ...player, id: String(index + 1) })) };
  const middlePage = module.exports.panel(largeRoster, 1).components[1].components[0].options;
  assert.equal(middlePage.length, 25);
  assert.equal(middlePage[1].value, '23');
  assert.equal(middlePage.at(-2).value, 'page_0');
  assert.equal(middlePage.at(-1).value, 'page_2');
  await module.exports.handle({ ...interaction, customId: 'entry_roster' });
  assert.match(replies.at(-1).embeds[0].description, /募集投稿/);
  assert.equal(replies.at(-1).ephemeral, true);
  assert.equal(posts.length, 0);
  await module.exports.handle({ ...interaction, customId: 'entry_teams' });
  assert.equal(replies.at(-1).components[1].components[0].id, 'entry_strategy_100');
  const defaultRun = replies.at(-1).components[2].components[0].id;
  assert.equal(defaultRun, 'entry_run_100_2_balanced');
  assert.equal(posts.length, 0);
  const owner = { ...interaction, user: { id: 'owner' } };
  await module.exports.handle({ ...interaction, customId: defaultRun, message: list });
  assert.match(posts[0].embeds[0].description, /TEAM1\./);
  assert.match(posts[0].embeds[0].description, /のチームが完全ではありません/);
  await module.exports.handle({ ...owner, customId: 'entry_size_100', message: list, values: ['4'] });
  await module.exports.handle({ ...owner, customId: 'entry_strategy_100', message: list, values: ['close'] });
  assert.equal(posts.length, 1);
  assert.equal(edits.length, 0);
  const runWithChoices = replies.at(-1).components[2].components[0].id;
  assert.equal(runWithChoices, 'entry_run_100_4_close');
  await module.exports.handle({ ...owner, customId: runWithChoices, message: list });
  assert.equal(edits.length, 1);
  assert.doesNotMatch(edits[0].embeds[0].description, /TEAM2\./);
  await module.exports.handle({ ...interaction, customId: 'entry_roster', message: { id: '99' } });
  assert.match(replies.at(-1).embeds[0].description, /置き換わりました/);
  await module.exports.handle({ ...interaction, customId: 'entry_manage_100', message: list });
  assert.match(replies.at(-1).embeds[0].description, /募集主/);
  await module.exports.handle({ ...owner, customId: 'entry_teams' });
  assert.equal(replies.at(-1).components[2].components[1].id, 'entry_manage_100');
  await module.exports.handle({ ...owner, customId: 'entry_manage_100', message: list });
  assert.equal(replies.at(-1).components[0].components[0].options[0].value, 'reset');
  let modal;
  await module.exports.handle({ ...owner, customId: 'entry_edit_pick_100', values: ['3'], showModal: async value => { modal = value; } });
  assert.equal(modal.id, 'entry_edit_100_3');
  assert.equal(modal.labels[2].select.options.map(option => option.value).join(','), '闘志,騎士,賢者,魔導');
  const edit = {
    customId: 'entry_edit_100_3',
    fields: { getTextInputValue: field => field === 'power' ? '12.5万' : '', getStringSelectValues: () => ['騎士'] }
  };
  await module.exports.handle({ ...interaction, ...edit });
  assert.equal(data.participants[2].power, undefined);
  await module.exports.handle({ ...owner, ...edit, fields: { ...edit.fields, getStringSelectValues: () => ['戦士'] } });
  assert.equal(data.participants[2].power, undefined);
  const replyCount = replies.length;
  await module.exports.handle({ ...owner, ...edit });
  assert.equal(replies.length, replyCount);
  assert.equal(data.participants[2].power, 125000);
  assert.equal(data.participants[2].job, '騎士');
  assert.equal(config.entryProfiles['3'].power, 125000);
  await module.exports.handle({ ...owner, customId: 'entry_edit_pick_100_0', values: ['reset'], message: list });
  assert.match(replies.at(-1).embeds[0].description, /リセットしますか/);
  assert.equal(data.participants[2].power, 125000);
  await module.exports.handle({ ...owner, customId: 'entry_reset_confirm_100_101', message: { id: 'confirmation' } });
  assert.equal(data.participants.length, 3);
  assert.ok(data.participants.every(player => !Object.hasOwn(player, 'power') && !Object.hasOwn(player, 'job')));
  assert.equal(config.entryProfiles['3'].job, '騎士');
  await module.exports.handle({ ...owner, customId: 'entry_prepare_100', message: list });
  const randomRun = replies.at(-1).components[2].components[0].id;
  assert.equal(randomRun, 'entry_run_100_4_random');
  assert.equal(edits.length, 1);
  await module.exports.handle({ ...owner, customId: randomRun, message: list });
  assert.equal(posts.length, 1);
  assert.equal(edits.length, 2);
  await module.exports.handle({ ...owner, customId: 'entry_delete_100', message: announcement });
  assert.equal(deleted, true);
  assert.equal(data.teamMessageId, undefined);
  const empty = { getTextInputValue: () => '', getStringSelectValues: () => [] };
  await module.exports.handle({
    ...interaction, customId: 'entry_register_100', fields: empty, user: { id: '4' },
    guild: {
      members: { fetch: async () => ({ displayName: 'サーバー名', roles: { cache: { has: () => true } } }) },
      roles: { fetch: async () => ({ id: 'role' }) }
    }
  });
  assert.equal(data.participants.at(-1).name, 'サーバー名');
  assert.equal(data.participants.at(-1).power, undefined);
  assert.equal(data.participants.at(-1).job, undefined);
  data.participants = [];
  let finishSave;
  saveResult = new Promise(resolve => { finishSave = resolve; });
  let showJoined;
  const joinedOnPost = new Promise(resolve => { showJoined = resolve; });
  const repliesBeforeJoin = replies.length;
  let acknowledgedJoin = false;
  const joining = module.exports.handle({
    ...interaction, customId: 'entry_join', user: { id: '3' },
    deferUpdate: async () => { acknowledgedJoin = true; },
    deferReply: async () => assert.fail('Joining should not create a pending message'),
    message: { ...message, edit: async payload => { recruitment = payload; showJoined(); } },
    guild: {
      members: { fetch: async () => ({ displayName: 'C', roles: { cache: { has: () => true } } }) },
      roles: { fetch: async () => ({ id: 'role' }) }
    }
  });
  await joinedOnPost;
  finishSave(true);
  await joining;
  saveResult = undefined;
  assert.equal(data.participants[0].power, 125000);
  assert.equal(data.participants[0].job, '騎士');
  assert.equal(acknowledgedJoin, true);
  assert.equal(replies.length, repliesBeforeJoin);
  const joined = { ...interaction, user: { id: '3' } };
  await module.exports.handle({ ...joined, customId: 'entry_join' });
  assert.match(replies.at(-1).embeds[0].description, /すでに参加しています/);
  const publicEdits = [];
  const editPublicPost = async payload => publicEdits.push(payload);
  let unblock;
  const busy = module.exports.serialize('channel', () => new Promise(resolve => { unblock = resolve; }));
  await Promise.resolve();
  await Promise.resolve();
  try {
    await module.exports.handle({ ...interaction, customId: 'entry_power', update: editPublicPost });
    await module.exports.handle({ ...interaction, customId: 'entry_teams' });
    assert.equal(replies.at(-1).components[1].components[0].id, 'entry_strategy_100');
  } finally {
    unblock();
    await busy;
  }
  const editPicker = publicEdits.at(-1).components[1].components[0];
  assert.equal(editPicker.id, 'entry_power_pick');
  assert.equal(editPicker.options.map(option => option.label).join(','), '自分の戦力・職業,C');
  await module.exports.handle({ ...interaction, customId: 'entry_power_pick', values: ['3'], showModal: async value => { modal = value; } });
  assert.equal(modal.id, 'entry_power_save_100_3');
  assert.equal(modal.labels.length, 2);
  assert.equal(modal.labels[0].input.value, '125000');
  assert.equal(modal.labels[1].select.options.find(option => option.default).value, '騎士');
  const powerSubmit = {
    customId: 'entry_power_save_100', fields: { getTextInputValue: () => '103M', fields: new Map() }, message: list
  };
  await module.exports.handle({ ...joined, ...powerSubmit });
  assert.equal(data.participants[0].power, 103000000);
  assert.equal(data.participants[0].job, '騎士');
  assert.equal(data.participants[0].name, 'C');
  assert.equal(config.entryProfiles['3'].power, 103000000);
  const jobOnly = {
    getTextInputValue: () => '',
    fields: new Map([['job', { values: ['賢者'] }]])
  };
  const repliesBeforeUpdate = replies.length;
  saveResult = new Promise(resolve => { finishSave = resolve; });
  let showUpdated;
  const shownOnPost = new Promise(resolve => { showUpdated = resolve; });
  const updating = module.exports.handle({
    ...interaction, customId: modal.id, fields: jobOnly,
    message: { ...message, edit: async payload => { await editPublicPost(payload); showUpdated(); } },
    editReply: async () => assert.fail('The modal must not use its interaction webhook to edit the post')
  });
  await shownOnPost;
  assert.match(publicEdits.at(-1).embeds[0].fields[0].value, /103M  賢者/);
  finishSave(true);
  await updating;
  saveResult = undefined;
  assert.equal(data.participants[0].job, '賢者');
  assert.equal(data.participants[0].power, 103000000);
  assert.equal(config.entryProfiles['3'].job, '賢者');
  assert.equal(config.entryProfiles.member, undefined);
  assert.equal(replies.length, repliesBeforeUpdate);
  assert.equal(publicEdits.at(-1).components.length, 1);
  saveResult = false;
  await module.exports.handle({
    ...interaction, customId: modal.id,
    fields: { ...jobOnly, fields: new Map([['job', { values: ['騎士'] }]]) }
  });
  saveResult = undefined;
  assert.equal(config.entryProfiles['3'].job, '賢者');
  assert.match(recruitment.embeds[0].fields[0].value, /103M  賢者/);
  assert.match(replies.at(-1).embeds[0].description, /変更を保存できませんでした/);
  let clearedFallback = false;
  await module.exports.handle({
    ...interaction, customId: modal.id, fields: jobOnly, message: null,
    deferUpdate: async () => assert.fail('The modal has no source message'),
    deleteReply: async () => { clearedFallback = true; }
  });
  assert.equal(clearedFallback, true);
  assert.match(recruitment.embeds[0].fields[0].value, /103M  賢者/);
  await module.exports.handle({ ...interaction, customId: 'entry_power_save_100_99', fields: jobOnly });
  assert.match(replies.at(-1).embeds[0].description, /現在の参加者一覧にいません/);
  assert.equal(config.entryProfiles['99'], undefined);
  await module.exports.handle({ ...interaction, ...powerSubmit });
  assert.equal(config.entryProfiles.member.power, 103000000);
  assert.equal(data.participants.length, 1);
  await module.exports.handle({ ...interaction, customId: 'entry_join', showModal: async value => { modal = value; } });
  assert.equal(modal.id, 'entry_register_100');
  assert.equal(modal.labels[1].input.value, '103M');
  assert.equal(modal.labels[2].select.options.length, 4);
  await module.exports.handle({ ...joined, customId: 'entry_register_100', fields: empty });
  assert.match(replies.at(-1).embeds[0].description, /すでに参加しています/);
  assert.equal(data.participants[0].power, 103000000);
  await module.exports.handle({ ...joined, ...powerSubmit, guildId: 'other' });
  assert.match(replies.at(-1).embeds[0].description, /このサーバーでは使用できません/);
  const repliesBeforeLeave = replies.length;
  let acknowledgedLeave = false;
  let removedRole;
  await module.exports.handle({
    ...joined, customId: 'entry_leave',
    deferUpdate: async () => { acknowledgedLeave = true; },
    deferReply: async () => assert.fail('Leaving should not create a pending message'),
    member: { roles: { cache: new Map([['role', {}]]), remove: async role => { removedRole = role.id; } } },
    guild: { roles: { cache: new Map([['role', { id: 'role' }]]), fetch: async () => assert.fail('Role is cached') } }
  });
  assert.equal(acknowledgedLeave, true);
  assert.equal(removedRole, 'role');
  assert.equal(replies.length, repliesBeforeLeave);
  assert.equal(data.participants.length, 0);
  assert.equal(recruitment.embeds[0].fields[0].value, 'まだ参加者はいません。');
});

test('Monday JST weekly reset saves the new post before deleting the previous recruitment', async () => {
  const data = { msg:'100', roleId:'role', participants:[{id:'123', name:'A', power:105000000, job:'闘志'}] };
  const config = { entry:{channel:data} };
  const calls = { roles:0, sends:[], deletes:[], errors:[] };
  let savedNew = false;
  let failSave = true;
  let failDelete = true;
  const channel = {
    isTextBased:()=>true,
    messages:{fetch:async id => ({
      author: { id: 'bot' },
      delete: async () => {
        assert.equal(id, '100');
        assert.equal(savedNew, true);
        calls.deletes.push(id);
        if (failDelete) throw new Error('Temporary Discord error');
      }
    })},
    send:async payload=>{calls.sends.push(payload);return {id:'101'};}
  };
  const guild = {
    id:'guild', client:{user:{id:'bot'}}, channels:{fetch:async()=>channel}, roles:{fetch:async()=>({id:'role'})},
    members:{fetch:async()=>({roles:{cache:{has:()=>true}, remove:async()=>{calls.roles++;}}})}
  };
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../utils/entryWeekly'),'utf8'), {
    module, Intl, console:{error:(...messages)=>calls.errors.push(messages)}, require(name) {
      if (name==='./store') return {get:()=>config,save:async()=>{
        if (!config.entryWeekly.channel.done) return true;
        if (failSave) return false;
        savedNew = data.msg === '101';
        return true;
      }};
      if (name==='./entryScope') return {GUILD:'guild'};
      if (name==='node:crypto') return require(name);
      if (name==='./entryPanel') return {
        panel:()=>({embeds:[{description:'大会募集'}], components:[{type:1, components:[{custom_id:'entry_join'}]}]}), serialize:(_key, action)=>action(),
        profiles:()=>{config.entryProfiles={123:{power:data.participants[0].power,job:data.participants[0].job}};}
      };
      throw new Error('Unexpected import '+name);
    }
  });
  const client={guilds:{cache:new Map([['guild',guild]])}};
  await module.exports.tick(client,new Date('2026-11-15T22:59:59Z'));
  assert.equal(calls.roles,0);
  await module.exports.tick(client,new Date('2026-11-15T23:00:00Z'));
  assert.equal(data.msg,'100');
  assert.equal(calls.deletes.length,0);
  failSave = false;
  await module.exports.tick(client,new Date('2026-11-16T00:00:00Z'));
  assert.equal(data.msg,'101');
  assert.equal(calls.deletes.length,1);
  failDelete = false;
  await module.exports.tick(client,new Date('2026-11-16T00:01:00Z'));
  await module.exports.tick(client,new Date('2026-11-16T00:02:00Z'));
  assert.equal(calls.roles,1);
  assert.equal(data.participants.length,0);
  assert.equal(config.entryProfiles['123'].power,105000000);
  assert.equal(calls.sends.length,1);
  assert.equal(calls.sends[0].content,'@everyone');
  assert.equal(calls.sends[0].allowedMentions.parse.join(','),'everyone');
  assert.equal(calls.sends[0].embeds[0].description,'大会募集');
  assert.equal(calls.sends[0].components[0].components[0].custom_id,'entry_join');
  assert.equal(data.msg,'101');
  assert.deepEqual(calls.deletes,['100','100']);
  assert.equal(config.entryWeekly.channel.previousMessageId,undefined);
  assert.equal(calls.errors.length,2);
});
