const { EmbedBuilder, escapeMarkdown } = require('discord.js');
const st = require('./store');
const { GUILD, isEnabled } = require('./entryScope');
const schedule = require('./seasonSchedule');
const { translate } = require('./seasonText');
const CHANNEL_ID = '1568107786376847501';
const locks = new Set();
const DAY = 86400000;
const shift = (date, days) => new Date(schedule.parseDate(date) + days * DAY).toISOString().slice(0, 10);
function monthBefore(date) {
  const d = new Date(schedule.parseDate(date)), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
function state(guildId) {
  return st.get(guildId).seasonSchedulePosts ||= { dates: {}, jobs: {} };
}
async function save(guild) {
  if (!await st.save(guild)) throw new Error('日程・リマインドを保存できませんでした。設定チャンネルの権限を確認してから再実行してください。');
}
const marker = (date, part) => `シーズン日程｜${date}｜${part + 1}`;
function line(e) {
  return '・' + (schedule.categories[e.category] || translate(e.category)) + '：' + e.events.map(translate).map(escapeMarkdown).join('\n　');
}
function buildDays(result, fallback) {
  const days = new Map();
  for (const e of result.entries) {
    const date = schedule.dateAt(e.day);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(e);
  }
  // The next-season notice belongs to this season's last-day post, not another season's schedule.
  if (!days.has(result.end)) days.set(result.end, []);
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => {
    const lines = entries.map(line);
    if (date === result.end) {
      lines.push('・シーズン最終日');
      if (result.nextSeason) lines.push('・次シーズン：' + escapeMarkdown(translate(result.nextSeason.name)) + '（' + result.nextSeason.date + ' 08:00開始予定）');
    }
    const descriptions = [];
    let text = '';
    for (const item of lines) {
      if (text.length + item.length > 3300) { descriptions.push(text); text = ''; }
      text += item + '\n';
    }
    if (text) descriptions.push(text);
    return { date, entries, embeds: descriptions.map((description, part) => new EmbedBuilder().setColor('#D69A32')
      .setTitle(date).setDescription(description)
      .setURL('https://qenu.github.io/ethna-timeline/').setFooter({ text: marker(date, part) })) };
  });
}
function jobsFor(day, result, messageId) {
  const jobs = [];
  const add = (kind, date, label, due, lines) => jobs.push({ id: `${day.date}:${kind}:${label}`, postDate: day.date, targetDate: date, kind, label, due, lines, messageId });
  for (const [category, kind, offsets] of [['副本', 'ダンジョン', [7, 2]], ['古遺物', '遺物', [10, 3]]]) {
    const lines = day.entries.filter(e => e.category === category).map(line);
    if (lines.length) for (const n of offsets) add(kind, day.date, n + '日前', shift(day.date, -n), lines);
  }
  if (day.date === result.end && result.nextSeason) {
    const next = result.nextSeason;
    const lines = ['・次シーズン：' + escapeMarkdown(translate(next.name)) + '（08:00開始予定）'];
    add('次シーズン', next.date, '1か月前', monthBefore(next.date), lines);
    for (const n of [7, 1]) add('次シーズン', next.date, n === 1 ? '前日' : '7日前', shift(next.date, -n), lines);
  }
  return jobs;
}
async function recover(channel, clientId, key) {
  let before;
  // Only used for interrupted sends. If history cannot be fully checked, fail closed.
  for (let n = 0; n < 10; n++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    const found = batch.find(m => m.author.id === clientId && m.embeds?.some(e => e.footer?.text === key));
    if (found) return found;
    if (batch.size < 100) return null;
    before = batch.last().id;
  }
  throw new Error('送信済み投稿を確認できませんでした。重複防止のため停止しました。');
}
async function publish(channel, clientId, result, fallback, now = Date.now()) {
  if (channel.id !== CHANNEL_ID || !isEnabled(channel.guild?.id)) throw new Error('日程の投稿先を確認してください。');
  if (locks.has(channel.guild.id)) throw new Error('日程を処理中です。少し待ってから再実行してください。');
  locks.add(channel.guild.id);
  try {
    const s = state(channel.guild.id);
    const days = buildDays(result, fallback).filter(day => day.date >= gameClock(now).date);
    let posted = 0;
    for (const day of days) {
      const record = s.dates[day.date] ||= { ids: [], pending: null };
      for (const [part, embed] of day.embeds.entries()) {
        let message;
        if (record.ids[part]) {
          try { message = await channel.messages.fetch(record.ids[part]); }
          catch (error) { if (error.code !== 10008) throw error; }
          if (message && message.author.id !== clientId) throw new Error('保存済み日程の投稿者が一致しません。');
        }
        if (!message && record.pending === part) message = await recover(channel, clientId, marker(day.date, part));
        const payload = { embeds: [embed], allowedMentions: { parse: [] } };
        if (message) await message.edit(payload);
        else {
          record.pending = part;
          await save(channel.guild);
          message = await channel.send(payload);
          posted++;
        }
        record.ids[part] = message.id;
        record.pending = null;
        await save(channel.guild);
      }
      for (const job of jobsFor(day, result, record.ids[0])) {
        const old = s.jobs[job.id];
        s.jobs[job.id] = { ...job, sentId: old?.sentId, pending: old?.pending || false };
      }
      await save(channel.guild);
    }
    return { posted, days: days.length };
  } finally { locks.delete(channel.guild.id); }
}
function gameClock(now = Date.now()) {
  const jst = new Date(now + 9 * 3600000);
  const hour = jst.getUTCHours();
  const date = new Date(jst.getTime() - (hour < 8 ? DAY : 0)).toISOString().slice(0, 10);
  return { date, hour };
}
const reminderMarker = job => `日程リマインド｜${job.postDate}｜${job.kind}｜${job.label}`;
const matches = (message, clientId, key) => message.author.id === clientId && message.embeds?.some(e => e.footer?.text === key);
async function fetchOwned(channel, clientId, id, key) {
  if (!id) return null;
  let message;
  try { message = await channel.messages.fetch(id); }
  catch (error) { if (error.code === 10008) return null; throw error; }
  return matches(message, clientId, key) ? message : null;
}
async function removeOwned(channel, clientId, id, key) {
  const message = await fetchOwned(channel, clientId, id, key);
  if (message) {
    try { await message.delete(); }
    catch (error) { if (error.code !== 10008) throw error; }
  }
}
async function cleanup(channel, clientId, s, today) {
  for (const [date, record] of Object.entries(s.dates)) {
    if (date >= today) continue;
    for (const job of Object.values(s.jobs).filter(j => j.postDate === date)) {
      if (job.pending && !job.sentId) {
        const sent = await recover(channel, clientId, reminderMarker(job));
        if (sent) job.sentId = sent.id;
      }
      await removeOwned(channel, clientId, job.sentId, reminderMarker(job));
    }
    if (record.pending !== null && record.pending !== undefined && !record.ids[record.pending]) {
      const message = await recover(channel, clientId, marker(date, record.pending));
      if (message) record.ids[record.pending] = message.id;
    }
    for (const [part, id] of record.ids.entries()) await removeOwned(channel, clientId, id, marker(date, part));
    delete s.dates[date];
    for (const [id, job] of Object.entries(s.jobs)) if (job.postDate === date) delete s.jobs[id];
    await save(channel.guild);
    console.log('過去の日程を削除:', date);
  }
}
async function refresh(client, now = Date.now()) {
  const s = st.get(GUILD).seasonSchedulePosts;
  if (!s || s.displayVersion === 2 || locks.has(GUILD)) return;
  locks.add(GUILD);
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (channel?.id !== CHANNEL_ID || !isEnabled(channel.guild?.id)) return;
    const update = async (id, key) => {
      const message = await fetchOwned(channel, client.user.id, id, key);
      if (!message) return;
      const embeds = message.embeds.map(e => {
        const raw = e.toJSON ? e.toJSON() : e;
        return EmbedBuilder.from(raw).setDescription(translate(raw.description || ''))
          .setFields((raw.fields || []).filter(f => !['表記について', '日程の基準'].includes(f.name)));
      });
      await message.edit({ embeds, allowedMentions: { parse: [] } });
    };
    for (const [date, record] of Object.entries(s.dates)) {
      if (date < gameClock(now).date) continue;
      for (const [part, id] of record.ids.entries()) await update(id, marker(date, part));
    }
    for (const job of Object.values(s.jobs)) {
      job.lines = job.lines.map(translate);
      if (job.postDate >= gameClock(now).date && job.sentId) await update(job.sentId, reminderMarker(job));
    }
    s.displayVersion = 2;
    await save(channel.guild);
    console.log('日程の表示更新完了');
  } finally { locks.delete(GUILD); }
}
async function tick(client, now = Date.now()) {
  if (locks.has(GUILD)) return;
  const s = st.get(GUILD).seasonSchedulePosts;
  if (!s) return;
  const clock = gameClock(now);
  // The game day runs from 08:00 JST until 07:59 JST the next calendar day.
  const due = Object.values(s.jobs).filter(j => !j.sentId && j.due === clock.date);
  if (!due.length && !Object.keys(s.dates).some(date => date < clock.date)) return;
  locks.add(GUILD);
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (channel?.id !== CHANNEL_ID || !isEnabled(channel.guild?.id)) return;
    await cleanup(channel, client.user.id, s, clock.date);
    for (const job of due) {
      if (!s.jobs[job.id]) continue;
      const key = reminderMarker(job);
      let sent = job.pending && await recover(channel, client.user.id, key);
      if (!sent) {
        let original;
        try { original = await channel.messages.fetch(job.messageId); }
        catch (error) { if (error.code === 10008) continue; throw error; }
        if (original.author.id !== client.user.id) continue;
        job.pending = true;
        await save(channel.guild);
        const embed = new EmbedBuilder().setColor('#E8A338').setTitle(job.targetDate)
          .setDescription('🔔 ' + job.kind + 'まで' + (job.label === '前日' ? 'あと1日' : job.label.replace('前', '')) + '\n' + job.lines.join('\n'))
          .setFooter({ text: key });
        sent = await original.reply({ embeds: [embed], allowedMentions: { parse: [], repliedUser: false } });
      }
      job.sentId = sent.id;
      job.pending = false;
      await save(channel.guild);
      console.log('日程リマインド送信完了:', job.targetDate, job.kind, job.label);
    }
  } finally { locks.delete(GUILD); }
}
module.exports = { CHANNEL_ID, buildDays, jobsFor, publish, tick, refresh, gameClock, monthBefore };
