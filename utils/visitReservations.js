const { randomUUID } = require('node:crypto');
const st = require('./store');

const GUILD = '1496054346385723472';
const DAYS_PER_PAGE = 3;
const locks = new Map();

function today() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const normalize = value => value.normalize('NFKC').trim().replace(/[\s　]+/gu, ' ');
function config(guildId) {
  const data = st.get(guildId);
  data.visitReservations ||= { venues: [], bookings: [] };
  return data.visitReservations;
}

async function serialized(guildId, run) {
  const previous = locks.get(guildId) || Promise.resolve();
  const current = previous.catch(() => {}).then(run);
  locks.set(guildId, current);
  try { return await current; }
  finally { if (locks.get(guildId) === current) locks.delete(guildId); }
}

// Call within serialized() so another edit cannot be rolled back by a failed save.
async function saveChange(guild, change) {
  const previous = structuredClone(config(guild.id));
  try {
    const result = change(config(guild.id));
    if (!await st.save(guild)) throw new Error('予約を保存できませんでした。#bot-config の権限を確認してください。');
    return result;
  } catch (error) {
    st.get(guild.id).visitReservations = previous;
    throw error;
  }
}

function addVenue(data, name) {
  const cleaned = normalize(name);
  if (!cleaned || cleaned.length > 60) throw new Error('会場名は1〜60文字で入力してください。');
  if (data.venues.some(venue => normalize(venue.name) === cleaned)) throw new Error('同じ名前の会場が登録されています。');
  const venue = { id: randomUUID(), name: cleaned, channelId: null, messageId: null, page: 0, dirty: true };
  data.venues.push(venue);
  return venue;
}

function renameVenue(data, venueId, name) {
  const venue = data.venues.find(item => item.id === venueId);
  if (!venue) throw new Error('会場が見つかりません。');
  const cleaned = normalize(name);
  if (!cleaned || cleaned.length > 60) throw new Error('会場名は1〜60文字で入力してください。');
  if (data.venues.some(item => item.id !== venueId && normalize(item.name) === cleaned)) throw new Error('同じ名前の会場が登録されています。');
  venue.name = cleaned;
  venue.dirty = true;
}

function addBooking(data, input, fromDate = today()) {
  const venue = data.venues.find(item => item.id === input.venueId);
  if (!venue) throw new Error('登録済みの会場を選択してください。');
  const name = normalize(input.name).replace(/(?:\s*(?:様|さん))+$/u, '').trim();
  if (!name || name.length > 60) throw new Error('お客様名は1〜60文字で入力してください。');
  if (!validDate(input.date) || input.date < fromDate || !validTime(input.time)) throw new Error('来場日時を確認してください。');
  const duplicate = data.bookings.find(item => item.venueId === venue.id && item.date === input.date && item.time === input.time && item.name === name);
  if (duplicate) return duplicate;
  const booking = { id: randomUUID(), venueId: venue.id, date: input.date, time: input.time, name, userId: input.userId };
  data.bookings.push(booking);
  venue.dirty = true;
  // Show the date just booked, including when adding to an older page.
  const dates = [...new Set(data.bookings.filter(item => item.venueId === venue.id && item.date >= fromDate).map(item => item.date))].sort();
  venue.page = Math.floor(dates.indexOf(input.date) / DAYS_PER_PAGE);
  return booking;
}

function schedule(data, venueId, page = 0, fromDate = today()) {
  const bookings = data.bookings.filter(item => item.venueId === venueId && item.date >= fromDate);
  const dates = [...new Set(bookings.map(item => item.date))].sort();
  const pages = Math.max(1, Math.ceil(dates.length / DAYS_PER_PAGE));
  const current = Math.min(Math.max(0, Math.trunc(Number(page) || 0)), pages - 1);
  const visibleDates = dates.slice(current * DAYS_PER_PAGE, (current + 1) * DAYS_PER_PAGE);
  const times = new Set();
  for (let minute = 600; minute <= 1020; minute += 30) {
    times.add(String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0'));
  }
  for (const item of bookings) if (visibleDates.includes(item.date)) times.add(item.time);
  return { dates: visibleDates, times: [...times].sort(), bookings: bookings.filter(item => visibleDates.includes(item.date)), page: current, pages, total: bookings.length };
}

module.exports = { GUILD, DAYS_PER_PAGE, today, validDate, validTime, config, serialized, saveChange, addVenue, renameVenue, addBooking, schedule };
