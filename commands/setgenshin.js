const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const st = require('../utils/store');
const { isAdmin, deny } = require('../utils/perm');
const { ensureConfig } = require('../utils/setup');
const { syncGuild } = require('../utils/registerCommands');

module.exports = {
  data: new SlashCommandBuilder().setName('setgenshin').setDescription('このサーバーを原神サーバーとして登録し専用コマンドを有効にします').setContexts(InteractionContextType.Guild),
  async execute(i, client) {
    if (!isAdmin(i)) return deny(i);
    await i.deferReply();
    try { await ensureConfig(i.guild); } catch (e) { return i.editReply(`⚠️ ${e.message}`); }
    const d = st.get(i.guildId);
    const previous = d.genshin;
    d.genshin = true;
    if (!await st.save(i.guild)) {
      d.genshin = previous;
      return i.editReply('⚠️ 原神サーバー登録を保存できませんでした。#bot-config の権限を確認して再実行してください。');
    }
    try { await syncGuild(client, i.guildId); }
    catch (e) {
      console.error('原神コマンド登録失敗:', e);
      return i.editReply('⚠️ 原神サーバー登録は保存しましたが、Discordへのコマンド登録に失敗しました。少し待って /setgenshin を再実行してください。');
    }
    return i.editReply({ content: 'このサーバーを原神サーバーとして登録しました。専用コマンドが表示されない場合はDiscordを開き直してください。', allowedMentions: { parse: [] } });
  },
};
