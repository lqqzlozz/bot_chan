const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const st = require('../utils/store');
const vr = require('../utils/vcrank');
const analytics = require('../utils/analyticsCollector');
const inactive = require('../utils/inactive');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const activityMember = newState.member || oldState.member;
    if (activityMember && oldState.channelId !== newState.channelId) inactive.record(newState.guild, activityMember.user);
    if(oldState.channelId!==newState.channelId) analytics.voiceChanged(newState.guild);
    // ランキング集計
    await vr.onVoice(oldState, newState).catch(e => console.error('VC集計エラー:', e.message));

    if (!newState.channelId) return;
    if (oldState.channelId === newState.channelId) return;
    if (newState.member?.user.bot) return;

    // 読み上げbotとかは数えない
    const vcChannel = newState.channel;
    if (!vcChannel || newState.channelId === newState.guild.afkChannelId || vr.humans(vcChannel).size !== 1) return;

    const notifyChannelId = st.get(newState.guild.id).vc;
    if (!notifyChannelId || st.get(newState.guild.id).vcOff) return;

    const notifyChannel = newState.guild.channels.cache.get(notifyChannelId);
    if (!notifyChannel) return;

    const member = newState.member;
    const roleColor = member?.roles?.color?.hexColor ?? '#5865F2';

    const embed = new EmbedBuilder()
      .setColor(roleColor)
      .setAuthor({
        name: member.displayName,
        iconURL: member.user.displayAvatarURL({ dynamic: true }),
      })
      .setDescription(`<@${member.id}> が **🔊 ${vcChannel.name}** で通話を始めました！\n気軽に参加してね！`)
      .setTimestamp();

    const vcRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('通話に参加する')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${newState.guild.id}/${newState.channelId}`)
    );

    const roleId=require('../utils/vcMentionSchedule').selected(st.get(newState.guild.id).vcMentionSchedule);
    const role=roleId&&newState.guild.roles.cache.get(roleId);
    const mention=role?'<@&'+role.id+'>':null;
    await notifyChannel.send({ ...(mention?{content:mention}:{}), embeds: [embed], components: [vcRow],allowedMentions:{parse:[],roles:role?[role.id]:[]} }).catch(e => console.error('VC通知失敗:', e.message));
  },
};
