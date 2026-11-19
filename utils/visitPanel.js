const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder,
  TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { randomUUID } = require('node:crypto');
const model = require('./visitReservations');
const st = require('./store');
const { isAdmin } = require('./perm');
const image = require('./visitImage');

const sessions = new Map();
const TIMEOUT = 5 * 60 * 1000;
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const embed = (title, description) => new EmbedBuilder().setColor('#173f51').setTitle(title).setDescription(description);
const payload = (title, description, components = []) => ({ embeds: [embed(title, description)], components, attachments: [], files: [], allowedMentions: { parse: [] } });
const pad = number => String(number).padStart(2, '0');
const select = (id, placeholder, options) => row(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(options));
const actionId = (session, action) => `visit_session:${session.id}:${action}`;
const options = (values, suffix, selected) => values.map(value => ({ label: value + suffix, value: pad(value), default: Number(value) === Number(selected) }));

function createSession(interaction, kind, venueId = null) {
  const session = { id: randomUUID(), kind, userId: interaction.user.id, guildId: interaction.guildId,
    venueId, date: model.today(), time: '10:00', venuePage: 0, dayPage: 0, expires: Date.now() + TIMEOUT };
  sessions.set(session.id, session);
  return session;
}

function venueOptions(data, session) {
  const page = session.venuePage || 0;
  const venues = data.venues.slice(page * 23, (page + 1) * 23);
  const list = venues.map(venue => ({ label: venue.name, value: venue.id, default: venue.id === session.venueId,
    ...(!venue.channelId ? { description: '予約表の表示先は未設定' } : {}) }));
  if (page > 0) list.push({ label: '◀ 前の会場', value: 'previous' });
  if ((page + 1) * 23 < data.venues.length) list.push({ label: '次の会場 ▶', value: 'next' });
  return list;
}

function management(session) {
  const data = model.config(session.guildId);
  const venue = data.venues.find(item => item.id === session.venueId);
  const components = [];
  if (data.venues.length) components.push(select(actionId(session, 'venue'), '管理する会場を選択', venueOptions(data, session)));
  if (venue) components.push(row(new ChannelSelectMenuBuilder().setCustomId(actionId(session, 'channel'))
    .setPlaceholder('予約表を表示するチャンネルを選択').addChannelTypes(ChannelType.GuildText)));
  const buttons = [button(actionId(session, 'add'), '会場を登録', ButtonStyle.Primary)];
  if (venue) buttons.push(button(actionId(session, 'rename'), '会場名を変更'), button(actionId(session, 'preview'), '予約表を見る'));
  buttons.push(button(actionId(session, 'close'), '終了'));
  components.push(row(...buttons));
  const text = venue
    ? `**${venue.name}**\n表示先：${venue.channelId ? `<#${venue.channelId}>` : '未設定（チャンネルはあとで指定できます）'}\n名前・日時・会場を登録すると、同じ投稿の予約表が更新されます。`
    : '最初に見学会場を登録してください。表示先のチャンネルは、作成してから指定できます。';
  return payload('来場予約の管理', text, components);
}

function dateScreen(session) {
  const data = model.config(session.guildId);
  const venue = data.venues.find(item => item.id === session.venueId);
  const [year, month, day] = session.date.split('-').map(Number);
  const currentYear = Number(model.today().slice(0, 4));
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const values = Array.from({ length: maxDay }, (_, i) => i + 1).filter(value => session.dayPage ? value >= 25 : value <= 24);
  const days = options(values, '日', day);
  days.push({ label: session.dayPage ? '1〜24日を表示' : '25〜31日を表示', value: 'switch' });
  return payload('来場日を選択', `**${venue?.name || '見学会場を選択してください'}**\n現在の選択　**${year}年${month}月${day}日**`, [
    select(actionId(session, 'booking_venue'), '見学会場を選択', venueOptions(data, session)),
    select(actionId(session, 'year'), '年', options([currentYear, currentYear + 1, currentYear + 2, currentYear + 3], '年', year)),
    select(actionId(session, 'month'), '月', options(Array.from({ length: 12 }, (_, i) => i + 1), '月', month)),
    select(actionId(session, 'day'), '日', days),
    row(button(actionId(session, 'time'), '時間を選ぶ', ButtonStyle.Primary), button(actionId(session, 'close'), '終了')),
  ]);
}

