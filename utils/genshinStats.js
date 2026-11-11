const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { isGI } = require('./gi');
const fs = require('fs');
const path = require('path');

const TYPES = {
  pull: { title: 'キャラクター所持率', key: 'ownership' },
  usage: { title: '螺旋におけるキャラクター使用率', key: 'usage' },
  team: { title: '螺旋における人気パーティー', key: 'teams' }
};
const PAGE_SIZE = 10;
const sessions = new Map();
const TTL = 15 * 60 * 1000;

// Local snapshot adapter. Never fabricate statistics when no verified dataset is present.
function snapshot() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'genshinStats.json'), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    console.error('原神統計データ読込エラー:', error.message);
    return {};
  }
}
let remoteCache = null;
let inflight = null;
function valid(data) {
  return data && typeof data === 'object' && ['ownership', 'usage', 'teams'].every(key =>
    Array.isArray(data[key]) && data[key].every(row =>
      row && typeof row.name === 'string' && row.name.length <= 150 &&
      typeof row.rate === 'number' && Number.isFinite(row.rate) && row.rate >= 0 && row.rate <= 100));
}
async function loadResult() {
  const url = process.env.GENSHIN_STATS_JSON_URL;
  if (!url) return {data: snapshot(), fresh: false, reason: '統計データの取得先が未設定です。'};
  if (!inflight) inflight = (async () => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') throw new Error('HTTPS URL required');
      const response = await fetch(parsed, {signal: AbortSignal.timeout(60000), headers:{Accept:'application/json'}});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.text();
      if (body.length > 1024 * 1024) throw new Error('JSON too large');
      const data = JSON.parse(body);
      if (!valid(data)) throw new Error('Invalid stats schema');
      remoteCache = data;
      return {data, fresh: true, reason: null};
    } catch (error) {
      console.error('原神統計フィード取得失敗:', error.message);
      return {data: remoteCache || snapshot(), fresh: false, reason: '統計データの取得に失敗しました。'};
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
async function loadSnapshot() {
  return (await loadResult()).data;
}
function view(session, data) {
  const info = TYPES[session.type];
  const rows = Array.isArray(data[info.key]) ? data[info.key].filter(x => x && typeof x.name === 'string' && Number.isFinite(x.rate) && x.rate >= 0 && x.rate <= 100) : [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  session.page = Math.min(session.page, pages - 1);
  const start = session.page * PAGE_SIZE;
  const text = rows.length
    ? rows.slice(start, start + PAGE_SIZE).map((item, i) => `${start + i + 1}. ${item.name.replace(/[@\r\n]/g, ' ')} — ${item.rate.toFixed(1)}%`).join('\n')
    : '表示できる統計データがありません。LaQoosの取得方法を検証中です。';
  const metadata = [data.period ? `集計期間：${data.period}` : null, data.updatedAt ? `更新：${data.updatedAt}` : null, Number.isInteger(data.sampleSize) ? `サンプル数：${data.sampleSize}` : null].filter(Boolean);
  const embed = new EmbedBuilder().setTitle(info.title).setDescription(text).setColor(0x5865F2)
    .setFooter({text: `${session.page + 1} / ${pages}ページ${metadata.length ? ' ｜ ' + metadata.join(' ｜ ') : ''}`});
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gstats_prev_${session.user}`).setLabel('前へ').setStyle(ButtonStyle.Secondary).setDisabled(session.page === 0),
    new ButtonBuilder().setCustomId(`gstats_next_${session.user}`).setLabel('次へ').setStyle(ButtonStyle.Secondary).setDisabled(session.page >= pages - 1)
  );
  return { embeds: [embed], components: rows.length ? [buttons] : [], allowedMentions: {parse: []} };
}
async function execute(i, type) {
  if (!i.guildId || !isGI(i.guildId)) return i.reply({content: '原神機能がONのサーバーでのみ利用できます。', ephemeral: true});
  const session = {type, user: i.user.id, page: 0, created: Date.now()};
  await i.deferReply();
  await i.editReply({content: '⏳ 統計データを取得中です。しばらくお待ちください…'});
  const result = await loadResult();
  const data = result.data;
  session.data = data;
  const message = await i.editReply({content: result.fresh ? null : `※ ${result.reason}${remoteCache && remoteCache === data ? ' 前回取得したデータを表示しています。' : ''}`, ...view(session, data)});
  sessions.set(message.id, session);
  for (const [id, value] of sessions) if (Date.now() - value.created > TTL) sessions.delete(id);
}
async function handleButton(i) {
  if (!i.customId?.startsWith('gstats_')) return false;
  if (!i.guildId || !isGI(i.guildId)) return i.reply({content:'このサーバーでは原神機能がOFFです。', ephemeral:true});
  const session = sessions.get(i.message.id);
  if (!session || Date.now() - session.created > TTL) {
    sessions.delete(i.message.id);
    return i.reply({content:'操作期限が切れました。コマンドを再実行してください。', ephemeral:true});
  }
  if (session.user !== i.user.id) return i.reply({content:'操作できるのはコマンドの実行者のみです。', ephemeral:true});
  session.page = Math.max(0, session.page + (i.customId.startsWith('gstats_next_') ? 1 : -1));
  await i.update(view(session, session.data || snapshot()));
  return true;
}
module.exports = { execute, handleButton, TYPES, valid, loadSnapshot };
