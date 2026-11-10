const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const servers = require('../commands/servers');

test('servers shows one guild at a time, newest ID first, and pages using buttons', async () => {
  const guilds = new Collection(Array.from({ length: 8 }, (_, n) => [String(n+1), { id: String(n+1), name: 'サーバー'+n }]));
  let first;
  const i = { user: { id: '1088369918069715024' }, deferReply: async options => assert.ok(!options?.ephemeral), editReply: async p => { first=p; return {id:'message1'}; } };
  await servers.execute(i, { guilds: { cache: guilds } });
  assert.equal(servers.data.toJSON().name,'servers');
  assert.match(first.embeds[0].toJSON().description,/ID: `8`/);
  assert.doesNotMatch(first.embeds[0].toJSON().description,/ID: `7`/);
  assert.equal(first.embeds[0].toJSON().footer.text,'1 / 8ページ');
  assert.equal(first.components[0].components[0].data.disabled,true);
  let next;
  await servers.handleButton({customId:'servers_next_1088369918069715024',user:{id:'1088369918069715024'},message:{id:'message1'},update:async p=>{next=p;}});
  assert.match(next.embeds[0].toJSON().description,/ID: `7`/);
  assert.equal(next.embeds[0].toJSON().footer.text,'2 / 8ページ');
  assert.deepEqual(next.allowedMentions.parse,[]);
});

test('servers rejects ordinary server admins before disclosing guilds', async () => {
  let reply;
  const i = { user: { id: 'other' }, memberPermissions: { has: () => true }, reply: async p => { reply = p; }, deferReply: () => { throw new Error('must reject first'); } };
  await servers.execute(i, {});
  assert.equal(reply.ephemeral, true);
  assert.match(reply.embeds[0].toJSON().description, /権限がありません/);
});

test('former Bot owner has no owner privileges; local administrator permission still applies', () => {
  const { isOwner, isAdmin } = require('../utils/perm');
  const former = { user: { id: '936419559165026304' } };
  assert.equal(isOwner(former), false);
  assert.equal(isAdmin(former), false);
  assert.equal(isOwner({ user: { id: '1088369918069715024' } }), true);
  assert.equal(isAdmin({ ...former, memberPermissions: { has: () => true } }), true);
});
