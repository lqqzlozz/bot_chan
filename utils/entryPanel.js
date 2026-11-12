const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, StringSelectMenuBuilder, escapeMarkdown
} = require('discord.js');
const st = require('./store');
const { isOwner } = require('./perm');
const { isEnabled } = require('./entryScope');
const { parsePower, splitTeams } = require('./entryTeams');

const jobs = ['闘志', '騎士', '賢者', '魔導'];
const noMentions = { parse: [], repliedUser: false };
const number = new Intl.NumberFormat('ja-JP');
const pending = new Map();

async function serialize(channelId, operation) {
  const next = (pending.get(channelId) || Promise.resolve()).catch(() => {}).then(operation);
  pending.set(channelId, next);
  try { return await next; }
  finally { if (pending.get(channelId) === next) pending.delete(channelId); }
}

function panel(data) {
  const button = (id, label, style) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  const row = new ActionRowBuilder().addComponents(
    button('entry_join', '参加・情報を編集', ButtonStyle.Primary),
    button('entry_leave', '辞退する', ButtonStyle.Secondary),
    button('entry_roster', '参加者一覧', ButtonStyle.Secondary),
    button('entry_pair', 'ペア分け', ButtonStyle.Secondary),
    button('entry_team4', '4人チーム分け', ButtonStyle.Secondary)
  );
  const embed = new EmbedBuilder().setColor('#5865F2').setDescription(data.text);
  const participants = data.participants;
  const ready = participants.filter(registered).length;
  const names = participants.map(p => escapeMarkdown(p.name)).join('、');
  embed.addFields({
    name: `現在の参加者（${participants.length}人・登録済み ${ready}人）`,
    value: names.length > 1000 ? names.slice(0, 1000) + '…' : names || 'まだ参加者はいません。'
  });
  return { embeds: [embed], components: [row], allowedMentions: noMentions };
}

function registered(player) {
  return Number.isSafeInteger(player.power) && player.power > 0 && jobs.includes(player.job);
}

function playerLine(player) {
  const name = escapeMarkdown(player.name);
  return registered(player)
    ? `- ${name}｜${escapeMarkdown(player.job)}｜戦力 ${number.format(player.power)}`
    : `- ${name}｜戦力・職業 未登録`;
}

function report(title, body, filename) {
  const content = `## ${title}\n${body}`;
  if (content.length <= 2000) return { content, allowedMentions: noMentions };
  return { content: title, files: [{ attachment: Buffer.from(content), name: filename }], allowedMentions: noMentions };
}

function getEntry(interaction, messageId) {
  const data = st.get(interaction.guildId).entry[interaction.channelId];
  return data?.msg === messageId ? data : null;
}

function registrationForm(messageId, participant, proxy = false) {
  const power = new TextInputBuilder().setCustomId('power')
    .setStyle(TextInputStyle.Short).setPlaceholder('例：125000、12.5万').setRequired(true).setMaxLength(24);
  const job = new StringSelectMenuBuilder().setCustomId('job').setPlaceholder('職業を選択')
    .addOptions(jobs.map(value => ({ label: value, value, default: value === participant?.job })));
  if (participant?.power) power.setValue(String(participant.power));
  const id = proxy ? 'entry_edit_' + messageId + '_' + participant.id : 'entry_register_' + messageId;
  return new ModalBuilder().setCustomId(id)
    .setTitle(proxy ? (participant.name + 'の参加情報を編集').slice(0, 45) : '参加情報を登録')
    .addLabelComponents(
      new LabelBuilder().setLabel('戦力').setTextInputComponent(power),
      new LabelBuilder().setLabel('職業').setStringSelectMenuComponent(job)
    );
}

async function announceTeams(interaction, data, size) {
  const participants = data.participants.filter(registered);
  if (participants.length < size) return interaction.editReply(`戦力と職業を登録した参加者が${size}人以上必要です（現在${participants.length}人）。`);
  const teams = splitTeams(participants, size);
  const skipped = data.participants.length - participants.length;
  const title = size === 2 ? 'ペア分け結果' : '4人チーム分け結果';
  const sections = teams.map(({members, total}, index) => {
    const label = members.length < size ? '残りの参加者' : `${size === 2 ? 'ペア' : 'チーム'} ${index + 1}`;
    const lines = members.map(playerLine);
    return `**${label}**（${members.length}人・合計戦力 ${number.format(total)}）\n${lines.join('\n')}`;
  });
  if (skipped) sections.push(`戦力・職業が未登録の${skipped}人は振り分け対象外です。`);
  await interaction.channel.send(report(title, sections.join('\n\n'), 'entry-teams.md'));
  return interaction.editReply('振り分け結果を投稿しました。');
}

