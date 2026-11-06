const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { isEnabled } = require('./entryScope');
const schedule = require('./seasonSchedule');
const st = require('./store');
const CHANNEL_ID = '1568107786376847501';
const posts = require('./seasonPosts');

function panel() {
  return {
    embeds: [new EmbedBuilder().setColor('#D69A32').setTitle('杖と剣の伝説｜シーズン日程')
      .setDescription('下のボタンから開始日を指定してください。\n指定した日から、そのシーズンの最終日まで、日付ごとにこのチャンネルへ公開投稿します。同じ日付の投稿は再利用します。\n\nリマインドは各日付の投稿への返信で、日本時間08:00に届きます。\n・ダンジョン：7日前・2日前\n・遺物：10日前・3日前\n・次シーズン：1か月前・7日前・前日\n次シーズンの案内はシーズン最終日の投稿に添えます。')],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('season_open').setLabel('開始日を指定').setEmoji('📅').setStyle(ButtonStyle.Primary))],
    allowedMentions: { parse: [] },
  };
}

function embeds(result, fallback) {
  return posts.buildDays(result, fallback).flatMap(day => day.embeds);
}

async function ensure(client) {
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel?.guild || !isEnabled(channel.guild.id) || !channel.isTextBased() || !channel.send) throw new Error('日程パネルの設置先を確認できません。');
  const data = st.get(channel.guild.id), old = data.seasonPanel;
  let message;
  if (old?.channelId === CHANNEL_ID && old.messageId) {
    try { message = await channel.messages.fetch(old.messageId); }
    catch (error) { if (error.code !== 10008) throw error; }
  }
  if (!message || message.author.id !== client.user.id) {
    // Recover after lost config metadata. A history failure must not create duplicates.
    const recent = await channel.messages.fetch({ limit: 100 });
    message = recent.find(m => m.author.id === client.user.id && m.components?.some(row => row.components?.some(c => c.customId === 'season_open')));
  }
  if (message) await message.edit(panel());
  else message = await channel.send(panel());
  if (old?.channelId !== CHANNEL_ID || old?.messageId !== message.id) {
    data.seasonPanel = { channelId: CHANNEL_ID, messageId: message.id };
    if (!await st.save(channel.guild)) console.error('日程パネル設置情報を保存できませんでした。');
  }
  console.log('日程パネル設置完了:', CHANNEL_ID, message.id);
  return message;
}

async function handle(i) {
  if (!isEnabled(i.guildId)) return i.reply({ content: 'このサーバーでは利用できません。', flags: MessageFlags.Ephemeral });
  if (i.customId === 'season_open' && i.isButton()) {
    const modal = new ModalBuilder().setCustomId('season_date').setTitle('シーズン日程の開始日');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('開始日（YYYY-MM-DD）').setPlaceholder('例：2026-11-15').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)));
    return i.showModal(modal);
  }
  if (i.customId === 'season_date' && i.isModalSubmit()) {
    const input = i.fields.getTextInputValue('date');
    try { schedule.parseDate(input); }
    catch (error) { return i.reply({ content: error.message, flags: MessageFlags.Ephemeral }); }
    await i.deferReply();
    const loaded = await schedule.load();
    let result;
    try { result = schedule.range(input, loaded.data); }
    catch (error) { return i.editReply({ content: error.message }); }
    if (i.channelId !== CHANNEL_ID) return i.editReply({ content: '日程パネルのあるチャンネルで操作してください。' });
    await i.editReply({ content: `${result.season}｜${result.start}〜${result.end} の日程を公開しています。` });
    const channel = await i.client.channels.fetch(CHANNEL_ID);
    const published = await posts.publish(channel, i.client.user.id, result, loaded.fallback);
    return i.editReply({ content: `${result.season}｜${result.start}〜${result.end}\n${published.days}日分の日程を公開しました（同じ日付は更新）。対象の予定は日本時間08:00に、各日付の投稿へ返信してリマインドします。`, allowedMentions: { parse: [] } });
  }
}

module.exports = { CHANNEL_ID, panel, embeds, ensure, handle };
