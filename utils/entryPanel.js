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
const graphemes = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const wideCharacter = /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6\u{16FE0}-\u{18DFF}\u{1AFF0}-\u{1B2FF}\u{20000}-\u{3FFFD}\p{Emoji_Presentation}\uFE0F\u20E3]/u;

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

const button = (id, label, style) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

function powerPickerRow(data, requestedPage) {
  const pageSize = 22;
  const pageCount = Math.max(1, Math.ceil(data.participants.length / pageSize));
  const page = Math.min(requestedPage, pageCount - 1);
  const options = [{ label: '自分の戦力・職業', value: 'self' }];
  for (const participant of data.participants.slice(page * pageSize, (page + 1) * pageSize)) {
    options.push({ label: participant.name.slice(0, 100), value: participant.id });
  }
  if (page > 0) options.push({ label: '前のページ', value: 'page_'+(page - 1) });
  if (page + 1 < pageCount) options.push({ label: '次のページ', value: 'page_'+(page + 1) });
  return selectRow('entry_power_pick', '編集する人を選択', options);
}

function panel(data, powerPage = null) {
  const actions = new ActionRowBuilder().addComponents(
    button('entry_join', '参加', ButtonStyle.Primary),
    button('entry_leave', '辞退', ButtonStyle.Danger),
    button(powerPage === null ? 'entry_power' : 'entry_power_close', '戦力変更', ButtonStyle.Secondary),
    button('entry_teams', 'チーム分け', ButtonStyle.Success)
  );
  const embed = new EmbedBuilder().setColor('#5865F2').setDescription(data.text);
  const participants = data.participants;
  const ready = participants.filter(registered).length;
  embed.addFields({
    name: `現在の参加者（${participants.length}人・登録済み ${ready}人）`,
    value: participantTable(participants)
  });
  const components = [actions];
  if (powerPage !== null) components.push(powerPickerRow(data, powerPage));
  return { embeds: [embed], components, allowedMentions: noMentions };
}

async function refresh(guild, botId) {
  if (!isEnabled(guild.id)) return;
  const entries = st.get(guild.id).entry;
  for (const channelId of Object.keys(entries)) {
    await serialize(channelId, async () => {
      const data = entries[channelId];
      if (!data?.msg) return;
      try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel?.isTextBased()) return;
        const message = await channel.messages.fetch(data.msg);
        if (message.author.id !== botId) return;
        await message.edit(panel(data));
      } catch (error) {
        if (![10003, 10008].includes(error.code)) console.error('既存の参加募集を更新できませんでした:', error.message);
      }
    });
  }
}

function registered(player) {
  return Number.isSafeInteger(player.power) && player.power > 0 && jobs.includes(player.job);
}

function tableName(name) {
  const maxWidth = 18;
  const safe = name.replaceAll('`', 'ˋ').replace(/[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028-\u202E\u2066-\u2069]/gu, ' ').trim() || '-';
  const segments = [...graphemes.segment(safe)].map(({ segment }) => ({
    segment, width: wideCharacter.test(segment) ? 2 : 1
  }));
  const fullWidth = segments.reduce((total, item) => total + item.width, 0);
  if (fullWidth <= maxWidth) return { text: safe, width: fullWidth };

  let text = '';
  let width = 0;
  for (const item of segments) {
    if (width + item.width > maxWidth - 1) break;
    text += item.segment;
    width += item.width;
  }
  return { text: text + '…', width: width + 1 };
}

function participantTable(participants) {
  if (!participants.length) return 'まだ参加者はいません。';
  const rows = participants.map(player => ({
    name: tableName(player.name),
    power: player.power ? powerLabel(player.power) : '-',
    job: jobs.includes(player.job) ? player.job : '-'
  }));
  const nameWidth = rows.reduce((width, row) => Math.max(width, row.name.width), 4);
  const powerWidth = rows.reduce((width, row) => Math.max(width, row.power.length), 4);
  const header = '名前' + ' '.repeat(nameWidth - 4) + '  戦力' + ' '.repeat(powerWidth - 4) + '  職業';
  let table = '```\n' + header;
  for (const [index, { name, power, job }] of rows.entries()) {
    const line = '\n' + name.text + ' '.repeat(nameWidth - name.width) + '  ' +
      power.padStart(powerWidth) + '  ' + job;
    const remaining = rows.length - index - 1;
    const overflow = remaining ? '\nほか ' + remaining + ' 人' : '';
    if (table.length + line.length + overflow.length + 4 > 1024) {
      table += '\nほか ' + (remaining + 1) + ' 人';
      break;
    }
    table += line;
  }
  return table + '\n```';
}

