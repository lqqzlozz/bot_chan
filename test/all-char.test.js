const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Collection, MessageFlags } = require('discord.js');
const st = require('../utils/store');
const api = require('../utils/hoyolabApi');
const store = require('../utils/hoyolabStore');
const links = require('../utils/hoyolabLink');
const command = require('../commands/all-char');
const view = require('../utils/allCharacters');
const networkFetch = global.fetch;

function fixture() {
  const guild = { id: 'all-char-guild', client: {} };
  const client = { guilds: { cache: new Collection([[guild.id, guild]]) } };
  st.get(guild.id).genshin = true;
  st.get(guild.id).intro = { member: { uid: '800000001' } };
  const responses = [];
  const interaction = { guildId: guild.id, guild, client, user: { id: 'member' }, responses,
    deferReply: async value => { interaction.deferred = value || true; }, deferUpdate: async () => {},
    reply: async value => { responses.push(value); }, update: async value => { responses.push(value); },
    editReply: async value => { responses.push(value); }, deleteReply: async () => {},
  };
  return { guild, client, interaction, responses };
}

async function isolated(run) {
  const original = { save: st.save, fetch: global.fetch, login: api.login, verifyEmail: api.verifyEmail,
    account: api.account, characters: api.characters, key: process.env.HOYOLAB_ENCRYPTION_KEY,
    origin: process.env.HOYOLAB_PUBLIC_URL };
  process.env.HOYOLAB_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.HOYOLAB_PUBLIC_URL = 'https://bot.example';
  st.save = async () => true;
  st.db.delete('all-char-guild');
  try { await run(); }
  finally {
    st.save = original.save; global.fetch = original.fetch;
    for (const name of ['login', 'verifyEmail', 'account', 'characters']) api[name] = original[name];
    if (original.key === undefined) delete process.env.HOYOLAB_ENCRYPTION_KEY; else process.env.HOYOLAB_ENCRYPTION_KEY = original.key;
    if (original.origin === undefined) delete process.env.HOYOLAB_PUBLIC_URL; else process.env.HOYOLAB_PUBLIC_URL = original.origin;
    st.db.delete('all-char-guild');
  }
}

const cookies = { cookie_token_v2: 'test-cookie-token', account_id_v2: '123', ltoken_v2: 'test-ltoken' };
const roster = [{ id: '10000073', name: 'ナヒーダ', level: 90, constellation: 2 }];

test('encrypted cookies bind to both guild and user and reject tampering or a missing key', async () => isolated(async () => {
  const sealed = store.encrypt('guild', 'user', cookies);
  assert.ok(!JSON.stringify(sealed).includes('test-cookie-token'));
  assert.deepEqual(store.decrypt('guild', 'user', sealed), cookies);
  assert.throws(() => store.decrypt('other', 'user', sealed), /再連携/);
  assert.throws(() => store.decrypt('guild', 'other', sealed), /再連携/);
  assert.throws(() => store.decrypt('guild', 'user', { ...sealed, data: 'AAAA' }), /再連携/);
  delete process.env.HOYOLAB_ENCRYPTION_KEY;
  assert.throws(() => store.encryptionKey(), /未設定/);
}));

test('character data requires explicit levels and constellations and retains Japanese names', () => {
  const list = api.normalizeCharacters({ list: [
    { id: 2, name: 'フリーナ', level: 90, actived_constellation_num: 0 },
    { id: 1, name: 'ナヒーダ', level: 100, actived_constellation_num: 6 },
  ] });
  assert.deepEqual(list.map(item => item.name), ['ナヒーダ', 'フリーナ']);
  assert.equal(list[0].level, 100);
  assert.equal(list[1].constellation, 0);
  assert.throws(() => api.normalizeCharacters({ list: [{ id: 1, name: '名前', level: 90 }] }), /未対応/);
  assert.throws(() => api.normalizeCharacters({ avatars: [] }), /応答形式/);
});

