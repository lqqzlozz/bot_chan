const { SlashCommandBuilder } = require('discord.js');
const stats = require('../utils/genshinStats');
module.exports = { genshin: true, data: new SlashCommandBuilder().setName('stats-pull').setDescription('キャラクター所持率を表示'), execute: i => stats.execute(i, 'pull') };
