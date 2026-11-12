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

const button = (id, label, style) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

function panel(data) {
  const actions = new ActionRowBuilder().addComponents(
    button('entry_join', '参加する', ButtonStyle.Primary),
    button('entry_leave', '辞退する', ButtonStyle.Danger)
  );
  const roster = new ActionRowBuilder().addComponents(
    button('entry_roster', '参加者情報一覧', ButtonStyle.Secondary)
  );
  const embed = new EmbedBuilder().setColor('#5865F2').setDescription(data.text);
  const participants = data.participants;
  const ready = participants.filter(registered).length;
  const names = participants.map(playerLabel).join('、');
  embed.addFields({
    name: `現在の参加者（${participants.length}人・登録済み ${ready}人）`,
    value: names.length > 1000 ? names.slice(0, 1000) + '…' : names || 'まだ参加者はいません。'
  });
  return { embeds: [embed], components: [actions, roster], allowedMentions: noMentions };
}

function registered(player) {
  return Number.isSafeInteger(player.power) && player.power > 0 && jobs.includes(player.job);
}

function playerLabel(player) {
  const name = escapeMarkdown(player.name);
  const power = player.power ? powerLabel(player.power) : '戦力未入力';
  const job = jobs.includes(player.job) ? player.job : '職業未入力';
  return player.power || jobs.includes(player.job) ? `${name}（${power}/${job}）` : name;
}