function profiles(guildId) {
  const config = st.get(guildId);
  const saved = config.entryProfiles ??= {};
  for (const entry of Object.values(config.entry)) {
    for (const player of entry.participants || []) {
      const profile = saved[player.id] ??= {};
      delete profile.awaitingRegistration;
      if (player.power) profile.power ??= player.power;
      if (jobs.includes(player.job)) profile.job ??= player.job;
    }
  }
  return saved;
}

function report(title, body, filename) {
  const embeds = [{ title, description: body.length <= 4096 ? body : '全件は添付ファイルをご覧ください。', color: 0x5865F2 }];
  const payload = { embeds, allowedMentions: noMentions };
  if (body.length > 4096) payload.files = [{ attachment: Buffer.from(`## ${title}\n${body}`), name: filename }];
  return payload;
}

function getEntry(interaction, messageId) {
  const data = st.get(interaction.guildId).entry[interaction.channelId];
  return data?.msg === messageId ? data : null;
}

function jobSelect(selected, placeholder) {
  return new StringSelectMenuBuilder().setCustomId('job').setPlaceholder(placeholder)
    .setRequired(false).setMinValues(0)
    .addOptions(jobs.map(value => ({ label: value, value, default: value === selected })));
}

function registrationForm(messageId, participant, proxy = false) {
  const name = new TextInputBuilder().setCustomId('name').setStyle(TextInputStyle.Short)
    .setPlaceholder('未入力ならサーバーでの表示名').setRequired(false).setMaxLength(40);
  const power = new TextInputBuilder().setCustomId('power')
    .setStyle(TextInputStyle.Short).setPlaceholder('任意・例：1B、103M、75.6M').setRequired(false).setMaxLength(24);
  const job = jobSelect(participant?.job, '未選択でも参加できます');
  if (participant?.customName) name.setValue(participant.customName);
  if (participant?.power) power.setValue(powerLabel(participant.power));
  const id = proxy ? 'entry_edit_' + messageId + '_' + participant.id : 'entry_register_' + messageId;
  return new ModalBuilder().setCustomId(id)
    .setTitle(proxy ? (participant.name + 'の参加情報を編集').slice(0, 45) : '参加情報を登録')
    .addLabelComponents(
      new LabelBuilder().setLabel('名前（任意）').setTextInputComponent(name),
      new LabelBuilder().setLabel('戦力（任意）').setTextInputComponent(power),
      new LabelBuilder().setLabel('職業（任意）').setStringSelectMenuComponent(job)
    );
}

function powerForm(messageId, power, job, target, name) {
  const input = new TextInputBuilder().setCustomId('power').setStyle(TextInputStyle.Short)
    .setPlaceholder('例：1B、103M、75.6M').setRequired(false).setMaxLength(24);
  if (power) input.setValue(String(power));
  const id = 'entry_power_save_'+messageId+(target ? '_'+target : '');
  const displayName = name && Array.from(tableName(name).text).slice(0, 16).join('');
  const title = displayName ? displayName + 'の戦力・職業を変更' : '戦力・職業の変更';
  return new ModalBuilder().setCustomId(id)
    .setTitle(title)
    .addLabelComponents(
      new LabelBuilder().setLabel('戦力').setTextInputComponent(input),
      new LabelBuilder().setLabel('職業').setStringSelectMenuComponent(jobSelect(job, '職業を選択'))
    );
}

const notice = description => ({ embeds: [{ description, color: 0x5865F2 }], ephemeral: true });
const followError = (interaction, content) => interaction.followUp(notice(content));
const alreadyJoined = 'すでに参加しています。戦力・職業は「戦力変更」から変更できます。';

function teamStrategy(data) {
  if (!data.participants.some(player => player.power)) return 'random';
  return Object.hasOwn(strategies, data.teamStrategy) ? data.teamStrategy : 'balanced';
}

