const crypto = require('node:crypto');

// Protocol reference: seriaati/genshin.py auth, cookie and chronicle components.
// Only international HoYoLAB accounts are supported here.
const LOGIN_URL = 'https://sg-public-api.hoyoverse.com/account/ma-passport/api/appLoginByPassword';
const TOKEN_URL = 'https://sg-public-api.hoyoverse.com/account/ma-passport/token/getBySToken';
const VERIFY_URL = 'https://sg-public-api.hoyoverse.com/account/ma-verifier/api/verifyActionTicketPartly';
const ROLES_URL = 'https://api-os-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie';
const CHARACTERS_URL = 'https://sg-public-api.hoyolab.com/event/game_record/genshin/api/character/list';
const LOGIN_SALT = 'IZPgfb0dRPtBeLuFkdDznSZ6f4wWt6y2';
const RECORD_SALT = '6s25p5ox5y14umn1p61aqyyvbvvl3lrt';
const LOGIN_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4PMS2JVMwBsOIrYWRluY
wEiFZL7Aphtm9z5Eu/anzJ09nB00uhW+ScrDWFECPwpQto/GlOJYCUwVM/raQpAj
/xvcjK5tNVzzK94mhk+j9RiQ+aWHaTXmOgurhxSp3YbwlRDvOgcq5yPiTz0+kSeK
ZJcGeJ95bvJ+hJ/UMP0Zx2qB5PElZmiKvfiNqVUk8A8oxLJdBB5eCpqWV6CUqDKQ
KSQP4sM0mZvQ1Sr4UcACVcYgYnCbTZMWhJTWkrNXqI8TMomekgny3y+d6NX/cFa6
6jozFIF4HCX5aW8bp8C8vq2tFvFbleQ/Q3CU56EWWKMrOcpmFtRmC18s9biZBVR/
8QIDAQAB
-----END PUBLIC KEY-----`;
const LOGIN_HEADERS = { 'x-rpc-app_id': 'c9oqaq3s3gu8', 'x-rpc-client_type': '2',
  'x-rpc-aigis_v4': 'true', 'x-rpc-app_version': '4.8.0', 'x-rpc-sdk_version': '2.2.0' };

class HoyoError extends Error {
  constructor(message, kind = 'unavailable') { super(message); this.kind = kind; }
}

function dynamicSecret(salt, body) {
  const time = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(6).toString('hex').slice(0, 6);
  const suffix = body === undefined ? '' : `&b=${JSON.stringify(body)}&q=`;
  const hash = crypto.createHash('md5').update(`salt=${salt}&t=${time}&r=${nonce}${suffix}`).digest('hex');
  return `${time},${nonce},${hash}`;
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([key, value]) => {
    if (!/^[a-z0-9_]+$/i.test(key) || typeof value !== 'string' || /[;\r\n]/.test(value)) throw new HoyoError('認証情報の形式が不正です。再連携してください。', 'auth');
    return `${key}=${value}`;
  }).join('; ');
}

function apiError(code) {
  if ([10001, -100, 10103, -1071].includes(code)) return new HoyoError('HoYoLabの認証が切れています。再連携してください。', 'auth');
  if ([10035, 5003, 10041, 1034].includes(code)) return new HoyoError('HoYoLab側で追加認証が必要です。再連携してください。', 'auth');
  if (code === 10102) return new HoyoError('HoYoLabの戦績公開設定を確認してください。', 'private');
  if ([-3004, -3208, -3203].includes(code)) return new HoyoError('メールアドレスまたはパスワードを確認してください。', 'login');
  if (code === -3202) return new HoyoError('HoYoLabアカウントのログインが制限されています。HoYoLab側で状態を確認してください。', 'login');
  if (code === -3205) return new HoyoError('認証コードを確認してください。', 'login');
  if (code === -3206) return new HoyoError('認証コードの試行回数が多いため、時間を空けてから試してください。', 'login');
  if (code === -3102) return new HoyoError('画像認証をやり直してください。', 'login');
  return new HoyoError(`HoYoLabへの問い合わせが完了しませんでした（コード ${Number(code)}）。`);
}

async function request(url, { body, headers = {}, cookies } = {}) {
  let response, data;
  try {
    response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'bot_chan/1.0', ...headers,
        ...(cookies ? { Cookie: cookieHeader(cookies) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new HoyoError(`HoYoLabに接続できません（HTTP ${response.status}）。`);
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024) throw new HoyoError('HoYoLabの応答が大きすぎます。');
    data = JSON.parse(text);
  } catch (error) {
    if (error instanceof HoyoError) throw error;
    throw new HoyoError('HoYoLabへ接続できませんでした。少し待ってから試してください。');
  }
  if (!Number.isInteger(data?.retcode)) throw new HoyoError('HoYoLabの応答形式が変わっています。');
  return { data, headers: response.headers };
}

function successful(response) {
  if (response.data.retcode !== 0) throw apiError(response.data.retcode);
  if (!response.data.data || typeof response.data.data !== 'object') throw new HoyoError('HoYoLabの応答を確認できません。');
  return response.data.data;
}

function encryptCredentials(email, password) {
  const encrypt = value => crypto.publicEncrypt({ key: LOGIN_KEY, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(value)).toString('base64');
  return { account: encrypt(email), password: encrypt(password) };
}

function parseHeader(headers, name) {
  try { return JSON.parse(headers.get(name)); }
  catch { throw new HoyoError('HoYoLabの追加認証情報を確認できません。'); }
}

async function login(credentials, deviceId, { captcha, ticket } = {}) {
  const headers = { ...LOGIN_HEADERS, 'x-rpc-device_id': deviceId,
    'x-rpc-device_name': 'bot_chan', 'x-rpc-device_model': 'Discord link', ds: dynamicSecret(LOGIN_SALT, credentials) };
  if (captcha) headers['x-rpc-aigis'] = `${captcha.sessionId};${Buffer.from(JSON.stringify(captcha.result)).toString('base64')}`;
  if (ticket) headers['x-rpc-verify'] = JSON.stringify({ ...ticket,
    verify_str: typeof ticket.verify_str === 'string' ? ticket.verify_str : JSON.stringify(ticket.verify_str) });
  const response = await request(LOGIN_URL, { body: credentials, headers });
  if (response.data.retcode === -3101) {
    const challenge = parseHeader(response.headers, 'x-rpc-aigis');
    const data = typeof challenge.data === 'string' ? JSON.parse(challenge.data) : challenge.data;
    if (!challenge.session_id || !data?.gt) throw new HoyoError('画像認証の形式を確認できません。');
    return { step: 'captcha', challenge: { sessionId: challenge.session_id, gt: data.gt,
      challenge: data.challenge, version: data.use_v4 ? 4 : 3, riskType: data.risk_type, success: data.success, newCaptcha: data.new_captcha } };
  }
  if (response.data.retcode === -3239) {
    const ticket = parseHeader(response.headers, 'x-rpc-verify');
    const verify = typeof ticket.verify_str === 'string' ? JSON.parse(ticket.verify_str) : ticket.verify_str;
    if (!ticket.risk_ticket || !verify?.ticket) throw new HoyoError('メール認証の形式を確認できません。');
    return { step: 'email', ticket: { ...ticket, verify_str: verify } };
  }
  const data = successful(response);
  const aid = data.user_info?.aid, mid = data.user_info?.mid, stoken = data.token?.token;
  if (!aid || !mid || !stoken) throw new HoyoError('ログイン結果を確認できません。');
  const temporary = { stoken: String(stoken), ltuid_v2: String(aid), ltmid_v2: String(mid), account_id_v2: String(aid), account_mid_v2: String(mid) };
  const tokens = successful(await request(TOKEN_URL, { body: { dst_token_types: [2, 4] },
    headers: { 'x-rpc-app_id': LOGIN_HEADERS['x-rpc-app_id'], ds: dynamicSecret(LOGIN_SALT) }, cookies: { ...temporary, mid: String(mid) } }));
  const cookieToken = tokens.tokens?.find(token => token.token_type === 4)?.token;
  const ltoken = tokens.tokens?.find(token => token.token_type === 2)?.token;
  if (!cookieToken || !ltoken) throw new HoyoError('戦績取得用の認証情報を取得できません。');
  return { step: 'success', cookies: { ltuid_v2: String(aid), ltmid_v2: String(mid), account_id_v2: String(aid), account_mid_v2: String(mid),
    cookie_token_v2: String(cookieToken), ltoken_v2: String(ltoken) } };
}

async function verifyEmail(code, ticket) {
  return successful(await request(VERIFY_URL, { body: { action_type: 'verify_for_component', action_ticket: ticket.verify_str.ticket,
    email_captcha: code, verify_method: 2 }, headers: { 'x-rpc-app_id': LOGIN_HEADERS['x-rpc-app_id'], 'x-rpc-client_type': '2' } }));
}

const recordHeaders = () => ({ 'x-rpc-app_version': '1.5.0', 'x-rpc-client_type': '5',
  'x-rpc-language': 'ja-jp', 'x-rpc-lang': 'ja-jp', ds: dynamicSecret(RECORD_SALT), Referer: 'https://act.hoyolab.com/' });

async function account(cookies, uid) {
  const data = successful(await request(ROLES_URL, { cookies, headers: recordHeaders() }));
  if (!Array.isArray(data.list)) throw new HoyoError('ゲームアカウントの応答形式が変わっています。');
  const role = data.list.find(item => String(item.game_uid) === String(uid) && item.game_biz === 'hk4e_global');
  if (!role || !['os_asia', 'os_usa', 'os_euro', 'os_cht'].includes(role.region)) throw new HoyoError('登録済みUIDが、このHoYoLabアカウントに紐づいていません。ログインするアカウントを確認してください。', 'account');
  return { uid: String(role.game_uid), server: role.region };
}

function normalizeCharacters(data) {
  if (!Array.isArray(data?.list)) throw new HoyoError('キャラ一覧の応答形式が変わっています。');
  const ids = new Set();
  return data.list.map(item => {
    const id = String(item.id), level = item.level, constellation = item.actived_constellation_num;
    if (!/^\d+$/.test(id) || ids.has(id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || !Number.isInteger(level) || level < 1 || !Number.isInteger(constellation) || constellation < 0 || constellation > 6) throw new HoyoError('キャラ一覧に未対応の形式が含まれています。');
    ids.add(id);
    return { id, name: item.name.trim(), level, constellation };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

async function characters(cookies, role) {
  const data = successful(await request(CHARACTERS_URL, { body: { role_id: role.uid, server: role.server }, cookies, headers: recordHeaders() }));
  return normalizeCharacters(data);
}

module.exports = { HoyoError, encryptCredentials, login, verifyEmail, account, characters, normalizeCharacters };
