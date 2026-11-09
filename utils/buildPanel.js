const i18n = require('./buildLocale');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { randomBytes } = require('crypto');
const st = require('./store');
const en = require('./enka');
const art = require('./artifact');
const { isGI } = require('./gi');
const sessions = new Map();
const locks = new Set();
const TTL = 5 * 60 * 1000;
const DELETE_PREFIX = 'bc_delete_';
const deleteControl = user => row(button(`${DELETE_PREFIX}${user}`, '🗑️', ButtonStyle.Danger));
const finishedControls = s => s.embed && s.score && !s.list.find(a => String(a.avatarId) === s.aid)?.lim ? [links(s.uid)] : [];
const enkaError = err => {
  if (err === 429) return '【E003】Enka.Networkへのアクセスが集中しています。時間をおいて再度お試しください。';
  if ([500, 502, 503, 504].includes(err)) return '【E002】Enka.Networkがメンテナンス中、または一時的に利用できません。時間をおいて再度お試しください。';
  if (err === 404 || err === 400) return '【E004】UIDまたはプロフィール情報を確認できません。UIDと公開設定をご確認ください。';
  if (err === 0 || err === 5030) return '【E001】Enka.Networkに接続できません。通信状態を確認し、時間をおいて再度お試しください。';
  return '【E999】予期しないエラーが発生しました。時間をおいて再度お試しください。';
};
async function finishSession(s) {
  if (s.busy || s.finished || !s.messageId) return;
  s.finished = true;
  try {
    const ch = await s.client.channels.fetch(s.channel);
    const msg = await ch.messages.fetch(s.messageId);
    await msg.edit({ components: finishedControls(s) });
  } catch (e) { console.error('ビルドカード自動終了に失敗:', e.message); }
  sessions.delete(s.id);
}

const box = t => new EmbedBuilder().setColor('#8A8A8A').setDescription(t);
const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const row = (...items) => new ActionRowBuilder().addComponents(...items);
const author = s => ({ name: `${s.name}${i18n.t(s.locale,'card')}`, iconURL: s.avatar });
const localizedFormula = (formula, locale) => {
  if (i18n.language(locale) === 'ja') return formula;
  const terms = {
    '元素チャージ効率': 'er', '会心ダメージ': 'cd', '会心率': 'cr',
    '元素熟知': 'em', '攻撃力実数': 'atk', '防御力実数': 'def',
    'HP実数': 'hp', '攻撃力': 'atk', '防御力': 'def',
  };
  return Object.entries(terms).reduce((text, [ja, key]) =>
    text.split(ja).join(i18n.t(locale, key)), formula);
};
const owner = s => `<@${s.user}> ${i18n.t(s.locale,'owned')}`;

function panel(locale = 'ja') {
  const t = k => i18n.t(locale,k);
  return { embeds: [box(`## ${t('create')}\n${t('intro')}\n${t('how')}`)], components: [row(button('bc_open_score', t('on'), ButtonStyle.Primary), button('bc_open_plain', t('off')))] };
}

// チャンネルごとに1枚。再投稿中の重複を防ぎ、生成カードの後にも移動する。
async function place(ch, create = false) {
  const d = st.get(ch.guildId);
  const panels = d.buildPanels ||= {};
  if ((!create && !panels[ch.id]) || locks.has(ch.id)) return;
  locks.add(ch.id);
  try {
    const old = panels[ch.id];
    const m = await ch.send({ ...panel(), flags: MessageFlags.SuppressNotifications, allowedMentions: { parse: [] } });
    panels[ch.id] = m.id;
    if (old) await ch.messages.delete(old).catch(() => null);
    st.saveLater(ch.guild, 3000);
  } finally { locks.delete(ch.id); }
}

async function start(i) {
  if (!isGI(i.guildId)) return i.reply({ content: i18n.t(i.locale,'notAllowed'), ephemeral: true });
  await i.deferReply();
  await place(i.channel, true);
  const saved = await st.save(i.guild);
  if (!saved) return i.editReply('⚠️ '+i18n.t(i.locale,'notSaved'));
  return i.deleteReply();
}

function controls(s) {
  const t = k => i18n.t(s.locale,k);
  const menu = new StringSelectMenuBuilder().setCustomId(`bc_char_${s.id}`).setPlaceholder(t('select')).addOptions(s.list.slice(0, 25).map(a => ({ label: en.name(a.avatarId, i18n.language(s.locale)) || s.names[a.avatarId] || `${t('unknown')} ${a.avatarId}`, value: String(a.avatarId), default: String(a.avatarId) === s.aid })));
  const rows = [row(menu)];
  if (s.score) rows.push(row(new StringSelectMenuBuilder().setCustomId(`bc_base_${s.id}`).setPlaceholder(t('criterion')).addOptions(Object.entries(art.BASES).map(([value, b]) => ({ label: i18n.basis(s.locale,value), value, default: value === s.base })))));
  rows.push(row(button(`bc_on_${s.id}`, t('scoreOn'), s.score ? ButtonStyle.Primary : ButtonStyle.Secondary), button(`bc_off_${s.id}`, t('scoreOff'), s.score ? ButtonStyle.Secondary : ButtonStyle.Primary), button(`bc_end_${s.id}`, t('finish'))));
  rows.push(deleteControl(s.user));
  if (s.score && s.aid && !s.list.find(a => String(a.avatarId) === s.aid)?.lim) rows.push(links(s.uid));
  return rows;
}

