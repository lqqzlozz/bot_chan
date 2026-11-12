const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, StringSelectMenuBuilder, escapeMarkdown
} = require('discord.js');
const st = require('./store');
const { isOwner } = require('./perm');
const { isEnabled } = require('./entryScope');
const { parsePower, splitTeams, strategies } = require('./entryTeams');

const jobs = ['闘志', '騎士', '賢者', '魔導'];
const noMentions = { parse: [], repliedUser: false };
const number = new Intl.NumberFormat('ja-JP');
const pending = new Map();
const teamSizes = ['2', '4'];

function powerLabel(power) {
  if (power >= 1e9) return `${power / 1e9}B`;
  if (power >= 1e6) return `${power / 1e6}M`;
  return number.format(power);
}

function selectRow(id, placeholder, options, selected) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder)
      .addOptions(options.map(option => ({ ...option, default: option.value === selected })))
  );
}

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
    button('entry_split', '振り分け', ButtonStyle.Success),
    button('entry_reset', '戦力・職業をリセット', ButtonStyle.Danger)
  );
  const embed = new EmbedBuilder().setColor('#5865F2').setDescription(data.text);
  const participants = data.participants;
  const ready = participants.filter(registered).length;
  const names = participants.map(p => escapeMarkdown(p.name) +
    (registered(p) ? `（${powerLabel(p.power)}/${p.job}）` : '')).join('、');
  embed.addFields({
    name: `現在の参加者（${participants.length}人・登録済み ${ready}人）`,
    value: names.length > 1000 ? names.slice(0, 1000) + '…' : names || 'まだ参加者はいません。'
  });
  const size = selectRow('entry_size', 'チーム人数を指定', teamSizes.map(value => ({ label: value+'人', value })), data.teamSize);
  const strategy = selectRow('entry_strategy', '振り分け基準を指定',
    Object.entries(strategies).map(([value,label]) => ({ label, value })), data.teamStrategy);
  return { embeds: [embed], components: [row, size, strategy], allowedMentions: noMentions };
}

function registered(player) {
  return Number.isSafeInteger(player.power) && player.power > 0 && jobs.includes(player.job);
}

function playerLine(player) {
  const name = escapeMarkdown(player.name);
  return registered(player)
    ? `- ${name}（${powerLabel(player.power)}/${player.job}）`
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
    .setStyle(TextInputStyle.Short).setPlaceholder('例：1B、103M、75.6M、12.5万').setRequired(true).setMaxLength(24);
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

const followError = (interaction, content) => interaction.followUp({ content, ephemeral: true });

async function announceTeams(interaction, data, size, strategy) {
  const participants = data.participants.filter(registered);
  if (participants.length < size) return followError(interaction, `戦力と職業を登録した参加者が${size}人以上必要です（現在${participants.length}人）。`);
  const teams = splitTeams(participants, size, strategy);
  const skipped = data.participants.length - participants.length;
  const title = size === 2 ? 'ペア分け結果' : '4人チーム分け結果';
  const sections = teams.map(({members, total}, index) => {
    const label = members.length < size ? '残りの参加者' : `${size === 2 ? 'ペア' : 'チーム'} ${index + 1}`;
    const lines = members.map(playerLine);
    return `**${label}**（${members.length}人・合計戦力 ${number.format(total)}）\n${lines.join('\n')}`;
  });
  if (skipped) sections.push(`戦力・職業が未登録の${skipped}人は振り分け対象外です。`);
  await interaction.channel.send(report(title, strategies[strategy]+'\n\n'+sections.join('\n\n'), 'entry-teams.md'));
}

async function handle(interaction) {
  const privateReply = content => interaction.reply({ content, ephemeral: true });
  if (!isEnabled(interaction.guildId)) return privateReply('このサーバーでは使用できません。');
  const id = interaction.customId;
  const proxyEdit = /^entry_edit_(\d+)_(\d+)$/.exec(id);
  const editPicker = /^entry_edit_pick_(\d+)$/.exec(id);
  const reset = /^entry_reset_confirm_(\d+)$/.exec(id);
  if ((proxyEdit || editPicker) && !isOwner(interaction)) return privateReply('募集主だけが代理編集できます。');
  const registration = proxyEdit || /^entry_register_(\d+)$/.exec(id);
  const messageId = registration?.[1] || editPicker?.[1] || reset?.[1] || interaction.message?.id;
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
    return interaction.reply(payload);
  }
  if (reset || ['entry_reset', 'entry_size', 'entry_strategy', 'entry_split', 'entry_pair', 'entry_team4'].includes(id)) {
    if (!isOwner(interaction)) return privateReply('募集主だけが操作できます。');
    if (id === 'entry_reset') {
      return interaction.reply({
        content: '参加者を残したまま、全員の戦力・職業をリセットしますか？',
        ephemeral: true,
        components: [{type:1, components:[{
          type:2, style:4, custom_id:'entry_reset_confirm_'+messageId, label:'リセットする'
        }]}]
      });
    }
    await interaction.deferUpdate();
    return serialize(interaction.channelId, async () => {
      const current = getEntry(interaction, messageId);
      if (!current) return followError(interaction, 'この募集は終了しました。');
      const selected = interaction.values?.[0];
      if (id === 'entry_split') {
        if (!teamSizes.includes(current.teamSize) || !Object.hasOwn(strategies, current.teamStrategy)) {
          return followError(interaction, 'チーム人数と振り分け基準を選んでください。');
        }
        return announceTeams(interaction, current, Number(current.teamSize), current.teamStrategy);
      }
      if (id === 'entry_size' && teamSizes.includes(selected)) current.teamSize = selected;
      if (id === 'entry_strategy' && Object.hasOwn(strategies, selected)) current.teamStrategy = selected;
      if (reset) {
        for (const participant of current.participants) {
          delete participant.power;
          delete participant.job;
        }
      }
      st.saveLater(interaction.guild, 5000);
      const message = reset ? await interaction.channel.messages.fetch(messageId) : interaction.message;
      await message.edit(panel(current));
      if (reset) await interaction.deleteReply();
    });
  }
  if (!registration && id !== 'entry_leave') return privateReply('この操作は利用できません。');
  const power = registration ? parsePower(interaction.fields.getTextInputValue('power')) : null;
  const job = registration ? interaction.fields.getStringSelectValues?.('job')?.[0] : '';
  if (registration && (!power || !jobs.includes(job))) {
    return privateReply('戦力（例：1B、103M、75.6M）を入力し、職業を4択から選んでください。');
  }
  await interaction.deferUpdate();
  return serialize(interaction.channelId, async () => {
    const current = getEntry(interaction, messageId);
    if (!current) return followError(interaction, 'この募集は終了しました。');
    const userId = proxyEdit?.[2] || interaction.user.id;
    const index = current.participants.findIndex(p => p.id === userId);
    if (proxyEdit && index < 0) return followError(interaction, 'この人は現在の参加者一覧にいません。');
    if (proxyEdit) {
      Object.assign(current.participants[index], { power, job });
    } else {
      if (!registration && index < 0) return followError(interaction, 'この募集には参加していません。');
      const [member, role] = await Promise.all([
        interaction.guild.members.fetch(userId),
        interaction.guild.roles.fetch(current.roleId)
      ]);
      if (!role) return followError(interaction, '参加者ロールが見つかりません。');
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
      return followError(interaction, result + ' 募集メッセージの表示を更新できませんでした。');
    }
  });
}

module.exports = { panel, handle, serialize };
