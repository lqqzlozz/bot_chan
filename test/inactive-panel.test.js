const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const panel = require('../utils/panelTestPreview');
const st = require('../utils/store');

test('inactive panel clears legacy embeds when switching to Components V2', () => {
  const result = panel.render('inactive', 'off', 'inactive-panel-test');
  assert.deepEqual(result.embeds, []);
  assert.equal(result.content, null);
  assert.equal(result.flags, MessageFlags.IsComponentsV2);
  st.db.delete('inactive-panel-test');
});

test('enabling monitoring saves the selected role and refreshes the old panel', async t => {
  const inactive = require('../utils/inactive');
  const audit = require('../utils/managementAudit');
  const guildId = 'inactive-panel-test';
  t.mock.method(st, 'save', async () => true);
  t.mock.method(st, 'findCh', () => ({ id: 'config', permissionsFor: () => ({ has: () => true }) }));
  t.mock.method(inactive, 'managedRole', async () => ({ id: 'role' }));
  t.mock.method(audit, 'record', async () => {});
  st.get(guildId).inactiveSettings = { role: 'role', exclude: 'excluded' };
  const output = [];
  const i = {
    guildId, customId: 'pt_inactive_on', user: { id: 'admin' },
    guild: { id: guildId, members: { me: { permissions: { has: () => true } } } },
    channel: { name: 'bot-config' }, memberPermissions: { has: () => true },
    isButton: () => true, deferUpdate: async () => {},
    editReply: async value => output.push(value),
    followUp: async value => assert.fail(value.content),
  };
  try {
    await panel.handle(i);
    assert.equal(st.get(guildId).inactive.enabled, true);
    assert.equal(st.get(guildId).inactive.role, 'role');
    assert.deepEqual(output[0].embeds, []);
    assert.match(JSON.stringify(output[0]), /ON/);
  } finally { st.db.delete(guildId); }
});
