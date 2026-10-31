const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const preview = require('../utils/panelTestPreview');
const { isGI } = require('../utils/gi');
module.exports = {
  guild: ['1341988738074542111'],
  data: new SlashCommandBuilder().setName('panel-test').setDescription('新しい管理パネルの表示と画面遷移を安全に試します'),
  async execute(i) {
    if (i.guildId !== '1341988738074542111' || i.user.id !== i.guild?.ownerId) {
      return i.reply({content:'このテストは指定サーバーの所有者専用です。',flags:MessageFlags.Ephemeral});
    }
    if (i.channel?.name !== 'bot-config') return i.reply({content:'#bot-config で実行してください。',flags:MessageFlags.Ephemeral});
    return i.reply({...preview.render('home', isGI(i.guildId)||require('../utils/store').get(i.guildId).panelTestGenshin===true?'on':require('../utils/store').get(i.guildId).panelTestGenshin===false?'off':'pending'),flags:MessageFlags.IsComponentsV2});
  }
};