function links(uid) {
  return row(new ButtonBuilder().setLabel('Enka').setStyle(ButtonStyle.Link).setURL(`https://enka.network/u/${uid}/`), new ButtonBuilder().setLabel('Akasha').setStyle(ButtonStyle.Link).setURL(`https://akasha.cv/profile/${uid}`));
}

async function refresh(i, s) {
  const a = s.list.find(a => String(a.avatarId) === s.aid);
  if (!a || (s.score && !s.base)) {
    s.buf = null;
    s.embed = null;
    return i.editReply({ content: owner(s), allowedMentions: { parse: [] }, embeds: [box(['choose','chooseBase','hidden'].map(k=>i18n.t(s.locale,k)).join('\n')).setAuthor(author(s))], attachments: [], components: controls(s) });
  }
  const d = await require('./character').build(a, s.uid, s.base, s.score, s.locale);
  s.buf = await require('./charCard').charCard(d, s.locale);
  s.caption = `## ${d.name}${i18n.t(s.locale,'card')}\n${s.score && !a.lim ? `${i18n.t(s.locale,'basis')}：${i18n.basis(s.locale,s.base)}\n\`${localizedFormula(art.FORMULAS[s.base],s.locale)}\`\n${i18n.t(s.locale,'sub')}` : i18n.t(s.locale,'disabled')}${a.lim ? '\n'+i18n.t(s.locale,'limited') : ''}`;
  s.embed = box(s.caption).setAuthor(author(s)).setImage('attachment://build-card.png');
  return i.editReply({ content: owner(s), allowedMentions: { parse: [] }, embeds: [s.embed], attachments: [], files: [new AttachmentBuilder(s.buf, { name: 'build-card.png' })], components: controls(s) });
}

async function handle(i) {
  if (!isGI(i.guildId)) return i.reply({ content: i18n.t(i.locale,'notAllowed'), ephemeral: true });
  // 放置した画面の画像バッファは解放する。
  for (const s of sessions.values()) if (Date.now() - s.at >= TTL) void finishSession(s);
  if (i.customId.startsWith('bc_open_')) {
    const uid = st.get(i.guildId).intro?.[i.user.id]?.uid;
    if (!uid) return i.reply({ content: i18n.t(i.locale,'noUid'), ephemeral: true });
    await i.deferReply();
    let result;
    try { result = await en.player(uid); }
    catch (e) { console.error('Enka API error:', e); return i.editReply('⚠️ '+enkaError(0)); }
    const { p, raw, err } = result;
    if (!p) return i.editReply('⚠️ '+enkaError(err));
    const list = raw?.length ? raw : (p.showAvatarInfoList || []).map(a => ({ ...a, lim: true }));
    if (!list.length) return i.editReply('⚠️ 【E005】キャラクター情報を取得できません。ゲーム内プロフィールでキャラクターを公開しているかご確認ください。');
    for (const [id, old] of sessions) if (old.user === i.user.id && old.channel === i.channelId) sessions.delete(id);
    const s = { id: randomBytes(8).toString('hex'), user: i.user.id, name: i.member?.displayName || i.user.globalName || i.user.username, avatar: i.user.displayAvatarURL(), channel: i.channelId, guild: i.guildId, uid, list, names: await en.names(), score: i.customId.endsWith('score'), locale: i.locale || 'ja', base: 'atk', aid: null, at: Date.now() };
    sessions.set(s.id, s);
    s.client = i.client;
    await refresh(i, s);
    s.messageId = (await i.fetchReply()).id;
    return place(i.channel);
  }
  if (i.customId.startsWith(DELETE_PREFIX)) {
    if (i.user.id !== i.customId.slice(DELETE_PREFIX.length)) return i.reply({ content: i18n.t(i.locale,'onlyOwner'), ephemeral: true });
    for (const [id, s] of sessions) if (s.messageId === i.message.id) sessions.delete(id);
    return i.message.delete().catch(() => i.reply({ content: 'メッセージを削除できませんでした。BOTの権限をご確認ください。', ephemeral: true }));
  }
  const [, action, id] = i.customId.split('_');
  const s = sessions.get(id);
  if (s && s.user !== i.user.id) return i.reply({ content: i18n.t(i.locale,'onlyOwner'), ephemeral: true });
  if (!s || s.guild !== i.guildId || s.channel !== i.channelId) return i.reply({ content: i18n.t(i.locale,'expired'), ephemeral: true });
  if (s.busy) return i.deferUpdate();
  s.busy = true;
  try {
    await i.deferUpdate();
    s.at = Date.now();
    if (action === 'end') { sessions.delete(id); return i.editReply({ components: finishedControls(s), ...(s.embed ? { embeds: [s.embed] } : {}) }); }
    if (action === 'char' && s.list.some(a => String(a.avatarId) === i.values[0])) s.aid = i.values[0];
    if (action === 'base' && art.BASES[i.values[0]]) s.base = i.values[0];
    if (action === 'toggle') s.score = !s.score;
    if (action === 'on') s.score = true;
    if (action === 'off') s.score = false;
    return await refresh(i, s);
  } finally { s.busy = false; }
}

const cleanup = setInterval(() => { for (const s of sessions.values()) if (Date.now() - s.at >= TTL) void finishSession(s); }, 15000);
cleanup.unref();
module.exports = { start, handle, place, panel };
