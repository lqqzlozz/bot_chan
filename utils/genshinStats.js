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
function view(session) {
  const info = TYPES[session.type];
  const data = snapshot();
  const rows = Array.isArray(data[info.key]) ? data[info.key].filter(x => x && typeof x.name === 'string' && Number.isFinite(x.rate) && x.rate >= 0 && x.rate <= 100) : [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  session.page = Math.min(session.page, pages - 1);
  const start = session.page * PAGE_SIZE;
  const text = rows.length
    ? rows.slice(start, start + PAGE_SIZE).map((item, i) => `${start + i + 1}. ${item.name.replace(/[@\r\n]/g, ' ')} — ${item.rate.toFixed(1)}%`).join('\n')
    : '統計データを準備中です。取得元の検証が完了するまで、未確認の数値は表示しません。';
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
  const message = await i.reply({...view(session), fetchReply: true});
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
  await i.update(view(session));
  return true;
}
module.exports = { execute, handleButton, TYPES };
