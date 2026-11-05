const crypto = require('crypto');
const { AttachmentBuilder } = require('discord.js');
const sessions = new Map();
const TTL = 10 * 60 * 1000;
function create(userId, channelId, guildId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId, channelId, guildId, expires: Date.now() + TTL, busy: false });
  return token;
}
function check(token) {
  const s = sessions.get(token);
  if (!s || s.expires < Date.now()) { sessions.delete(token); return null; }
  return s;
}
async function handle(req, res, client) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const session = token && check(token);
  if (!session) return respond(res, 403, 'リンクの有効期限が切れています。Discordで /spec を再実行してください。');
  if (req.method !== 'POST') return respond(res, 405, 'Method not allowed');
  if (session.busy) return respond(res, 409, '投稿処理中です。');
  const origin = req.headers.origin;
  const publicUrl = process.env.SPEC_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (!origin || !publicUrl || origin !== new URL(publicUrl).origin) return respond(res, 403, 'Origin mismatch');
  const size = Number(req.headers['content-length']);
  if (!Number.isFinite(size) || size < 100 || size > 4 * 1024 * 1024) return respond(res, 413, '画像サイズが不正です。');
  session.busy = true;
  try {
    const chunks = []; let total = 0;
    for await (const chunk of req) { total += chunk.length; if (total > 4 * 1024 * 1024) throw Error('too large'); chunks.push(chunk); }
    const data = Buffer.concat(chunks);
    if (data.length < 100 || !data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return respond(res, 400, 'PNG画像のみ投稿できます。');
    const channel = await client.channels.fetch(session.channelId);
    if (!channel || channel.guildId !== session.guildId || !channel.isTextBased() || !channel.send) return respond(res, 400, '投稿先が利用できません。');
    await channel.send({ content: '<@' + session.userId + '> の端末診断結果', files: [new AttachmentBuilder(data, {name:'device-spec.png'})], allowedMentions: {parse:[]} });
    sessions.delete(token);
    return respond(res, 200, 'Discordに投稿しました。');
  } catch (e) { console.error('SPEC投稿失敗:',e); return respond(res, 500, '投稿に失敗しました。BOTの権限を確認してください。'); }
  finally { session.busy = false; }
}
function respond(res, status, message) { res.writeHead(status, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}); res.end(message); }
module.exports = { create, handle };
