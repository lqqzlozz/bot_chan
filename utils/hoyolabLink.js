const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const api = require('./hoyolabApi');
const store = require('./hoyolabStore');
const st = require('./store');
const { isGI } = require('./gi');
const sessions = new Map();
const TTL = 10 * 60 * 1000;
const MAX_BODY = 16 * 1024;

function publicOrigin() {
  const value = process.env.HOYOLAB_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (!value || new URL(value).protocol !== 'https:') throw new Error('HoYoLab連携ページのHTTPS URLが未設定です。');
  return new URL(value).origin;
}

function create(guildId, userId, uid) {
  store.encryptionKey();
  const origin = publicOrigin();
  for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
  if (sessions.size >= 1000) throw new Error('連携処理が混み合っています。少し待ってから試してください。');
  const token = crypto.randomBytes(32).toString('hex');
  const session = { guildId, userId, uid, expires: Date.now() + TTL, deviceId: crypto.randomBytes(8).toString('hex'),
    attempts: 0, busy: false, credentials: null, challenge: null, ticket: null };
  sessions.set(token, session);
  setTimeout(() => sessions.delete(token), TTL).unref();
  // Fragments are not included in HTTP access logs or Referer headers.
  return `${origin}/hoyolab#${token}`;
}

function revoke(guildId, userId) {
  for (const [token, session] of sessions) {
    if (session.guildId !== guildId || session.userId !== userId) continue;
    session.revoked = true;
    session.credentials = null;
    session.ticket = null;
    sessions.delete(token);
  }
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('JSON形式で送信してください。');
  const chunks = []; let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) throw new Error('送信データが大きすぎます。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('入力内容を確認してください。'); }
}

function captchaResult(session, result) {
  const keys = session.challenge.version === 4
    ? ['captcha_id', 'lot_number', 'pass_token', 'gen_time', 'captcha_output']
    : ['geetest_challenge', 'geetest_validate', 'geetest_seccode'];
  const clean = {};
  for (const key of keys) {
    if (typeof result?.[key] !== 'string' || !result[key] || result[key].length > 4096) throw new Error('画像認証をやり直してください。');
    clean[key] = result[key];
  }
  if (session.challenge.version === 4 && clean.captcha_id !== session.challenge.gt) throw new Error('画像認証が一致しません。');
  return { sessionId: session.challenge.sessionId, result: clean };
}

async function processLogin(session, body, guild) {
  if (body.action === 'login') {
    if (typeof body.email !== 'string' || body.email.length > 200 || Buffer.byteLength(body.email) > 245 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
      typeof body.password !== 'string' || body.password.length < 1 || Buffer.byteLength(body.password) > 245) throw new Error('メールアドレスとパスワードを確認してください。');
    // Only RSA-encrypted credentials remain in the short-lived RAM session.
    session.credentials = api.encryptCredentials(body.email.trim(), body.password);
    session.challenge = null;
    session.ticket = null;
  }
  if (!session.credentials) throw new Error('最初からログインしてください。');
  let captcha;
  if (body.action === 'captcha') {
    if (!session.challenge) throw new Error('画像認証の期限が切れています。');
    captcha = captchaResult(session, body.result);
  } else if (body.action === 'email') {
    if (!session.ticket || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new Error('メールに届いた6桁の認証コードを入力してください。');
    await api.verifyEmail(body.code, session.ticket);
  } else if (body.action !== 'login') throw new Error('操作を確認してください。');
  if (session.revoked || session.expires < Date.now()) throw new api.HoyoError('連携リンクの期限が切れています。Discordからやり直してください。', 'auth');
  const result = await api.login(session.credentials, session.deviceId, { captcha, ticket: session.ticket });
  if (result.step === 'captcha') {
    session.challenge = result.challenge;
    return { step: 'captcha', challenge: result.challenge };
  }
  if (result.step === 'email') {
    session.ticket = result.ticket;
    session.challenge = null;
    return { step: 'email' };
  }
  if (String(st.get(guild.id).intro?.[session.userId]?.uid) !== session.uid) throw new Error('登録UIDが変更されています。Discordで /all-char を開き直してください。');
  const linked = await store.link(guild, session.userId, session.uid, result.cookies, () => !session.revoked && session.expires >= Date.now() && isGI(guild.id)
    && String(st.get(guild.id).intro?.[session.userId]?.uid) === session.uid);
  session.credentials = null;
  session.ticket = null;
  session.challenge = null;
  return { step: 'success', count: linked.characters.length, uid: linked.uid };
}

function serve(req, res) {
  const asset = req.url?.split('?')[0];
  const files = { '/hoyolab': ['hoyolab.html', 'text/html'], '/hoyolab/': ['hoyolab.html', 'text/html'],
    '/hoyolab.js': ['hoyolab.js', 'text/javascript'] };
  if (!files[asset]) return false;
  if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed' }); return true; }
  const [file, type] = files[asset];
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-eval' https://static.geetest.com https://*.geetest.com https://*.geevisit.com https://*.captchami.com; style-src 'unsafe-inline' https://*.geetest.com https://*.geevisit.com; img-src data: blob: https://*.geetest.com https://*.geevisit.com https://*.captchami.com; connect-src 'self' https://*.geetest.com https://*.geevisit.com https://*.captchami.com; frame-src https://*.geetest.com https://*.geevisit.com https://*.captchami.com; font-src https://*.geetest.com; form-action 'none'; base-uri 'none'; frame-ancestors 'none'" });
  fs.createReadStream(path.join(__dirname, '..', 'public', file)).pipe(res);
  return true;
}

async function handle(req, res, client) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  let origin;
  try { origin = publicOrigin(); } catch { return send(res, 503, { error: '連携ページが未設定です。' }); }
  if (req.headers.origin !== origin) return send(res, 403, { error: 'このページから操作してください。' });
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const session = /^[a-f0-9]{64}$/.test(token) && sessions.get(token);
  if (!session || session.expires < Date.now()) return send(res, 403, { error: '連携リンクの期限が切れています。Discordで連携ボタンを押し直してください。' });
  if (session.busy) return send(res, 409, { error: '処理中です。少し待ってください。' });
  const guild = client.guilds.cache.get(session.guildId);
  if (!guild || !isGI(guild.id)) return send(res, 403, { error: 'このサーバーで原神機能を利用できません。' });
  session.busy = true;
  try {
    const body = await readJson(req);
    if (body.action === 'status') return send(res, 200, { uid: session.uid, expires: session.expires });
    session.attempts++;
    if (session.attempts > 12) return send(res, 429, { error: '試行回数が多いため、Discordから連携をやり直してください。' });
    const result = await processLogin(session, body, guild);
    if (result.step === 'success') sessions.delete(token);
    return send(res, 200, result);
  } catch (error) {
    // Never log bodies, passwords, captcha tickets, cookies or upstream objects.
    const message = error instanceof api.HoyoError || /^(メール|画像|認証|登録UID|最初|操作|入力|送信|JSON|HoYoLab)/.test(error.message)
      ? error.message : '連携処理を完了できませんでした。少し待ってからやり直してください。';
    return send(res, 400, { error: message });
  } finally { session.busy = false; }
}

module.exports = { create, revoke, serve, handle, captchaResult };
