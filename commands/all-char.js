const { SlashCommandBuilder } = require('discord.js');
module.exports = {
  genshin: true,
  data: new SlashCommandBuilder().setName('all-char').setDescription('自分の所持キャラの名前・レベル・凸数を表示します'),
  execute: interaction => require('../utils/allCharacters').execute(interaction),
};
