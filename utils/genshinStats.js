const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { isGI } = require('./gi');
const enka = require('./enka');
const { characterEmoji } = require('./introEmoji');
const fs = require('fs');
const path = require('path');

const TYPES = {
  pull: { title: 'キャラクター所持率', key: 'ownership' },
  usage: { title: '螺旋におけるキャラクター使用率', key: 'usage' },
  team: { title: '螺旋における人気パーティー', key: 'teams' }
};
const PAGE_SIZE = 12;
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const FOUR_STAR = new Set(['Fischl','Bennett','Candace','Rosaria','Yanfei','Layla']);
const isFiveStar = row => row.rarity === 5 || (row.rarity == null && !FOUR_STAR.has(row.name));
const catalog = new Map();
async function loadCatalog() {
  await enka.names();
  if (catalog.size) return;
  for (let id=10000001; id<=10000250; id++) {
    const c=enka.char(id), name=enka.name(id);
    if (!c || !name) continue;
    const rarity = c.QualityType === 'QUALITY_ORANGE' || Number(c.Rarity)===5 ? 5 :
      c.QualityType === 'QUALITY_PURPLE' || Number(c.Rarity)===4 ? 4 : null;
    catalog.set(name.toLowerCase(), {id,name,rarity});
  }
}
function info(row) {
  const c=catalog.get(row.name.toLowerCase());
  return {id:row.avatarId || c?.id || ICON_IDS[row.name], name:c?.name || DISPLAY_NAMES[row.name] || row.name, rarity:row.rarity || c?.rarity || (FOUR_STAR.has(row.name)?4:null)};
}
function fiveStar(row) { const rarity=info(row).rarity; return rarity === 5 || rarity == null; }
async function gridImage(rows) {
  const w=800, cw=200, ch=160;
  const canvas=createCanvas(w,Math.max(180,Math.ceil(rows.length/4)*ch));
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#20242c';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.textAlign='center';
  for(let n=0;n<rows.length;n++){
    const x=n%4*cw,y=Math.floor(n/4)*ch, c=info(rows[n]);
    ctx.fillStyle='#303746';ctx.fillRect(x+5,y+5,cw-10,ch-10);
    const url=c.id?enka.charIcon({avatarId:c.id}):null;
    if(url) try {
      const img=await loadImage(url), scale=Math.min(100/img.width,100/img.height);
      ctx.drawImage(img,x+(cw-img.width*scale)/2,y+5,img.width*scale,img.height*scale);
    }catch(error){console.warn('統計アイコン取得失敗:',error.message);}
    ctx.fillStyle='#ffffff';ctx.font='bold 22px sans-serif';ctx.fillText(rows[n].rate.toFixed(1)+'%',x+cw/2,y+121);
    ctx.font='15px sans-serif';ctx.fillText(c.name.slice(0,13),x+cw/2,y+145);
  }
  return new AttachmentBuilder(canvas.toBuffer('image/png'),{name:'genshin-stats.png'});
}
const ICON_IDS = { Fischl: 10000031, Bennett: 10000032, Candace: 10000072, Rosaria: 10000045, Yanfei: 10000048, Layla: 10000074 };
const DISPLAY_NAMES = { Fischl:'フィッシュル', Bennett:'ベネット', Candace:'キャンディス', Rosaria:'ロサリア', Yanfei:'煙緋', Layla:'レイラ' };
async function prepareIcons(session, data, manager) {
  session.icons = {};
  if (!manager || session.type === 'team') return;
  await enka.names();
  const rows = Array.isArray(data[TYPES[session.type].key]) ? data[TYPES[session.type].key].filter(fiveStar) : [];
  await Promise.all(rows.slice(0, 30).map(async row => {
    const id = ICON_IDS[row.name];
    if (!id) return;
    const url = enka.charIcon({avatarId:id});
    const emoji = await characterEmoji(manager, url);
    if (emoji) session.icons[row.name] = `<:${emoji.name}:${emoji.id}>`;
  }));
}
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
async function view(session, data) {
  const info = TYPES[session.type];
  const rows = Array.isArray(data[info.key]) ? data[info.key].filter(x => x && typeof x.name === 'string' && Number.isFinite(x.rate) && x.rate >= 0 && x.rate <= 100 && (session.type === 'team' || fiveStar(x))) : [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  session.page = Math.min(session.page, pages - 1);
  const start = session.page * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  const safeName = item => (DISPLAY_NAMES[item.name] || item.name).replace(/[@\r\n]/g, ' ');
  const blocks = [];
  for (let offset = 0; offset < visible.length; offset += 4) {
    const group = visible.slice(offset, offset + 4);
    // Discord does not support four inline embed fields in a row.
    // Keep the four icons on one line and the corresponding rates immediately below.
    blocks.push(group.map(item => session.icons?.[item.name] || '▫️').join('　'));
    blocks.push(group.map(item => item.rate.toFixed(1) + '%').join('　'));
    blocks.push(group.map(item => safeName(item)).join(' / '));
  }
  const text = visible.length ? blocks.join('\n') :
    session.type === 'team' ? '人気編成データは未取得です。' :
    '表示できる★5キャラクターの統計データがありません。';
  const metadata = [session.type !== 'team' ? '★5キャラクターのみ' : null, data.partial ? '確認済みの一部キャラクターのみ（全体順位ではありません）' : null, data.source ? `出典：${data.source}` : null, data.period ? `集計期間：${data.period}` : null, data.updatedAt ? `更新：${data.updatedAt}` : null, Number.isInteger(data.sampleSize) ? `サンプル数：${data.sampleSize}` : null].filter(Boolean);
  const embed = new EmbedBuilder().setTitle(info.title + (data.partial && rows.length ? '（確認済み抜粋）' : '')).setDescription(text).setColor(0x5865F2)
    .setFooter({text: `${session.page + 1} / ${pages}ページ${metadata.length ? ' ｜ ' + metadata.join(' ｜ ') : ''}`});
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gstats_prev_${session.user}`).setLabel('前へ').setStyle(ButtonStyle.Secondary).setDisabled(session.page === 0),
    new ButtonBuilder().setCustomId(`gstats_next_${session.user}`).setLabel('次へ').setStyle(ButtonStyle.Secondary).setDisabled(session.page >= pages - 1)
  );
  let files = [];
  if (visible.length && session.type !== 'team') try { files = [await gridImage(visible)]; } catch (error) { console.error('統計カード描画失敗:', error.message); }
  if(files.length) embed.setImage('attachment://genshin-stats.png').setDescription(data.partial ? '確認済みの一部キャラクターのみを掲載しています。' : '★5キャラクターの統計');
  return { embeds: [embed], files, attachments: [], components: rows.length ? [buttons] : [], allowedMentions: {parse: []} };
}
async function execute(i, type) {
  if (!i.guildId || !isGI(i.guildId)) return i.reply({content: '原神機能がONのサーバーでのみ利用できます。', ephemeral: true});
  const session = {type, user: i.user.id, page: 0, created: Date.now()};
  await i.deferReply();
  await i.editReply({content: '⏳ 統計データを取得中です。しばらくお待ちください…'});
  await loadCatalog();
  const result = await loadResult();
  const data = result.data;
  session.data = data;
  await prepareIcons(session, data, i.client?.application?.emojis);
  const message = await i.editReply({content: result.fresh ? null : `※ ${result.reason}${remoteCache && remoteCache === data ? ' 前回取得したデータを表示しています。' : ''}`, ...await view(session, data)});
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
  await i.update(await view(session, session.data || snapshot()));
  return true;
}
module.exports = { execute, handleButton, TYPES, valid, loadSnapshot };
