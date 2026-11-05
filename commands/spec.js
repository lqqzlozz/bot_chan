const { SlashCommandBuilder, MessageFlags } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder().setName('spec').setDescription('スマホ・PCの端末診断ページを開きます'),
  async execute(i) {
    const base = process.env.SPEC_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
    if (!base || !/^https:\/\//i.test(base)) return i.reply({content:'端末診断ページの公開URLが未設定です。管理者は SPEC_PUBLIC_URL にHTTPSの公開URLを設定してください。',flags:MessageFlags.Ephemeral});
    return i.reply({content:'**DEVICE SPEC**\n端末情報を確認するにはこちらを開いてください。\n'+base.replace(/\/$/,'')+'/spec\n\n結果は自動投稿されません。「結果をコピー」から任意で共有できます。',flags:MessageFlags.Ephemeral});
  },
};