test('login sends RSA ciphertext and handles image verification, email verification and token exchange', async () => isolated(async () => {
  const credentials = api.encryptCredentials('test@example.invalid', 'test-password');
  assert.equal(Buffer.from(credentials.password, 'base64').length, 256);
  const calls = [];
  const results = [
    new Response(JSON.stringify({ retcode: -3101 }), { headers: { 'x-rpc-aigis': JSON.stringify({ session_id: 'session', data: JSON.stringify({ use_v4: true, gt: 'captcha-id', risk_type: 'slide' }) }) } }),
    new Response(JSON.stringify({ retcode: -3239 }), { headers: { 'x-rpc-verify': JSON.stringify({ risk_ticket: 'risk', verify_str: JSON.stringify({ ticket: 'ticket', verify_type: 'email' }) }) } }),
    new Response(JSON.stringify({ retcode: 0, data: {} })),
    new Response(JSON.stringify({ retcode: 0, data: { token: { token: 'temporary-stoken' }, user_info: { aid: '123', mid: 'mid' } } })),
    new Response(JSON.stringify({ retcode: 0, data: { tokens: [{ token_type: 2, token: 'test-ltoken' }, { token_type: 4, token: 'test-cookie-token' }] } })),
  ];
  global.fetch = async (url, options) => { calls.push({ url, options }); return results.shift(); };
  const image = await api.login(credentials, 'device');
  assert.equal(image.step, 'captcha');
  const email = await api.login(credentials, 'device', { captcha: { sessionId: 'session', result: { captcha_id: 'captcha-id' } } });
  assert.equal(email.step, 'email');
  await api.verifyEmail('123456', email.ticket);
  const result = await api.login(credentials, 'device', { ticket: email.ticket });
  assert.equal(result.step, 'success');
  assert.equal(result.cookies.cookie_token_v2, 'test-cookie-token');
  assert.equal(result.cookies.stoken, undefined);
  assert.ok(!calls[0].options.body.includes('test-password'));
  assert.equal(calls[0].options.headers['x-rpc-device_id'], 'device');
  assert.ok(calls[1].options.headers['x-rpc-aigis'].startsWith('session;'));
  assert.ok(calls[3].options.headers['x-rpc-verify'].includes('ticket'));
  assert.ok(calls[4].url.endsWith('/token/getBySToken'));
}));

test('account ownership is checked and API errors cannot silently become a partial roster', async () => isolated(async () => {
  global.fetch = async () => new Response(JSON.stringify({ retcode: 0, data: { list: [{ game_uid: '800000002', game_biz: 'hk4e_global', region: 'os_asia' }] } }));
  await assert.rejects(api.account(cookies, '800000001'), /紐づいていません/);
  global.fetch = async () => new Response(JSON.stringify({ retcode: 10001, data: null }));
  await assert.rejects(api.characters(cookies, { uid: '800000001', server: 'os_asia' }), error => error.kind === 'auth');
  global.fetch = async () => new Response('<html>unavailable</html>', { status: 403 });
  await assert.rejects(api.characters(cookies, { uid: '800000001', server: 'os_asia' }), /HTTP 403/);
}));

test('link persists only encrypted cookies and preserves old data when saving fails', async () => isolated(async () => {
  const f = fixture();
  api.account = async () => ({ uid: '800000001', server: 'os_asia' });
  api.characters = async () => roster;
  const saved = [];
  st.save = async () => { saved.push(JSON.stringify(st.get(f.guild.id))); return true; };
  await store.link(f.guild, 'member', '800000001', cookies);
  assert.ok(saved[0].includes('ナヒーダ'));
  assert.ok(!saved[0].includes('test-cookie-token'));
  const previous = JSON.stringify(store.entry(f.guild.id, 'member'));
  st.save = async () => false;
  await assert.rejects(store.unlink(f.guild, 'member'), /保存/);
  assert.equal(JSON.stringify(store.entry(f.guild.id, 'member')), previous);
}));

test('expired authentication shows the saved roster until relinking succeeds', async () => isolated(async () => {
  const f = fixture();
  api.account = async () => ({ uid: '800000001', server: 'os_asia' }); api.characters = async () => roster;
  await store.link(f.guild, 'member', '800000001', cookies);
  api.characters = async () => { throw new api.HoyoError('expired', 'auth'); };
  const result = await store.roster(f.guild, 'member', '800000001', true);
  assert.equal(result.status, 'auth');
  assert.equal(result.value.characters[0].name, 'ナヒーダ');
  assert.equal(store.entry(f.guild.id, 'member').needsAuth, true);
  const display = view.render('member', result);
  assert.match(display.embeds[0].toJSON().footer.text, /再連携/);
  api.characters = async () => [{ ...roster[0], constellation: 3 }];
  await store.link(f.guild, 'member', '800000001', cookies);
  const fresh = await store.roster(f.guild, 'member', '800000001');
  assert.equal(fresh.status, 'ok'); assert.equal(fresh.value.characters[0].constellation, 3);
}));

