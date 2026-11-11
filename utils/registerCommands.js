const { Routes } = require('discord.js');
const { isGI, guildIds } = require('./gi');

// Only commands without an equivalent management-panel action are published.
// Legacy command handlers remain in the repository for internal compatibility.
const VISIBLE_COMMANDS = new Set(['entry', 'servers', 'spec', 'stats-pull', 'stats-usage', 'stats-team']);
const visible = c => VISIBLE_COMMANDS.has(c.data.name);

function guildCommands(client, id) {
  return [...client.commands.values()]
    .filter(visible)
    .filter(c => c.genshin ? isGI(id) : c.guild && [].concat(c.guild).includes(id))
    .map(c => c.data.toJSON());
}

async function syncGuild(client, id, rest = client.rest) {
  return rest.put(Routes.applicationGuildCommands(client.user.id, id), { body: guildCommands(client, id) });
}

async function syncAll(client, rest = client.rest) {
  const all = [...client.commands.values()].filter(visible);
  await rest.put(Routes.applicationCommands(client.user.id), { body: all.filter(c => !c.guild && !c.genshin).map(c => c.data.toJSON()) });
  const ids = new Set([...guildIds(client), ...all.filter(c => c.guild).flatMap(c => [].concat(c.guild))]);
  for (const id of ids) {
    if (!client.guilds.cache.has(id)) continue;
    await syncGuild(client, id, rest).catch(e => console.error(`コマンド登録エラー(${id}):`, e.message));
  }
}

module.exports = { guildCommands, syncGuild, syncAll };
