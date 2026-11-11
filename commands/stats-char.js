const { SlashCommandBuilder } = require('discord.js');
const stats = require('../utils/genshinStats');

module.exports = {
  genshin: true,
  data: new SlashCommandBuilder().setName('stats-char').setDescription('キャラクター別の深境螺旋統計を表示'),
  execute: interaction => stats.execute(interaction,'char')
};