test('command uses public embeds while only its owner receives the private authentication link', async () => isolated(async () => {
  const f = fixture();
  await command.execute(f.interaction);
  assert.equal(f.interaction.deferred, true);
  assert.equal(f.responses[0].embeds[0].toJSON().title, '所持キャラクター一覧');
  f.interaction.customId = 'allchar:member:connect';
  await view.handle(f.interaction);
  assert.equal(f.interaction.deferred.flags, MessageFlags.Ephemeral);
  const url = f.responses.at(-1).components[0].toJSON().components[0].url;
  assert.match(url, /^https:\/\/bot\.example\/hoyolab#[a-f0-9]{64}$/);
  f.interaction.user.id = 'other';
  await view.handle(f.interaction);
  assert.match(f.responses.at(-1).embeds[0].toJSON().description, /本人/);
}));

test('pagination renders all characters across pages and the command is scoped to Genshin guilds', () => {
  const value = { uid: '800000001', fetchedAt: Date.now(), characters: Array.from({ length: 41 }, (_, i) => ({ id: String(i), name: 'キャラ' + i, level: 90, constellation: i % 7 })) };
  const display = view.render('member', { value, status: 'ok' }, 2);
  assert.match(display.embeds[0].toJSON().description, /キャラ40/);
  assert.match(display.embeds[0].toJSON().footer.text, /3\/3/);
  for (const item of display.components) item.toJSON();
  const { guildCommands } = require('../utils/registerCommands');
  assert.equal(guildCommands({ commands: new Collection([['all-char', command]]) }, '1386706264578461726')[0].name, 'all-char');
  assert.equal(guildCommands({ commands: new Collection([['all-char', command]]) }, 'non-genshin').length, 0);
});

async function serverFor(client, run) {
  const server = http.createServer((req, res) => links.handle(req, res, client));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('HTTP linking rejects missing origin or token and consumes a successful link without leaking credentials', async () => isolated(async () => {
  const f = fixture();
  api.login = async () => ({ step: 'success', cookies });
  api.account = async () => ({ uid: '800000001', server: 'os_asia' }); api.characters = async () => roster;
  const token = new URL(links.create(f.guild.id, 'member', '800000001')).hash.slice(1);
  await serverFor(f.client, async base => {
    const post = (body, headers = {}) => networkFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.equal((await post({ action: 'status' })).status, 403);
    assert.equal((await post({ action: 'status' }, { Origin: 'https://bot.example' })).status, 403);
    const headers = { Origin: 'https://bot.example', Authorization: 'Bearer ' + token };
    const status = await post({ action: 'status' }, headers);
    assert.equal((await status.json()).uid, '800000001');
    const login = await post({ action: 'login', email: 'test@example.invalid', password: 'test-password' }, headers);
    const result = await login.json();
    assert.equal(result.step, 'success');
    assert.equal(result.count, 1);
    assert.ok(!JSON.stringify(result).includes('cookie'));
    assert.ok(!JSON.stringify(st.get(f.guild.id)).includes('test-password'));
    assert.equal((await post({ action: 'status' }, headers)).status, 403);
  });
}));

test('HTTP email verification preserves the server ticket and never accepts another account UID', async () => isolated(async () => {
  const f = fixture(); let attempts = 0;
  api.login = async () => ++attempts === 1 ? { step: 'email', ticket: { risk_ticket: 'private-ticket', verify_str: { ticket: 'ticket' } } } : { step: 'success', cookies };
  api.verifyEmail = async (code, ticket) => { assert.equal(code, '123456'); assert.equal(ticket.risk_ticket, 'private-ticket'); };
  api.account = async () => { throw new api.HoyoError('登録UIDが一致しません。', 'account'); };
  const token = new URL(links.create(f.guild.id, 'member', '800000001')).hash.slice(1);
  await serverFor(f.client, async base => {
    const post = body => networkFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://bot.example', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    const start = await (await post({ action: 'login', email: 'test@example.invalid', password: 'test-password' })).json();
    assert.deepEqual(start, { step: 'email' });
    assert.equal((await post({ action: 'email', code: '123456' })).status, 400);
    assert.equal(store.entry(f.guild.id, 'member'), undefined);
  });
}));

test('unlink revokes outstanding links and an in-flight login cannot restore deleted credentials', async () => isolated(async () => {
  const f = fixture();
  const token = new URL(links.create(f.guild.id, 'member', '800000001')).hash.slice(1);
  links.revoke(f.guild.id, 'member');
  await serverFor(f.client, async base => {
    const response = await networkFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://bot.example', Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'status' }) });
    assert.equal(response.status, 403);
  });
  let allowLink = true, release, started;
  const reached = new Promise(resolve => { started = resolve; });
  api.account = async () => ({ uid: '800000001', server: 'os_asia' });
  api.characters = async () => { started(); await new Promise(resolve => { release = resolve; }); return roster; };
  const pending = store.link(f.guild, 'member', '800000001', cookies, () => allowLink);
  await reached;
  allowLink = false;
  await store.unlink(f.guild, 'member');
  release();
  await assert.rejects(pending, /解除/);
  assert.equal(store.entry(f.guild.id, 'member'), undefined);
}));
