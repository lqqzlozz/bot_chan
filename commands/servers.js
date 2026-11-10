const { SlashCommandBuilder, InteractionContextType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isOwner, deny } = require('../utils/perm');
const st = require('../utils/store');
const directory = require('../utils/serverDirectory');
const sessions = new Map();
const PAGE_TTL = 60 * 60 * 1000;
function pageView(session, index) {
  const count = session.data.length;
  const n = Math.max(0, Math.min(index, Math.max(0,count-1)));
  const embed = directory.makePages(session.data.slice(n,n+1))[0]
    .setTitle(`参加サーバー：${count}件`)
    .setFooter({text:`${count ? n+1 : 0} / ${count}ページ`});
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`servers_prev_${session.owner}`).setLabel('前へ').setStyle(ButtonStyle.Secondary).setDisabled(n===0),
    new ButtonBuilder().setCustomId(`servers_next_${session.owner}`).setLabel('次へ').setStyle(ButtonStyle.Secondary).setDisabled(n>=count-1)
  );
  return {embeds:[embed],components:[row],allowedMentions:{parse:[]}};
}
async function handleButton(i) {
  if (!i.customId?.startsWith('servers_')) return false;
  const owner = i.customId.split('_').at(-1);
  if (i.user.id!==owner || !isOwner(i)) { await i.reply({content:'この一覧を操作できるのは実行者のみです。',ephemeral:true});return true; }
  const session=sessions.get(i.message.id);
  if (!session || session.owner!==owner || Date.now()-session.created>PAGE_TTL) {
    sessions.delete(i.message.id);
    await i.reply({content:'一覧の操作期限が切れました。/servers を再実行してください。',ephemeral:true});return true;
  }
  const delta=i.customId.startsWith('servers_next_')?1:-1;
  session.index=Math.max(0,Math.min(session.data.length-1,session.index+delta));
  await i.update(pageView(session,session.index));
  return true;
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('servers')
    .setDescription('Bot参加サーバーと所有者・招待リンクを表示（管理者専用）')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),

  async execute(i, client) {
    if (!isOwner(i)) return deny(i);
    await i.deferReply();

    // A guild text channel where /servers is invoked becomes the notification target.
    // Bot DMs cannot be used for automatic join notifications.
    let saved = null;
    if (i.guild && i.channel?.isTextBased?.()) {
      const cfg = st.get(i.guild.id);
      cfg.serverJoinNotifyChannelId = i.channelId;
      saved = await st.save(i.guild);
    }
    const list = [...client.guilds.cache.values()].sort((a,b) => {
      // Discord snowflakes are chronological IDs; higher IDs are newer guilds.
      const x=BigInt(a.id),y=BigInt(b.id);
      return x===y?0:x>y?-1:1;
    });
    const data = await Promise.all(list.map(directory.info));
    const notice = i.guild
      ? saved ? '\n🔔 今後の導入通知先：このチャンネル' : '\n⚠️ 通知先の保存に失敗。#bot-config とBOTの権限を確認してください。'
      : '\nℹ️ DMでの実行では通知先を登録できません。サーバー内のチャンネルで実行してください。';
    const session={owner:i.user.id,data,index:0,created:Date.now()};
    const message=await i.editReply({content:`<@${i.user.id}> が参加サーバー一覧を確認${notice}`,...pageView(session,0)});
    sessions.set(message.id,session);
    for (const [id,value] of sessions) if(Date.now()-value.created>PAGE_TTL)sessions.delete(id);
  },
  handleButton,
};
