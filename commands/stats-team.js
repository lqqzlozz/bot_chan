const { SlashCommandBuilder } = require('discord.js');
const stats = require('../utils/genshinStats');
module.exports = { genshin: true, data: new SlashCommandBuilder().setName('stats-team').setDescription('螺旋における人気パーティーを表示'), execute: i => stats.execute(i, 'team') };
