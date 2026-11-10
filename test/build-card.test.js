const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, MessageFlags } = require('discord.js');
const st = require('../utils/store');
const en = require('../utils/enka');
const art = require('../utils/artifact');
const character = require('../utils/character');
const cards = require('../utils/charCard');
const panel = require('../utils/buildPanel');
const bump = require('../utils/bump');
const { GI } = require('../utils/gi');
const interactions = require('../events/interactionCreate');
const intro = require('../utils/intro');

test('start buttons use requested labels and every score basis has a formula', () => {
  assert.deepEqual(panel.panel().components[0].toJSON().components.map(b => b.label), ['作成:スコア表示ON', '作成:スコア表示OFF']);
  assert.deepEqual(Object.keys(art.FORMULAS), Object.keys(art.BASES));
});

test('2+2 relic sets remain separate even if names are missing; active basis highlights its stat', async () => {
  const original = { names: en.names, loc: en.loc, relicSet: en.relicSet };
  en.names = async () => ({}); en.loc = hash => ({ a: '剣闘士のフィナーレ', b: '追憶のしめ縄' }[hash] || '');
  en.relicSet = e => ({ id: e.flat.setNameTextMapHash, name: en.loc(e.flat.setNameTextMapHash) });
  const equipList = art.ORDER.map((type, n) => ({ reliquary: {}, flat: { equipType: type, icon: `UI_RelicIcon_${n < 2 ? '15001' : n < 4 ? '15002' : '15003'}_${n}`, setNameTextMapHash: n < 2 ? 'a' : n < 4 ? 'b' : 'c', reliquaryMainstat: { mainPropId: 'FIGHT_PROP_ATTACK', statValue: 10 }, reliquarySubstats: [] } }));
  try {
    const d = await character.build({ avatarId: 1, equipList }, '123456789', 'atk', true);
    assert.deepEqual(d.sets, [['剣闘士のフィナーレ', 2], ['追憶のしめ縄', 2]]);
    assert.equal(d.stats.find(s => s[0] === '攻撃力')[2], 1);
    en.loc = () => '';
    en.relicSet = original.relicSet;
    const unknown = await character.build({ avatarId: 1, equipList }, '123456789', 'hp', true);
    assert.equal(unknown.sets.length, 2); assert.deepEqual(unknown.sets.map(s => s[1]), [2, 2]);
    assert.equal(unknown.stats.find(s => s[0] === 'HP')[2], 1);
    assert.notEqual(unknown.stats.find(s => s[0] === '攻撃力')[2], 1);
  } finally { en.names = original.names; en.loc = original.loc; en.relicSet = original.relicSet; }
});

test('talent icons follow talent level order in both Enka formats and private profiles', async () => {
  const original = { names: en.names, char: en.char };
  en.names = async () => ({ 1: 'テスト' });
  en.char = () => ({ SkillOrder: [3, 1, 2], Skills: { 1: '/ui/Skill_S_Test.png', 2: 'Skill_E_Test', 3: '/ui/Skill_A_Test.png' }, ProudMap: { 2: 100 } });
  try {
    const d = await character.build({ avatarId: 1, skillLevelMap: { 1: 8, 2: 10, 3: 6 }, proudSkillExtraLevelMap: { 100: 3 } }, '123456789', 'hp', true);
    assert.deepEqual(d.tal, [6, 8, 13]);
    assert.deepEqual(d.talIcons, ['Skill_A_Test', 'Skill_S_Test', 'Skill_E_Test'].map(name => en.UI + name + '.png'));
    const limited = await character.build({ avatarId: 1, lim: true }, '123456789', null, false);
    assert.deepEqual(limited.talIcons, d.talIcons); assert.deepEqual(limited.tal, ['-', '-', '-']);
  } finally { en.names = original.names; en.char = original.char; }
});