function timeScreen(session) {
  const [hour, minute] = session.time.split(':');
  return payload('来場時間を選択', `**${session.date}　${session.time}**\n9時半など、通常の表示時間外も登録できます。`, [
    select(actionId(session, 'hour'), '時', options(Array.from({ length: 24 }, (_, i) => i), '時', hour)),
    select(actionId(session, 'minute'), '分', options([0, 15, 30, 45], '分', minute)),
    row(button(actionId(session, 'name'), 'お客様名を入力', ButtonStyle.Primary), button(actionId(session, 'date'), '日付に戻る'), button(actionId(session, 'close'), '終了')),
  ]);
}

function textModal(session, action, title, label, value = '') {
  return new ModalBuilder().setCustomId(actionId(session, action)).setTitle(title).addComponents(
    row(new TextInputBuilder().setCustomId('text').setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setValue(value)),
  );
}

function boardControls(venue, view) {
  const controls = [button(`visit_book:${venue.id}`, '来場予約を登録', ButtonStyle.Primary), button(`visit_cancel:${venue.id}`, '予約を取り消す')];
  if (view.pages > 1) {
    controls.push(button(`visit_page:${venue.id}:${view.page - 1}`, '◀ 前の3日').setDisabled(view.page === 0));
    controls.push(button(`visit_page:${venue.id}:${view.page + 1}`, '次の3日 ▶').setDisabled(view.page === view.pages - 1));
  }
  return [row(...controls)];
}

async function boardPayload(data, venue) {
  const view = model.schedule(data, venue.id, venue.page);
  const board = embed('来場予約一覧_' + venue.name, view.dates.length
    ? view.dates.map(date => date.replace(/-/g, '/')).join('　｜　')
    : '現在、登録されている来場予約はありません。');
  board.setFooter({ text: `${view.page + 1} / ${view.pages}` });
  const result = { embeds: [board], components: boardControls(venue, view), allowedMentions: { parse: [] }, attachments: [], files: [] };
  if (view.dates.length) {
    result.files = [new AttachmentBuilder(await image.render(venue.name, view), { name: 'visit-reservations.png' })];
    board.setImage('attachment://visit-reservations.png');
  }
  return result;
}

async function fetchMessage(channel, id) {
  if (!id) return null;
  try { return await channel.messages.fetch(id); }
  catch (error) { if (error.code === 10008) return null; throw error; }
}

// Call while holding the guild lock. Save the reservation before publishing its image.
async function syncVenue(guild, venueId) {
  const data = model.config(guild.id);
  const venue = data.venues.find(item => item.id === venueId);
  if (!venue?.channelId) return;
  const channel = await guild.channels.fetch(venue.channelId);
  if (!channel?.send) throw new Error('予約表の表示先チャンネルが見つかりません。');
  let message = await fetchMessage(channel, venue.messageId);
  if (message && message.author.id !== guild.client.user.id) throw new Error('予約表の投稿を確認できません。');
  if (!message) {
    const recent = await channel.messages.fetch({ limit: 100 });
    // Recover the existing post from its persistent button after a metadata save failed.
    message = recent.find(item => item.author.id === guild.client.user.id && item.components?.some(component =>
      component.components?.some(button => button.customId === `visit_book:${venue.id}`)));
  }
  const content = await boardPayload(data, venue);
  message = message ? await message.edit(content) : await channel.send(content);
  venue.messageId = message.id;
  venue.renderedDate = model.today();
  venue.dirty = false;
  if (!await st.save(guild)) {
    venue.dirty = true;
    throw new Error('予約表を更新しましたが、表示情報の保存を再試行しています。');
  }
  const remaining = [];
  for (const retired of venue.retired || []) {
    try {
      const oldChannel = await guild.channels.fetch(retired.channelId);
      const old = await fetchMessage(oldChannel, retired.messageId);
      if (old?.author.id === guild.client.user.id) await old.delete();
    } catch (error) {
      if (![10003, 10008].includes(error.code)) remaining.push(retired);
    }
  }
  if (venue.retired?.length) {
    venue.retired = remaining;
    await st.save(guild);
  }
}

