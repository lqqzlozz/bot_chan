const crypto = require('node:crypto');
const st = require('./store');
const api = require('./hoyolabApi');
const locks = new Map();
const CACHE_MS = 5 * 60 * 1000;

function encryptionKey() {
  const value = process.env.HOYOLAB_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('HoYoLab連携の暗号化鍵が未設定です。Bot管理者に連絡してください。');
  return Buffer.from(value, 'hex');
}

function encrypt(guildId, userId, cookies) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${guildId}:${userId}:hoyolab:v1`));
  const data = Buffer.concat([cipher.update(JSON.stringify(cookies), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function decrypt(guildId, userId, sealed) {
  try {
    if (sealed?.version !== 1) throw new Error('version');
    const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(sealed.iv, 'base64'));
    cipher.setAAD(Buffer.from(`${guildId}:${userId}:hoyolab:v1`));
    cipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(sealed.data, 'base64')), cipher.final()]).toString('utf8'));
  } catch { throw new api.HoyoError('認証情報を読み取れません。HoYoLabへ再連携してください。', 'auth'); }
}

const accounts = guildId => (st.get(guildId).hoyolab ||= {});
const entry = (guildId, userId) => accounts(guildId)[userId];

async function serialized(guildId, action) {
  const previous = locks.get(guildId) || Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  locks.set(guildId, current);
  try { return await current; } finally { if (locks.get(guildId) === current) locks.delete(guildId); }
}

async function replace(guild, userId, value) {
  const data = accounts(guild.id), previous = data[userId];
  if (value) data[userId] = value; else delete data[userId];
  if (!await st.save(guild)) {
    if (previous) data[userId] = previous; else delete data[userId];
    throw new Error('HoYoLab連携情報を保存できません。#bot-config の権限を確認してください。');
  }
}

async function link(guild, userId, uid, cookies, canLink = () => true) {
  const role = await api.account(cookies, uid);
  const list = await api.characters(cookies, role);
  return serialized(guild.id, async () => {
    if (!canLink()) throw new api.HoyoError('連携リンクの期限が切れたか、連携が解除されています。Discordからやり直してください。', 'auth');
    const value = { uid: role.uid, server: role.server, cookies: encrypt(guild.id, userId, cookies),
      characters: list, fetchedAt: Date.now(), needsAuth: false };
    await replace(guild, userId, value);
    return value;
  });
}

async function roster(guild, userId, uid, force = false) {
  return serialized(guild.id, async () => {
    const value = entry(guild.id, userId);
    if (!value || value.uid !== uid) return { value: null, status: 'unlinked' };
    if (value.needsAuth) return { value, status: 'auth' };
    if (!force && Date.now() - value.fetchedAt < CACHE_MS) return { value, status: 'ok' };
    let characters;
    try { characters = await api.characters(decrypt(guild.id, userId, value.cookies), value); }
    catch (error) {
      if (error.kind === 'auth') await replace(guild, userId, { ...value, needsAuth: true });
      return { value: entry(guild.id, userId), status: error.kind === 'auth' ? 'auth' : 'cached' };
    }
    const updated = { ...value, characters, fetchedAt: Date.now(), needsAuth: false };
    await replace(guild, userId, updated);
    return { value: updated, status: 'ok' };
  });
}

async function unlink(guild, userId) { return serialized(guild.id, () => replace(guild, userId, null)); }

module.exports = { encryptionKey, encrypt, decrypt, entry, link, roster, unlink };