test('UID registration renders native showcase rows, even at the Discord component limit', async t => {
  t.mock.method(en, 'names', async () => ({}));
  t.mock.method(en, 'charIcon', a => en.uiPath('UI_AvatarIcon_' + a.avatarId));
  t.mock.method(st, 'saveLater', () => {});
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false }));
  const p = { nickname: 'ゲーム内の名前', showAvatarInfoList: [{ avatarId: 1, level: 90 }, { avatarId: 2, level: 80 }] };
  const raw = [{ avatarId: 1, equipList: [
    { weapon: {}, flat: { icon: 'UI_EquipIcon_Test' } },
    { reliquary: {}, flat: { icon: 'UI_RelicIcon_15001_1' } },
    { reliquary: {}, flat: { icon: 'UI_RelicIcon_15001_2' } }
  ] }];
  const player = t.mock.method(en, 'player', async () => ({ p, raw }));
  let output;
  const i = { guildId: 'intro-test', channelId: 'c', customId: 'intro_mdl_role',
    user: { id: '123456789', displayAvatarURL: () => 'https://example.com/avatar.png' },
    member: { displayName: 'Discordの名前' }, deferUpdate: async () => {}, fields: { getTextInputValue: () => '123456789' },
    guild: { roles: { fetch: async () => null } }, channel: { send: async p => { output = p; return { id: 'msg' }; } } };
  try {
    await intro.submit(i);
    assert.equal(output.flags, MessageFlags.IsComponentsV2);
    assert.equal(output.content, undefined);
    assert.equal(output.embeds, undefined);
    assert.deepEqual(output.allowedMentions.parse, []);
    assert.deepEqual(output.files.map(file => file.name), ['uid-header.png']);
    const components = output.components[0].toJSON().components;
    assert.match(components[1].content, /ゲーム内の名前/);
    assert.ok(components[1].content.includes('**UID**\n```\n123456789\n```'));
    assert.match(components[3].components[0].content, /Lv\.90 │ C0/);
    assert.equal(components[3].accessory.media.url, en.uiPath('UI_AvatarIcon_1'));
    assert.deepEqual(components[4].items.map(item => item.media.url),
      ['UI_EquipIcon_Test', 'UI_RelicIcon_15001_1'].map(en.uiPath));
    assert.match(components[5].components[0].content, /Lv\.80 │ 凸数 非公開/);
    assert.deepEqual(components.at(-1).components.map(b => b.url), ['https://enka.network/u/123456789/', 'https://akasha.cv/profile/123456789']);

    p.showAvatarInfoList = Array.from({ length: 12 }, (_, n) => ({ avatarId: n + 1, level: 90 }));
    st.db.clear();
    await intro.submit(i);
    const count = c => 1 + (c.accessory ? count(c.accessory) : 0) +
      (c.components || []).reduce((n, child) => n + count(child), 0);
    const full = output.components[0].toJSON();
    assert.ok(count(full) <= 40);
    assert.equal(full.components.slice(3, -1).length, 12);
    assert.match(full.components[3].components[0].content, /武器/);
    assert.match(full.components.at(-2).content, /キャラクター 12/);

    player.mock.mockImplementation(async () => ({ err: 503 }));
    st.db.clear();
    await intro.submit(i);
    assert.deepEqual(output.files, []);
    assert.match(output.components[0].toJSON().components[0].content, /123456789/);
    assert.equal(st.get(i.guildId).intro[i.user.id].pending, true);
  } finally { st.db.clear(); }
});