function profiles(guildId) {
  const config = st.get(guildId);
  const saved = config.entryProfiles ??= {};
  for (const entry of Object.values(config.entry)) {
    for (const player of entry.participants || []) {
      if (!player.power && !jobs.includes(player.job)) continue;
      const profile = saved[player.id] ??= {};
      if (player.power) profile.power ??= player.power;
      if (jobs.includes(player.job)) profile.job ??= player.job;
    }
  }
  return saved;
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
  const name = new TextInputBuilder().setCustomId('name').setStyle(TextInputStyle.Short)
    .setPlaceholder('未入力ならサーバーでの表示名').setRequired(false).setMaxLength(40);
  const power = new TextInputBuilder().setCustomId('power')
    .setStyle(TextInputStyle.Short).setPlaceholder('任意・例：1B、103M、75.6M').setRequired(false).setMaxLength(24);
  const job = new StringSelectMenuBuilder().setCustomId('job').setPlaceholder('未選択でも参加できます')
    .setRequired(false).setMinValues(0)
    .addOptions(jobs.map(value => ({ label: value, value, default: value === participant?.job })));
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

const followError = (interaction, content) => interaction.followUp({ content, ephemeral: true });

function roster(data, owner, configuring = false) {
  const title = `参加者情報一覧（${data.participants.length}人）`;
  const body = data.participants.map(p => '- '+playerLabel(p)).join('\n') || 'まだ参加者はいません。';
  const payload = report(title, body, 'entry-roster.md');
  if (!owner) return payload;
  const id = data.msg;
  const reset = button('entry_reset_'+id, '戦力・職業をリセット', ButtonStyle.Danger);
  if (configuring) {
    const size = selectRow('entry_size_'+id, 'チーム人数を指定', teamSizes.map(value => ({ label: value+'人', value })), data.teamSize || '2');
    const strategy = selectRow('entry_strategy_'+id, '振り分け基準を指定',
      Object.entries(strategies).map(([value,label]) => ({ label, value })), data.teamStrategy);
    payload.components = [new ActionRowBuilder().addComponents(reset, button('entry_back_'+id, '参加者の編集に戻る', ButtonStyle.Secondary)), size, strategy];
  } else {
    payload.components = [new ActionRowBuilder().addComponents(reset)];
    if (data.participants.length && data.participants.length <= 50) {
      for (let index = 0; index < data.participants.length; index += 25) {
        payload.components.push(selectRow('entry_edit_pick_'+id+'_'+index,
          index ? '編集する参加者を選択（26人目以降）' : '戦力・職業を編集する参加者を選択',
          data.participants.slice(index,index+25).map(p => ({ label:p.name.slice(0,100), value:p.id }))));
      }
    } else if (data.participants.length) {
      payload.components.push({type:1, components:[{type:5, custom_id:'entry_edit_pick_'+id,
        placeholder:'戦力・職業を編集する参加者を選択'}]});
    }
    payload.components.push(new ActionRowBuilder().addComponents(
      button('entry_prepare_'+id, 'この戦力でチームを振り分ける', ButtonStyle.Success)));
  }
  return payload;
}

async function announceTeams(interaction, data) {
  if (!data.participants.length) return followError(interaction, '参加者がいません。');
  const size = Number(data.teamSize || '2');
  const strategy = data.participants.some(player=>player.power) ? data.teamStrategy : 'random';
  if (!Object.hasOwn(strategies, strategy)) return;
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

async function handle(interaction) {
  const privateReply = content => interaction.reply({ content, ephemeral: true });
  if (!isEnabled(interaction.guildId)) return privateReply('このサーバーでは使用できません。');
  const id = interaction.customId;
  const proxyEdit = /^entry_edit_(\d+)_(\d+)$/.exec(id);
  const editPicker = /^entry_edit_pick_(\d+)(?:_\d+)?$/.exec(id);
  const control = /^entry_(prepare|back|size|strategy|reset|delete)_(\d+)$/.exec(id);
  const reset = /^entry_reset_confirm_(\d+)_(\d+)$/.exec(id);
  if ((proxyEdit || editPicker) && !isOwner(interaction)) return privateReply('募集主だけが代理編集できます。');
  const registration = proxyEdit || /^entry_register_(\d+)$/.exec(id);
  const messageId = registration?.[1] || editPicker?.[1] || reset?.[1] || control?.[2] || interaction.message?.id;
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
  if (editPicker) {
    const participant = data.participants.find(p => p.id === interaction.values[0]);
    if (!participant) return privateReply('募集に参加している人を選んでください。');
    return interaction.showModal(registrationForm(messageId, participant, true));
  }
  if (id === 'entry_join') {
    const participant = data.participants.find(p => p.id === interaction.user.id);
    return interaction.showModal(registrationForm(messageId, participant || profiles(interaction.guildId)[interaction.user.id]));
  }
  if (id === 'entry_roster') {
    return interaction.reply(roster(data, isOwner(interaction)));
  }
  if (reset || control || ['entry_reset', 'entry_size', 'entry_strategy', 'entry_split', 'entry_pair', 'entry_team4'].includes(id)) {
    if (!isOwner(interaction)) return privateReply('募集主だけが操作できます。');
    const action = control?.[1];
    if (action === 'reset') {
      return interaction.reply({
        content: 'この募集の戦力・職業をリセットしますか？ 参加者と保存済みプロフィールは残ります。',
        ephemeral: true,
        components: [{type:1, components:[{
          type:2, style:4, custom_id:'entry_reset_confirm_'+messageId+'_'+interaction.message.id, label:'リセットする'
        }]}]
      });
    }
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
        const [message, list] = await Promise.all([
          interaction.channel.messages.fetch(messageId),
          interaction.channel.messages.fetch(reset[2])
        ]);
        await message.edit(panel(current));
        if (list.id !== message.id) await list.edit({ ...roster(current, true), attachments: [] });
        return interaction.deleteReply();
      }
      if (!action) return interaction.message.edit(panel(current));
      if (action === 'back') return interaction.message.edit({ ...roster(current, true), attachments: [] });
      const selected = interaction.values?.[0];
      if (action === 'size' && teamSizes.includes(selected)) current.teamSize = selected;
      if (action === 'strategy' && Object.hasOwn(strategies, selected)) current.teamStrategy = selected;
      const noPower = !current.participants.some(p => p.power);
      if (noPower) current.teamStrategy = 'random';
      await interaction.message.edit({ ...roster(current, true, true), attachments: [] });
      if ((action !== 'prepare' || noPower) && Object.hasOwn(strategies, current.teamStrategy) && current.participants.length) {
        await announceTeams(interaction, current);
      }
      await st.save(interaction.guild);
    });
  }
  if (!registration && id !== 'entry_leave') return privateReply('この操作は利用できません。');
  const customName = registration ? (interaction.fields.getTextInputValue('name') || '').trim() : '';
  const powerInput = registration ? (interaction.fields.getTextInputValue('power') || '').trim() : '';
  const power = powerInput ? parsePower(powerInput) : null;
  const job = registration ? interaction.fields.getStringSelectValues?.('job')?.[0] : '';
  if (registration && ((powerInput && !power) || (job && !jobs.includes(job)) || customName.length > 40)) {
    return privateReply('戦力は1B、103M、75.6Mなどの形式、職業は4択から入力してください。どちらも空欄で参加できます。');
  }
  await interaction.deferUpdate();
  return serialize(interaction.channelId, async () => {
    const current = getEntry(interaction, messageId);
    if (!current) return followError(interaction, 'この募集は終了しました。');
    const userId = proxyEdit?.[2] || interaction.user.id;
    const index = current.participants.findIndex(p => p.id === userId);
    const saved = profiles(interaction.guildId);
    const details = { ...(power ? { power } : {}), ...(job ? { job } : {}) };
    if (proxyEdit && index < 0) return followError(interaction, 'この人は現在の参加者一覧にいません。');
    if (proxyEdit) {
      const player = current.participants[index];
      if (customName) Object.assign(player, { name: customName, customName });
      delete player.power;
      delete player.job;
      Object.assign(player, details);
    } else {
      if (!registration && index < 0) return followError(interaction, 'この募集には参加していません。');
      const [member, role] = await Promise.all([
        interaction.guild.members.fetch(userId),
        interaction.guild.roles.fetch(current.roleId)
      ]);
      if (!role) return followError(interaction, '参加者ロールが見つかりません。');
      if (registration) {
        if (!member.roles.cache.has(role.id)) await member.roles.add(role);
        const player = { id: userId, name: customName || member.displayName, ...details };
        if (customName) player.customName = customName;
        if (index < 0) current.participants.push(player);
        else current.participants[index] = player;
      } else {
        if (member.roles.cache.has(role.id)) await member.roles.remove(role);
        current.participants.splice(index, 1);
      }
    }
    if (registration && Object.keys(details).length) Object.assign(saved[userId] ??= {}, details);
    if (!await st.save(interaction.guild)) {
      await followError(interaction, 'bot-configに保存できませんでした。Botの権限を確認してください。');
    }
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

module.exports = { panel, handle, serialize, profiles };
