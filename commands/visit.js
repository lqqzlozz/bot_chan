const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { GUILD } = require('../utils/visitReservations');
const panel = require('../utils/visitPanel');

module.exports = {
  guild: GUILD,
  data: new SlashCommandBuilder().setName('visit').setDescription('見学会場と来場予約表を管理します')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    try { await panel.openManagement(interaction); }
    catch (error) { await panel.reportError(interaction, error); }
  },
};
