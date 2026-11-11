const { SlashCommandBuilder } = require('discord.js');
const stats = require('../utils/genshinStats');
module.exports = { genshin: true, data: new SlashCommandBuilder().setName('stats-usage').setDescription('螺旋におけるキャラクター使用率を表示'), execute: i => stats.execute(i, 'usage') };