function teamSetup(data, owner, status) {
  const id = data.msg;
  const size = teamSizes.includes(data.teamSize) ? data.teamSize : '2';
  const strategy = teamStrategy(data);
  const buttons = [button(`entry_run_${id}_${size}_${strategy}`, '振り分けを実行', ButtonStyle.Success)];
  if (owner) buttons.push(button('entry_manage_'+id, '参加者を編集', ButtonStyle.Secondary));
  return {
    embeds: [{ title: 'チーム振り分け', description: status, color: 0x5865F2 }],
    components: [
      selectRow('entry_size_'+id, 'チーム人数を指定', teamSizes.map(value => ({ label: value+'人', value })), size),
      selectRow('entry_strategy_'+id, '振り分け基準を指定',
        Object.entries(strategies).map(([value,label]) => ({ label, value })), strategy),
      new ActionRowBuilder().addComponents(...buttons)
    ]
  };
}

function manageParticipants(data) {
  const id = data.msg;
  const reset = { label:'戦力・職業をリセットする', value:'reset' };
  const options = data.participants.map(p => ({ label:p.name.slice(0,100), value:p.id }));
  const first = data.participants.length <= 49 ? [reset, ...options.slice(0,24)] : [reset];
  const components = [selectRow('entry_edit_pick_'+id+'_0', '参加者の編集・リセット', first)];
  if (data.participants.length > 49) {
    components.push({type:1, components:[{type:5, custom_id:'entry_edit_pick_'+id,
      placeholder:'戦力・職業を編集する参加者を選択'}]});
  } else if (options.length > 24) {
    components.push(selectRow('entry_edit_pick_'+id+'_24', '編集する参加者を選択（25人目以降）', options.slice(24)));
  }
  components.push(new ActionRowBuilder().addComponents(
    button('entry_back_'+id, 'チーム振り分けに戻る', ButtonStyle.Secondary)));
  return { embeds: [{ title: '参加者の編集', color: 0x5865F2 }], components };
}

async function announceTeams(interaction, data, size, strategy) {
  const teams = splitTeams(data.participants, size, strategy);
  const lines = teams.map(({members}, index) => {
    const players = members.map(p => [p.name.replaceAll('`','ˋ'), p.power ? powerLabel(p.power) : '戦力未入力',
      jobs.includes(p.job) ? p.job : '職業未入力'].join(' '));
    return `**TEAM${index+1}.**\n\`\`\`\n${players.join('\n')}\n\`\`\``;
  });
  const remaining = teams.at(-1).members;
  if (remaining.length < size) {
    lines.push(remaining.map(p=>escapeMarkdown(p.name)).join('と')+'のチームが完全ではありません。');
  }
  const payload = report('チーム分け発表', lines.join('\n\n'), 'entry-teams.md');
  payload.components = [new ActionRowBuilder().addComponents(button('entry_delete_'+data.msg, '🗑️', ButtonStyle.Danger))];
  let previous;
  if (data.teamMessageId) {
    try { previous = await interaction.channel.messages.fetch(data.teamMessageId); }
    catch (error) { if (error.code !== 10008) throw error; }
  }
  if (previous) await previous.edit({ ...payload, attachments: [] });
  else data.teamMessageId = (await interaction.channel.send(payload)).id;
}

function confirmReset(interaction, messageId) {
  return interaction.update({
    embeds: [{ description: 'この募集の戦力・職業をリセットしますか？ 参加者と保存済みプロフィールは残ります。', color: 0x5865F2 }],
    components: [{type:1, components:[
      {type:2, style:4, custom_id:'entry_reset_confirm_'+messageId+'_'+interaction.message.id, label:'リセットする'},
      {type:2, style:2, custom_id:'entry_manage_'+messageId, label:'戻る'}
    ]}],
    attachments: []
  });
}