async function handle(interaction) {
  const privateReply = content => interaction.reply({ content, ephemeral: true });
  if (!isEnabled(interaction.guildId)) return privateReply('このサーバーでは使用できません。');
  const id = interaction.customId;
  const proxyEdit = /^entry_edit_(\d+)_(\d+)$/.exec(id);
  const editPicker = /^entry_edit_pick_(\d+)$/.exec(id);
  if ((proxyEdit || editPicker) && !isOwner(interaction)) return privateReply('募集主だけが代理編集できます。');
  const registration = proxyEdit || /^entry_register_(\d+)$/.exec(id);
  const messageId = registration?.[1] || editPicker?.[1] || interaction.message?.id;
  const data = getEntry(interaction, messageId);
  if (!data) return privateReply('この募集は終了したか、別の募集に置き換わりました。');
  if (editPicker) {
    const participant = data.participants.find(p => p.id === interaction.values[0]);
    if (!participant) return privateReply('募集に参加している人を選んでください。');
    return interaction.showModal(registrationForm(messageId, participant, true));
  }
  if (id === 'entry_join') {
    return interaction.showModal(registrationForm(messageId, data.participants.find(p => p.id === interaction.user.id)));
  }
  if (id === 'entry_roster') {
    const title = `参加者一覧（${data.participants.length}人）`;
    const body = data.participants.map(playerLine).join('\n') || 'まだ参加者はいません。';
    const payload = report(title, body, 'entry-roster.md');
    if (isOwner(interaction) && data.participants.length) {
      const picker = { custom_id: 'entry_edit_pick_' + messageId, placeholder: '戦力・職業を編集する参加者を選択' };
      if (data.participants.length <= 25) {
        picker.type = 3;
        picker.options = data.participants.map(p => ({ label: p.name.slice(0, 100), value: p.id }));
      } else {
        picker.type = 5;
      }
      payload.components = [{type: 1, components: [picker]}];
    }
    return interaction.reply({ ...payload, ephemeral: true });
  }
  if (id === 'entry_pair' || id === 'entry_team4') {
    if (!isOwner(interaction)) return privateReply('募集主だけが振り分けできます。');
    await interaction.deferReply({ ephemeral: true });
    return serialize(interaction.channelId, async () => getEntry(interaction, messageId)
      ? announceTeams(interaction, data, id === 'entry_pair' ? 2 : 4)
      : interaction.editReply('この募集は終了しました。'));
  }
  if (!registration && id !== 'entry_leave') return privateReply('この操作は利用できません。');
  const power = registration ? parsePower(interaction.fields.getTextInputValue('power')) : null;
  const job = registration ? interaction.fields.getStringSelectValues?.('job')?.[0] : '';
  if (registration && (!power || !jobs.includes(job))) {
    return privateReply('正の整数になる戦力（例：125000、12.5万）を入力し、職業を4択から選んでください。');
  }
  await interaction.deferReply({ ephemeral: true });
  return serialize(interaction.channelId, async () => {
    const current = getEntry(interaction, messageId);
    if (!current) return interaction.editReply('この募集は終了しました。');
    const userId = proxyEdit?.[2] || interaction.user.id;
    const index = current.participants.findIndex(p => p.id === userId);
    if (proxyEdit && index < 0) return interaction.editReply('この人は現在の参加者一覧にいません。');
    if (proxyEdit) {
      Object.assign(current.participants[index], { power, job });
    } else {
      if (!registration && index < 0) return interaction.editReply('この募集には参加していません。');
      const [member, role] = await Promise.all([
        interaction.guild.members.fetch(userId),
        interaction.guild.roles.fetch(current.roleId)
      ]);
      if (!role) return interaction.editReply('参加者ロールが見つかりません。');
      if (registration) {
        if (!member.roles.cache.has(role.id)) await member.roles.add(role);
        const player = { id: userId, name: member.displayName, power, job };
        if (index < 0) current.participants.push(player);
        else current.participants[index] = player;
      } else {
        if (member.roles.cache.has(role.id)) await member.roles.remove(role);
        current.participants.splice(index, 1);
      }
    }
    st.saveLater(interaction.guild, 5000);
    const result = registration ? '戦力と職業を登録しました。' : '参加を辞退しました。';
    try {
      const message = interaction.message?.id === messageId ? interaction.message : await interaction.channel.messages.fetch(messageId);
      await message.edit(panel(current));
    } catch (error) {
      console.error('参加募集の表示更新に失敗:', error);
      return interaction.editReply(result + ' 募集メッセージの表示を更新できませんでした。');
    }
    return interaction.editReply(result);
  });
}

module.exports = { panel, handle, serialize };
