const { SlashCommandBuilder, MessageFlags } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder().setName('spec').setDescription('スマホ・PCの端末診断ページを開きます'),
  async execute(i) {
    const base = process.env.SPEC_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
    if (!base || !/^https:\/\//i.test(base)) return i.reply({content:'端末診断ページの公開URLが未設定です。管理者は SPEC_PUBLIC_URL にHTTPSの公開URLを設定してください。',flags:MessageFlags.Ephemeral});
    const token = require('../utils/specSessions').create(i.user.id, i.channelId, i.guildId);
    return i.reply({content:'**DEVICE SPEC**\n端末情報を確認するにはこちらを開いてください。\n'+base.replace(/\/$/,'')+'/spec?token='+token+'\n\n診断ページの「Discordに投稿」を押すと、このチャンネルに画像カードが投稿されます（確認画面あり）。リンクの有効期限は10分です。',flags:MessageFlags.Ephemeral});
  },
};
