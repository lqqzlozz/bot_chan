const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const st = require('./store');

async function ensureConfig(guild) {
  const me = guild.members.me || await guild.members.fetchMe();
  let ch = st.findCh(guild);
  if (!ch) {
    if (!me.permissions.has(P.ManageChannels)) throw new Error('Botに「チャンネルの管理」権限を付けて /setup を再実行してください。または #bot-config を手動で作成してください。');
    const adminRoles = [...guild.roles.cache.values()].filter(role =>
      role.id !== guild.roles.everyone.id && role.permissions.has(P.Administrator));
    ch = await guild.channels.create({
      name: st.CH_NAME, type: ChannelType.GuildText,
      topic: 'Botの設定保存専用。削除・改名しないでください。使い方は /help。',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
        { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] },
        { id: guild.ownerId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] },
        ...adminRoles.map(role => ({ id: role.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] })),
      ],
      reason: '管理者によるBot初期設定',
    });
  }
  const required = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles];
  if (!ch.permissionsFor(me)?.has(required)) throw new Error('#bot-config でBotの「チャンネルを見る」「メッセージを送信」「メッセージ履歴を読む」「ファイルを添付」を許可してください。');
  if (!await st.save(guild)) throw new Error(st.warn(guild).trim() || '#bot-config に設定を保存できませんでした。チャンネルとBotの権限を確認して、再実行してください。');
  await require('./managementPanel').ensure(guild);
  return ch;
}
module.exports = { ensureConfig };
