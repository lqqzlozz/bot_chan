const {SlashCommandBuilder,MessageFlags,InteractionContextType}=require('discord.js');
const st=require('../utils/store');
const {isAdmin,deny}=require('../utils/perm');
const preview=require('../utils/panelTestPreview');
const {isGI}=require('../utils/gi');
module.exports={
 data:new SlashCommandBuilder().setName('panel').setDescription('BOT管理パネルを開く（ベータ版）').setContexts(InteractionContextType.Guild),
 async execute(i){
  if(!isAdmin(i))return deny(i);
  if(i.channel?.name!=='bot-config')return i.reply({content:'#bot-config で実行してください。',flags:MessageFlags.Ephemeral});
  const d=st.get(i.guildId);
  return i.reply(preview.render('home',isGI(i.guildId)||d.panelTestGenshin===true?'on':d.panelTestGenshin===false?'off':'pending',i.guildId));
 }
};