async function publish(guild, venueId) {
  try { await syncVenue(guild, venueId); return null; }
  catch (error) {
    const venue = model.config(guild.id).venues.find(item => item.id === venueId);
    if (venue) venue.dirty = true;
    console.error('来場予約表の更新失敗:', error.message);
    return '変更は保存されています。予約表の更新を再試行しています。Botの投稿・埋め込み・添付・履歴の権限を確認してください。';
  }
}

async function openManagement(interaction) {
  if (interaction.guildId !== model.GUILD || !isAdmin(interaction)) return interaction.reply(payload('来場予約の管理', 'この操作は社内サーバーの管理者が利用できます。'));
  const session = createSession(interaction, 'manage');
  return interaction.reply(management(session));
}

function cancellationScreen(session) {
  const data = model.config(session.guildId);
  const bookings = data.bookings.filter(item => item.venueId === session.venueId && item.date >= model.today())
    .sort((a, b) => (a.date + a.time + a.name).localeCompare(b.date + b.time + b.name));
  const page = session.cancelPage || 0;
  const items = bookings.slice(page * 23, (page + 1) * 23).map(item => ({ label: `${item.date} ${item.time} ${item.name} 様`.slice(0, 100), value: item.id }));
  if (page > 0) items.push({ label: '◀ 前の予約', value: 'previous' });
  if ((page + 1) * 23 < bookings.length) items.push({ label: '次の予約 ▶', value: 'next' });
  return payload('予約を取り消す', items.length ? '取り消す予約を選択してください。' : '取り消せる予約はありません。', [
    ...(items.length ? [select(actionId(session, 'cancel_pick'), '予約を選択', items)] : []),
    row(button(actionId(session, 'close'), '終了')),
  ]);
}