test('public card identifies its owner and only that owner can change it', async () => {
  const original = { player: en.player, names: en.names, build: character.build, card: cards.charCard, saveLater: st.saveLater };
  const builds = [], posts = [];
  en.player = async () => ({ p: {}, raw: [{ avatarId: 1 }, { avatarId: 2 }] });
  en.names = async () => ({ 1: 'ナヒーダ', 2: 'フリーナ' });
  character.build = async (a, uid, base, showScore) => { builds.push({ aid: a.avatarId, base, showScore }); return { name: a.avatarId === 1 ? 'ナヒーダ' : 'フリーナ' }; };
  cards.charCard = async () => Buffer.from('image');
  st.saveLater = () => {};
  const guildId = GI[0];
  st.get(guildId).intro = { user: { uid: '123456789' } };
  const i = { guildId, channelId: 'ch', member: { displayName: 'テストさん' }, user: { id: 'user', displayAvatarURL: () => 'https://example.com/avatar.png' }, channel: { guildId, id: 'ch', send: async p => { posts.push(p); return { url: 'https://discord.com/channels/g/c/m' }; } }, customId: 'bc_open_score', deferReply: async opts => { assert.ok(!opts?.ephemeral); }, deferUpdate: async () => {}, editReply: async p => { i.output = p; }, reply: async p => { i.error = p; }, deleteReply: async () => { i.deleted = true; } };
  try {
    await panel.handle(i);
    assert.match(i.output.content, /<@user>/);
    assert.match(i.output.embeds[0].toJSON().author.name, /テストさん/);
    const id = i.output.components[0].toJSON().components[0].custom_id.split('_')[2];
    const select = async (action, value) => { i.customId = `bc_${action}_${id}`; i.values = [value]; await panel.handle(i); i.output.components?.forEach(r => r.toJSON()); };
    await select('char', '1'); assert.equal(builds.length, 0);
    await select('base', 'em');
    await select('base', 'hp');
    await select('char', '2');
    assert.deepEqual(builds.map(b => [b.aid, b.base]), [[1, 'em'], [1, 'hp'], [2, 'hp']]);
    assert.equal(posts.length, 0);
    const labels = () => i.output.components.map(r => r.toJSON()).find(r => r.components[0].custom_id?.startsWith('bc_on_')).components.map(b => b.label);
    assert.deepEqual(labels(), ['スコア表示ON', 'スコア表示OFF', '終了']);
    await select('off'); assert.equal(builds.at(-1).showScore, false); assert.equal(i.output.components.length, 2);
    assert.deepEqual(labels(), ['スコア表示ON', 'スコア表示OFF', '終了']);
    await select('off'); assert.equal(builds.at(-1).showScore, false);
    await select('on'); assert.equal(builds.at(-1).showScore, true); assert.equal(i.output.components.length, 4);
    assert.match(i.output.embeds[0].toJSON().description, /計算基準：HP\n`HP%/);
    assert.doesNotMatch(i.output.embeds[0].toJSON().description, /何度でも/);
    assert.deepEqual(labels(), ['スコア表示ON', 'スコア表示OFF', '終了']);
    const other = { ...i, user: { id: 'other' } };
    await panel.handle(other); assert.match(i.error.content, /本人だけ/);
    await select('end'); assert.equal(i.deleted, undefined); assert.deepEqual(i.output.components[0].toJSON().components.map(b => b.label), ['Enka', 'Akasha']);
    await select('char', '1'); assert.match(i.error.content, /有効期限/);
  } finally { Object.assign(en, { player: original.player, names: original.names }); character.build = original.build; cards.charCard = original.card; st.saveLater = original.saveLater; st.db.clear(); }
});

test('score OFF hides relic OP and score; renderer accepts missing equipment', async () => {
  const names = en.names; en.names = async () => ({ 1: 'テスト' });
  try {
    const a = { avatarId: 1, fightPropMap: {}, equipList: [{ reliquary: {}, flat: { equipType: 'EQUIP_BRACER', setNameTextMapHash: 'x', reliquaryMainstat: { mainPropId: 'FIGHT_PROP_HP', statValue: 4780 }, reliquarySubstats: [{ appendPropId: 'FIGHT_PROP_CRITICAL', statValue: 10 }] } }] };
    const d = await character.build(a, '123456789', 'hp', false);
    assert.equal(d.showOp, false); assert.equal(d.showScore, false);
    assert.match(d.relics[0].main, /4780/); assert.equal(d.relics[0].subs.length, 1);
    const plain = await cards.charCard(d);
    const scored = await cards.charCard({ ...d, showOp: true, showScore: true });
    assert.equal(plain.subarray(1, 4).toString(), 'PNG'); assert.notDeepEqual(plain, scored);
    const limited = await character.build({ avatarId: 1, lim: true }, '123456789', null, false);
    assert.ok((await cards.charCard(limited)).length > 1000);
  } finally { en.names = names; }
});

test('sticky stays single per channel and stores panel id', async () => {
  const save = st.saveLater; st.saveLater = () => {};
  const sent = [], deleted = [];
  const ch = { id: 'panel-ch', guildId: GI[0], guild: {}, messages: { delete: async id => deleted.push(id) }, send: async p => { sent.push(p); return { id: String(sent.length) }; } };
  try {
    await panel.place(ch, true); await panel.place(ch);
    assert.deepEqual(deleted, ['1']); assert.equal(st.get(ch.guildId).buildPanels[ch.id], '2');
    sent.forEach(p => { assert.equal(p.flags, MessageFlags.SuppressNotifications); p.components.forEach(r => r.toJSON()); });
  } finally { st.saveLater = save; st.db.clear(); }
});

test('bump updates existing message without mentions; repeated ticks do not repeat reminders', async () => {
  const save = st.save; st.save = async () => true;
  const edits = [], sent = [];
  const ch = { messages: { fetch: async () => ({ edit: async p => { edits.push(p); return {}; } }) }, send: async p => { sent.push(p); return { id: 'new' }; } };
  const g = { id: 'bump-guild', channels: { cache: new Collection([['ch', ch]]) } };
  const client = { guilds: { cache: new Collection([[g.id, g]]) } };
  st.get(g.id).bump = { ch: 'ch', msg: 'old', at: Date.now() - 7201000, rem: false };
  try {
    await bump.tick(client); await bump.tick(client);
    assert.equal(edits.length, 1); assert.equal(sent.length, 0); assert.equal(edits[0].content, ''); assert.deepEqual(edits[0].allowedMentions.parse, []);
    ch.messages.fetch = async () => null;
    st.get(g.id).bump.rem = false;
    await bump.tick(client);
    assert.equal(sent[0].flags, MessageFlags.SuppressNotifications);
    assert.deepEqual(sent[0].allowedMentions.parse, []);
    ch.send = async () => { throw new Error('missing permissions'); };
    st.get(g.id).bump.rem = false;
    await bump.tick(client); assert.equal(st.get(g.id).bump.rem, false);
  } finally { st.save = save; st.db.clear(); }
});

test('announce removes success reply, while failed image warning stays visible', async () => {
  const make = image => {
    const i = { customId: 'ann_mdl_123', user: { id: 'u' }, guildId: 'g', channelId: 'c',
      isChatInputCommand: () => false, isRoleSelectMenu: () => false, isStringSelectMenu: () => false, isButton: () => false, isModalSubmit: () => true,
      deferReply: async () => {}, deleteReply: async () => { i.deleted = true; }, editReply: async p => { i.warning = p; },
      fields: { getTextInputValue: () => '本文', getUploadedFiles: () => ({ first: () => image }) },
      guild: { roles: { cache: new Collection() } }, channel: { send: async p => { i.post = p; return { id: 'm' }; } } };
    return i;
  };
  const client = () => ({ commands: new Collection([['announce', { pend: new Map([['123', { ids: [], sticky: false }]]) }]]) });
  const success = make(); await interactions.execute(success, client());
  assert.equal(success.deleted, true); assert.equal(success.warning, undefined); assert.ok(success.post);
  const fetch = global.fetch; global.fetch = async () => { throw new Error('image unavailable'); };
  try {
    const warning = make({ contentType: 'image/png', url: 'https://example.test/image.png' });
    await interactions.execute(warning, client());
    assert.equal(warning.deleted, undefined); assert.match(warning.warning.embeds[0].toJSON().description, /⚠️/);
  } finally { global.fetch = fetch; }
});