async function handle(interaction) {
  const privateReply = content => interaction.reply(notice(content));
  if (!isEnabled(interaction.guildId)) return privateReply('このサーバーでは使用できません。');
  const id = interaction.customId;
  const proxyEdit = /^entry_edit_(\d+)_(\d+)$/.exec(id);
  const weeklyJoin = /^entry_week_join_(\d+)_(\d{4}-\d{2}-\d{2})$/.exec(id);
  const editPicker = /^entry_edit_pick_(\d+)(?:_\d+)?$/.exec(id);
  const control = /^entry_(prepare|back|manage|size|strategy|reset|delete)_(\d+)$/.exec(id);
  const run = /^entry_run_(\d+)_(2|4)_([a-z]+)$/.exec(id);
  const reset = /^entry_reset_confirm_(\d+)_(\d+)$/.exec(id);
  const powerSave = /^entry_power_save_(\d+)(?:_(self|\d+))?$/.exec(id);
  const oldPowerButton = /^entry_power_(\d+)$/.exec(id);
  if ((proxyEdit || editPicker) && !isOwner(interaction)) return privateReply('募集主だけが代理編集できます。');
  const registration = proxyEdit || /^entry_register_(\d+)$/.exec(id);
  const messageId = registration?.[1] || weeklyJoin?.[1] || editPicker?.[1] || reset?.[1] || control?.[2] || run?.[1] ||
    powerSave?.[1] || oldPowerButton?.[1] || interaction.message?.id;
  const data = getEntry(interaction, messageId);
  if (control?.[1] === 'delete') {
    if (!isOwner(interaction)) return privateReply('募集主だけがチーム発表を削除できます。');
    await interaction.deferUpdate();
    return serialize(interaction.channelId, async () => {
      await interaction.message.delete();
      const current = getEntry(interaction, messageId);
      if (current?.teamMessageId === interaction.message.id) {
        delete current.teamMessageId;
        await st.save(interaction.guild);
      }
    });
  }
  if (!data) return privateReply('この募集は終了したか、別の募集に置き換わりました。');
  if (weeklyJoin && st.get(interaction.guildId).entryWeekly?.[interaction.channelId]?.date !== weeklyJoin[2]) {
    return privateReply('この案内は前の週のものです。今週の案内から参加してください。');
  }
  if (editPicker) {
    if (interaction.values[0] === 'reset') return confirmReset(interaction, messageId);
    const participant = data.participants.find(p => p.id === interaction.values[0]);
    if (!participant) return privateReply('募集に参加している人を選んでください。');
    return interaction.showModal(registrationForm(messageId, participant, true));
  }
  const pickedPowerTarget = id === 'entry_power_pick' ? interaction.values[0] : undefined;
  const powerPage = /^page_(\d+)$/.exec(pickedPowerTarget ?? '');
  if (id === 'entry_power' || id === 'entry_power_close' || powerPage) {
    const page = id === 'entry_power_close' ? null : Number(powerPage?.[1] ?? 0);
    return interaction.update({ components: panel(data, page).components });
  }
  if (pickedPowerTarget || oldPowerButton) {
    const self = !pickedPowerTarget || pickedPowerTarget === 'self';
    const userId = self ? interaction.user.id : pickedPowerTarget;
    const participant = data.participants.find(p => p.id === userId);
    if (!self && !participant) return privateReply('募集に参加している人を選んでください。');
    const saved = profiles(interaction.guildId)[userId];
    return interaction.showModal(powerForm(messageId, participant?.power ?? saved?.power,
      participant?.job ?? saved?.job, pickedPowerTarget, participant?.name));
  }
  if (powerSave) {
    const target = powerSave[2];
    const userId = target && target !== 'self' ? target : interaction.user.id;
    const powerInput = interaction.fields.getTextInputValue('power')?.trim();
    const power = powerInput ? parsePower(powerInput) : null;
    const job = interaction.fields.fields.get('job')?.values?.[0];
    if (powerInput && !power) return privateReply('戦力は1B、103M、75.6Mなどの形式で入力してください。');
    if (job && !jobs.includes(job)) return privateReply('職業は4択から選んでください。');
    if (!power && !job) return privateReply('変更する戦力か職業を入力してください。');
    const changes = { ...(power ? { power } : {}), ...(job ? { job } : {}) };
    const keys = Object.keys(changes);
    const updated = power && job ? '戦力・職業を更新しました。'
      : power ? `戦力を${powerLabel(power)}に更新しました。` : `職業を${job}に更新しました。`;
    const updatesOriginal = target && interaction.message?.id === messageId;
    if (updatesOriginal) await interaction.deferUpdate();
    else await interaction.deferReply({ ephemeral: true });
    return serialize(interaction.channelId, async () => {
      const reply = content => updatesOriginal ? followError(interaction, content)
        : interaction.editReply({ embeds: notice(content).embeds });
      const current = getEntry(interaction, messageId);
      if (!current) return reply('この募集は終了しました。');
      const participant = current.participants.find(p => p.id === userId);
      if (target && target !== 'self' && !participant) return reply('この人は現在の参加者一覧にいません。');
      const savedProfiles = profiles(interaction.guildId);
      const existing = savedProfiles[userId];
      const saved = savedProfiles[userId] ??= { awaitingRegistration: true };
      const targets = participant ? [saved, participant] : [saved];
      const previous = targets.map(target => ({ ...target }));
      for (const target of targets) Object.assign(target, changes);
      const saving = st.save(interaction.guild);
      let message;
      let displayError;
      if (target || participant) {
        try {
          message = interaction.message?.id === messageId ? interaction.message
            : await interaction.channel.messages.fetch(messageId);
          await message.edit(panel(current));
        } catch (error) {
          displayError = error;
          console.error('戦力・職業の表示更新に失敗:', error);
        }
      }
      if (!await saving) {
        for (const [index, target] of targets.entries()) {
          for (const key of keys) {
            if (Object.hasOwn(previous[index], key)) target[key] = previous[index][key];
            else delete target[key];
          }
        }
        if (!existing && savedProfiles[userId] === saved && saved.awaitingRegistration && !saved.power && !saved.job) delete savedProfiles[userId];
        if (message && !displayError) {
          try {
            await message.edit(panel(current));
          } catch (error) {
            console.error('戦力・職業の表示を戻せませんでした:', error);
            return reply('変更を保存できませんでした。募集メッセージの表示を戻せませんでした。');
          }
        }
        return reply('変更を保存できませんでした。もう一度お試しください。');
      }
      if (displayError) {
        return reply(updated + '募集メッセージの表示を更新できませんでした。');
      }
      if (updatesOriginal) return;
      if (target) return interaction.deleteReply();
      return reply(updated);
    });
  }
  const participant = id === 'entry_join' && data.participants.find(p => p.id === interaction.user.id);
  if (participant) return privateReply(alreadyJoined);
  const joining = id === 'entry_join' || weeklyJoin;
  const savedProfile = joining && profiles(interaction.guildId)[interaction.user.id];
  const quickJoin = joining && !savedProfile?.awaitingRegistration && (weeklyJoin || savedProfile);
  if (joining && !quickJoin) {
    return interaction.showModal(registrationForm(messageId, savedProfile));
  }
  if (id === 'entry_roster') {
    await privateReply('参加者は募集投稿の「現在の参加者」で確認できます。');
    await serialize(interaction.channelId, async () => {
      if (getEntry(interaction, messageId) === data) await interaction.message.edit(panel(data));
    });
    return;
  }
  if (id === 'entry_teams') {
    if (!data.participants.length) return privateReply('まだ参加者はいません。');
    return interaction.reply({ ...teamSetup(data, isOwner(interaction)), ephemeral: true });
  }
  if (run && !Object.hasOwn(strategies, run[3])) return privateReply('振り分け基準を選び直してください。');
  if (reset || control || run || ['entry_reset', 'entry_size', 'entry_strategy', 'entry_split', 'entry_pair', 'entry_team4'].includes(id)) {
    const owner = isOwner(interaction);
    const action = run ? 'run' : control?.[1];
    if ((reset || !action || action === 'reset' || action === 'manage') && !owner) return privateReply('募集主だけが操作できます。');
    if (action === 'reset') return confirmReset(interaction, messageId);
    await interaction.deferUpdate();
    return serialize(interaction.channelId, async () => {
      const current = getEntry(interaction, messageId);
      if (!current) return followError(interaction, 'この募集は終了しました。');
      if (reset) {
        profiles(interaction.guildId);
        for (const participant of current.participants) {
          delete participant.power;
          delete participant.job;
        }
        await st.save(interaction.guild);
        const message = await interaction.channel.messages.fetch(messageId);
        await message.edit(panel(current));
        return interaction.editReply({ ...manageParticipants(current), attachments: [] });
      }
      if (!action) return interaction.message.edit(panel(current));
      if (action === 'manage') return interaction.editReply({ ...manageParticipants(current), attachments: [] });
      if (!current.participants.length) {
        return interaction.editReply({ embeds: notice('まだ参加者はいません。').embeds, components: [], attachments: [] });
      }
      if (action === 'back' || action === 'prepare') return interaction.editReply({ ...teamSetup(current, owner), attachments: [] });
      if (run) {
        const chosen = { ...current, teamSize: run[2], teamStrategy: run[3] };
        try {
          await announceTeams(interaction, current, Number(run[2]), teamStrategy(chosen));
        } catch (error) {
          console.error('チーム分けの投稿に失敗:', error);
          return interaction.editReply(teamSetup(chosen, owner, '結果を投稿できませんでした。もう一度お試しください。'));
        }
        void st.save(interaction.guild);
        return interaction.editReply(teamSetup(chosen, owner, 'このチャンネルにチーム分けの結果を表示しました。'));
      }
      const selected = interaction.values?.[0];
      if (action === 'size' && teamSizes.includes(selected)) current.teamSize = selected;
      if (action === 'strategy' && Object.hasOwn(strategies, selected)) current.teamStrategy = selected;
      void st.save(interaction.guild);
      return interaction.editReply({ ...teamSetup(current, owner), attachments: [] });
    });
  }
  if (!registration && !quickJoin && id !== 'entry_leave') return privateReply('この操作は利用できません。');
  const customName = registration ? (interaction.fields.getTextInputValue('name') || '').trim() : '';
  const powerInput = registration ? (interaction.fields.getTextInputValue('power') || '').trim() : '';
  const power = powerInput ? parsePower(powerInput) : null;
  const job = registration ? interaction.fields.getStringSelectValues?.('job')?.[0] : '';
  if (registration && ((powerInput && !power) || (job && !jobs.includes(job)) || customName.length > 40)) {
    return privateReply('戦力は1B、103M、75.6Mなどの形式、職業は4択から入力してください。どちらも空欄で参加できます。');
  }
  await interaction.deferUpdate();
  let result;
  try {
    result = await serialize(interaction.channelId, async () => {
      const current = getEntry(interaction, messageId);
      if (!current) return 'この募集は終了しました。';
      const userId = proxyEdit?.[2] || interaction.user.id;
      const index = current.participants.findIndex(p => p.id === userId);
      const saved = profiles(interaction.guildId);
      const details = quickJoin ? saved[userId] || {} : { ...(power ? { power } : {}), ...(job ? { job } : {}) };
      if ((quickJoin || (registration && !proxyEdit)) && index >= 0) return alreadyJoined;
      if (proxyEdit && index < 0) return 'この人は現在の参加者一覧にいません。';
      if (proxyEdit) {
        const player = current.participants[index];
        if (customName) Object.assign(player, { name: customName, customName });
        delete player.power;
        delete player.job;
        Object.assign(player, details);
      } else {
        if (!registration && !quickJoin && index < 0) return 'この募集には参加していません。';
        const [member, role] = await Promise.all([
          interaction.member?.roles?.cache ? interaction.member : interaction.guild.members.fetch(userId),
          interaction.guild.roles.cache?.get(current.roleId) || interaction.guild.roles.fetch(current.roleId)
        ]);
        if (!role) return '参加者ロールが見つかりません。';
        if (registration || quickJoin) {
          if (!member.roles.cache.has(role.id)) await member.roles.add(role);
          const player = { id: userId, name: customName || member.displayName, ...details };
          if (customName) player.customName = customName;
          current.participants.push(player);
        } else {
          if (member.roles.cache.has(role.id)) await member.roles.remove(role);
          current.participants.splice(index, 1);
        }
      }
      if (registration || quickJoin) {
        const profile = saved[userId] ??= {};
        delete profile.awaitingRegistration;
        Object.assign(profile, details);
      }
      const saving = st.save(interaction.guild);
      let displayFailure = '';
      try {
        const message = interaction.message?.id === messageId ? interaction.message : await interaction.channel.messages.fetch(messageId);
        await message.edit(panel(current));
      } catch (error) {
        console.error('参加募集の表示更新に失敗:', error);
        displayFailure = '募集メッセージの表示を更新できませんでした。';
      }
      const savedOk = await saving;
      if (!savedOk) return 'bot-configに保存できませんでした。Botの権限を確認してください。' + displayFailure;
      return displayFailure;
    });
  } catch (error) {
    console.error('大会募集の参加情報を更新できませんでした:', error);
    result = '参加者情報を更新できませんでした。参加者ロールの設定を確認してください。';
  }
  if (result) await followError(interaction, result);
}

module.exports = { panel, handle, serialize, profiles, refresh };