async function handle(interaction) {
  if (interaction.guildId !== model.GUILD) return interaction.reply(payload('来場予約', 'この機能は社内サーバーで利用できます。'));
  const [prefix, key, action] = interaction.customId.split(':');
  if (prefix !== 'visit_session') {
    const venue = model.config(interaction.guildId).venues.find(item => item.id === key);
    if (!venue || venue.channelId !== interaction.channelId || venue.messageId !== interaction.message?.id) return interaction.reply(payload('来場予約', '最新の予約表から操作してください。'));
    if (prefix === 'visit_page') {
      await interaction.deferUpdate();
      return model.serialized(interaction.guildId, async () => {
        await model.saveChange(interaction.guild, data => {
          const current = data.venues.find(item => item.id === key);
          current.page = model.schedule(data, key, Number(action)).page;
          current.dirty = true;
        });
        await syncVenue(interaction.guild, key);
      });
    }
    if (!['visit_book', 'visit_cancel'].includes(prefix)) return;
    const session = createSession(interaction, prefix === 'visit_book' ? 'booking' : 'cancel', venue.id);
    return interaction.reply(prefix === 'visit_book' ? dateScreen(session) : cancellationScreen(session));
  }
  const session = sessions.get(key);
  if (!session || session.guildId !== interaction.guildId || session.expires < Date.now()) {
    sessions.delete(key);
    return interaction.reply(payload('来場予約', '操作が期限切れです。予約表、または /visit から開き直してください。'));
  }
  if (session.userId !== interaction.user.id) return interaction.reply(payload('来場予約', '自分で開いた予約画面から操作してください。'));
  session.expires = Date.now() + TIMEOUT;
  if (session.kind === 'manage' && !isAdmin(interaction)) return interaction.reply(payload('来場予約', 'この操作には管理者権限が必要です。'));
  if (action === 'close') {
    await interaction.deferUpdate(); sessions.delete(key);
    return interaction.deleteReply();
  }
  if (session.kind === 'manage') return handleManagement(interaction, session, action);
  if (session.kind === 'cancel') return handleCancellation(interaction, session, action);
  if (action === 'booking_venue') {
    const value = interaction.values[0];
    if (value === 'previous') session.venuePage--;
    else if (value === 'next') session.venuePage++;
    else session.venueId = value;
    return interaction.update(dateScreen(session));
  }
  if (action === 'date') return interaction.update(dateScreen(session));
  if (action === 'time') return interaction.update(timeScreen(session));
  if (['year', 'month', 'day'].includes(action)) {
    const value = interaction.values[0];
    if (value === 'switch') session.dayPage = session.dayPage ? 0 : 1;
    else {
      let [year, month, day] = session.date.split('-').map(Number);
      if (action === 'year') year = Number(value);
      if (action === 'month') month = Number(value);
      if (action === 'day') day = Number(value);
      day = Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
      session.date = `${year}-${pad(month)}-${pad(day)}`;
      if (session.date < model.today()) session.date = model.today();
    }
    return interaction.update(dateScreen(session));
  }
  if (['hour', 'minute'].includes(action)) {
    const [hour, minute] = session.time.split(':');
    session.time = action === 'hour' ? interaction.values[0] + ':' + minute : hour + ':' + interaction.values[0];
    return interaction.update(timeScreen(session));
  }
  if (action === 'name') return interaction.showModal(textModal(session, 'submit', '来場予約を登録', 'お客様名（敬称略）'));
  if (action === 'submit') {
    await interaction.deferUpdate();
    return model.serialized(interaction.guildId, async () => {
      await model.saveChange(interaction.guild, data => model.addBooking(data, { venueId: session.venueId, date: session.date, time: session.time, name: interaction.fields.getTextInputValue('text'), userId: interaction.user.id }));
      sessions.delete(key);
      const warning = await publish(interaction.guild, session.venueId);
      if (warning) return interaction.editReply(payload('来場予約', warning));
      return interaction.deleteReply();
    });
  }
}

