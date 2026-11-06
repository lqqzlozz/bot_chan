const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, escapeMarkdown } = require('discord.js');
const { isEnabled } = require('./entryScope');
const schedule = require('./seasonSchedule');
const st = require('./store');

function panel() {
  return {
    embeds: [new EmbedBuilder().setColor('#D69A32').setTitle('杖と剣の伝説｜シーズン日程')
      .setDescription('下のボタンから開始日を指定してください。\n指定した日から、その日が属するシーズンの最終日までのスケジュールを表示します。\n結果は操作した人だけに表示されます。')],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('season_open').setLabel('開始日を指定').setEmoji('📅').setStyle(ButtonStyle.Primary))],
    allowedMentions: { parse: [] },
  };
}

function embeds(result, fallback) {
  const chunks = [];
  let text = '', previous;
  for (const entry of result.entries) {
    const date = schedule.dateAt(entry.day);
    for (const event of entry.events) {
      const heading = date !== previous ? '\n**' + date + '**\n' : '';
      const line = heading + '・' + (schedule.categories[entry.category] || escapeMarkdown(entry.category)) + '：' + escapeMarkdown(event) + '\n';
      if (text.length + line.length > 3200) { chunks.push(text); text = '**' + date + '（続き）**\n'; }
      text += line;
      previous = date;
    }
  }
  if (text) chunks.push(text);
  if (!chunks.length) chunks.push('この期間に登録された解放・イベント予定はありません。');
  return chunks.map((description, index) => new EmbedBuilder().setColor('#D69A32')
    .setTitle(result.season + '｜' + result.start + '〜' + result.end)
    .setDescription(description)
    .addFields({ name: '日程について', value: 'イグニス開始日 2026-11-11 を基準に計算。終了日は次シーズン開始前日の予定日です。\n名称は取得元の原文、周期イベントの報酬は枠名で表示しています。日本版の変更によりずれる場合があります。' + (fallback ? '\n⚠️ 最新データを取得できなかったため、保存済みデータを使用しています。' : '') })
    .setURL('https://qenu.github.io/ethna-timeline/')
    .setFooter({ text: `出典：那由多 杖劍時間軸 ｜ ${index + 1}/${chunks.length}` }));
}

async function place(i) {
  if (!isEnabled(i.guildId)) return i.reply({ content: 'このサーバーでは利用できません。', flags: MessageFlags.Ephemeral });
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = await i.guild.channels.fetch(i.values[0]).catch(() => null);
  if (!channel?.isTextBased() || !channel.send) return i.editReply({ content: '投稿可能なテキストチャンネルを選択してください。' });
  const data = st.get(i.guildId), old = data.seasonPanel;
  const existing = old?.channelId === channel.id && await channel.messages.fetch(old.messageId).catch(() => null);
  if (existing && existing.author.id === i.client.user.id) {
    await existing.edit(panel());
    return i.editReply({ content: '日程パネルを更新しました。投稿先：<#' + channel.id + '>' });
  }
  const message = await channel.send(panel());
  data.seasonPanel = { channelId: channel.id, messageId: message.id };
  if (!await st.save(i.guild)) {
    data.seasonPanel = old;
    return i.editReply({ content: 'パネルは投稿しましたが、設置情報を保存できませんでした。設定チャンネルの権限を確認してください。' });
  }
  return i.editReply({ content: '日程パネルを設置しました。投稿先：<#' + channel.id + '>\n会話に合わせた最下部への貼り直しは行いません。' });
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
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const loaded = await schedule.load();
    let result;
    try { result = schedule.range(input, loaded.data); }
    catch (error) { return i.editReply({ content: error.message }); }
    const pages = embeds(result, loaded.fallback);
    await i.editReply({ embeds: [pages[0]], allowedMentions: { parse: [] } });
    for (const embed of pages.slice(1)) await i.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }
}

module.exports = { panel, embeds, place, handle };