async function handleManagement(interaction, session, action) {
  if (action === 'venue') {
    const value = interaction.values[0];
    if (value === 'previous') session.venuePage--;
    else if (value === 'next') session.venuePage++;
    else session.venueId = value;
    return interaction.update(management(session));
  }
  const venue = model.config(interaction.guildId).venues.find(item => item.id === session.venueId);
  if (action === 'add') return interaction.showModal(textModal(session, 'add_submit', '見学会場を登録', '見学会場名'));
  if (action === 'rename' && venue) return interaction.showModal(textModal(session, 'rename_submit', '会場名を変更', '見学会場名', venue.name));
  if (['add_submit', 'rename_submit'].includes(action)) {
    await interaction.deferUpdate();
    return model.serialized(interaction.guildId, async () => {
      await model.saveChange(interaction.guild, data => {
        const name = interaction.fields.getTextInputValue('text');
        if (action === 'add_submit') session.venueId = model.addVenue(data, name).id;
        else model.renameVenue(data, session.venueId, name);
      });
      if (action === 'rename_submit') await publish(interaction.guild, session.venueId);
      return interaction.editReply(management(session));
    });
  }
  if (action === 'channel' && venue) {
    await interaction.deferUpdate();
    return model.serialized(interaction.guildId, async () => {
      const channel = await interaction.guild.channels.fetch(interaction.values[0]);
      const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
      const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory];
      if (channel?.type !== ChannelType.GuildText || !channel.permissionsFor(me)?.has(required)) throw new Error('選択先でBotの閲覧・投稿・埋め込み・添付・履歴の権限を許可してください。');
      await model.saveChange(interaction.guild, data => {
        const current = data.venues.find(item => item.id === session.venueId);
        if (current.channelId !== channel.id) {
          if (current.messageId) (current.retired ||= []).push({ channelId: current.channelId, messageId: current.messageId });
          current.channelId = channel.id;
          current.messageId = null;
        }
        current.dirty = true;
      });
      const warning = await publish(interaction.guild, session.venueId);
      const result = management(session);
      if (warning) result.embeds[0].addFields({ name: '表示更新', value: warning });
      return interaction.editReply(result);
    });
  }
  if (action === 'preview' && venue) {
    await interaction.deferUpdate();
    const data = model.config(interaction.guildId), view = model.schedule(data, venue.id, venue.page);
    const result = management(session);
    result.attachments = [];
    result.files = [];
    if (view.dates.length) {
      result.files.push(new AttachmentBuilder(await image.render(venue.name, view), { name: 'visit-reservations.png' }));
      result.embeds[0].setImage('attachment://visit-reservations.png');
    } else result.embeds[0].addFields({ name: '予約表', value: '予約が入ると、その日付の表が表示されます。' });
    return interaction.editReply(result);
  }
}

async function handleCancellation(interaction, session, action) {
  if (action === 'cancel_pick') {
    const id = interaction.values[0];
    if (id === 'previous' || id === 'next') {
      session.cancelPage = (session.cancelPage || 0) + (id === 'next' ? 1 : -1);
      return interaction.update(cancellationScreen(session));
    }
    const booking = model.config(interaction.guildId).bookings.find(item => item.id === id && item.venueId === session.venueId);
    if (!booking) return interaction.update(cancellationScreen(session));
    session.bookingId = booking.id;
    return interaction.update(payload('予約の取り消し', `${booking.date}　${booking.time}\n**${booking.name} 様**\nこの予約を取り消しますか？`, [row(button(actionId(session, 'cancel_confirm'), '取り消す', ButtonStyle.Danger), button(actionId(session, 'close'), '終了'))]));
  }
  if (action === 'cancel_confirm') {
    await interaction.deferUpdate();
    return model.serialized(interaction.guildId, async () => {
      await model.saveChange(interaction.guild, data => {
        data.bookings = data.bookings.filter(item => item.id !== session.bookingId || item.venueId !== session.venueId);
        const venue = data.venues.find(item => item.id === session.venueId);
        if (venue) venue.dirty = true;
      });
      sessions.delete(session.id);
      const warning = await publish(interaction.guild, session.venueId);
      if (warning) return interaction.editReply(payload('来場予約', warning));
      return interaction.deleteReply();
    });
  }
}

async function tick(client, force = false) {
  const guild = client.guilds.cache.get(model.GUILD);
  if (!guild) return;
  await model.serialized(guild.id, async () => {
    for (const venue of model.config(guild.id).venues) {
      if (venue.channelId && (force || venue.dirty || venue.renderedDate !== model.today() || venue.retired?.length)) await publish(guild, venue.id);
    }
  });
  for (const [id, session] of sessions) if (session.expires < Date.now()) sessions.delete(id);
}

async function reportError(interaction, error) {
  console.error('来場予約の操作失敗:', error.message);
  const description = /^(予約|会場|同じ|お客様|来場|登録済み|選択先)/.test(error.message)
    ? error.message : '操作できませんでした。少し待ってからやり直してください。';
  const response = payload('来場予約', description);
  if (interaction.deferred || interaction.replied) return interaction.editReply(response);
  return interaction.reply(response);
}

module.exports = { openManagement, handle, tick, reportError, boardPayload };
