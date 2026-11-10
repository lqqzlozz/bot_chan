const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const st = require('./store');
const en = require('./enka');
const { profileHeader } = require('./charRow');
const { characterEmoji, statEmoji } = require('./introEmoji');

const COLOR = '#1D9E75';
const CARD_VERSION = 1;
const busy = new Map();

// 案内（ボタン付き）
function panel(roleId = null) {
  const e = new EmbedBuilder()
    .setColor(COLOR)
    .setDescription('加入された方は、UIDのご提示をお願いします！\nご提示が済んだらすべてのチャンネルの閲覧が可能になります✨️');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`intro_open_${roleId || 'none'}`).setLabel('ギルドにUIDを登録する').setStyle(ButtonStyle.Success)
  );
  return { embeds: [e], components: [row] };
}

// 案内を置く（前のは消す）
async function place(ch, roleId = null) {
  const d = st.get(ch.guildId);
  if (d.introP?.msg) await ch.messages.delete(d.introP.msg).catch(() => null);
  const m = await ch.send({ ...panel(roleId), flags: MessageFlags.SuppressNotifications });
  d.introP = { ch: ch.id, msg: m.id, role: roleId };
  st.saveLater(ch.guild, 3000);
}

// 案内を一番下に戻す（連打防止つき）
async function bump(ch) {
  const p = st.get(ch.guildId).introP;
  if (!p || p.ch !== ch.id || busy.get(ch.id)) return;
  busy.set(ch.id, true);
  try {
    await place(ch, p.role);
  } finally {
    busy.set(ch.id, false);
  }
}

// ボタン → フォーム
async function open(i) {
  const roleId = i.customId.slice(11);
  const m = new ModalBuilder().setCustomId(`intro_mdl_${roleId}`).setTitle('自己紹介');
  const input = new TextInputBuilder().setCustomId('uid').setLabel('UID')
    .setStyle(TextInputStyle.Short).setMinLength(9).setMaxLength(12).setRequired(true);
  const previousUid = st.get(i.guildId).intro?.[i.user.id]?.uid;
  if (previousUid && en.cleanUid(previousUid)) input.setValue(previousUid);
  m.addComponents(new ActionRowBuilder().addComponents(input));
  return i.showModal(m);
}

const errMsg = {
  400: 'UIDの形が正しくないみたい。もう一度確認してね。',
  404: 'そのUIDのプレイヤーが見つからなかったよ。もう一度確認してね。',
};
const oops = (i, t) => i.followUp({ content: t, ephemeral: true });

// フォーム送信 → カード投稿＋ロール（成功時は本人への返事なし）
async function submit(i) {
  await i.deferUpdate();
  const roleId = i.customId.slice(10);
  const uid = en.cleanUid(i.fields.getTextInputValue('uid'));
  if (!uid) return oops(i, errMsg[400]);

  const { p, err } = await en.player(uid).catch(() => ({ err: 503 }));
  // UIDの打ち間違いだけはやり直してもらう
  if (!p && (err === 400 || err === 404)) return oops(i, errMsg[err]);

  const card = await makeCard({ uid, p, displayName: i.member.displayName, avatarURL: i.user.displayAvatarURL(), emojis: i.client?.application?.emojis });

  // 前のカードがあれば差し替え
  const d = st.get(i.guildId);
  if (!d.intro) d.intro = {};
  const old = d.intro[i.user.id];
  if (old) {
    const ch = await i.client.channels.fetch(old.ch).catch(() => null);
    if (ch) await ch.messages.delete(old.msg).catch(() => null);
  }
  const m = await i.channel.send(card);
  d.intro[i.user.id] = { ch: i.channelId, msg: m.id, uid, pending: !p && retryable(err), cardVersion: CARD_VERSION };
  st.saveLater(i.guild, 3000);

  // A role is optional: UID registration must succeed without any role assignment.
  const role = roleId && roleId !== 'none' ? await i.guild.roles.fetch(roleId).catch(() => null) : null;
  const ok = role ? await i.member.roles.add(role).then(() => true).catch(() => false) : true;
  if (!ok) await oops(i, 'ロールが付けられなかったので、管理者に連絡してね。');

  await bump(i.channel);
}


// UID card: artwork only in images, all useful data as copyable Components V2 text.
const safe = value => String(value ?? '').replace(/@/g, '＠').replace(/[\r\n]/g, ' ').replace(/([\\\x60*_~|>\[\]()])/g, '\\$1');
function showcaseStats(a, detail) {
  return 'Lv.' + (a.level ?? '?') + ' │ ' + (detail ? 'C' + (detail.talentIdList || []).length : '凸数 非公開');
}

const showcaseName = a => en.name(a.avatarId) || 'キャラクター ' + a.avatarId;
const emojiText = emoji => emoji ? '<:' + emoji.name + ':' + emoji.id + '>' : '';

async function showcaseLine(showcased, emojis) {
  const items = await Promise.all(showcased.slice(0, 12).map(async avatar => {
    const url = en.charIcon(avatar) || en.charSideIcon(avatar);
    const emoji = await characterEmoji(emojis, url);
    return emojiText(emoji) || safe(showcaseName(avatar));
  }));
  return items.join(' ');
}

// Older posted cards still have a character menu.
async function showCharacter(i) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const uid = i.customId.slice('intro_char_'.length);
    const { p, raw } = await en.player(uid);
    const id = i.values[0];
    const a = p?.showAvatarInfoList?.find(avatar => String(avatar.avatarId) === id);
    if (!a) return i.editReply({ content: 'キャラクターを取得できませんでした。展示設定をご確認のうえ、もう一度お試しください。' });
    await en.names();
    const detail = raw?.find(avatar => String(avatar.avatarId) === id);
    const name = showcaseName(a);
    const portrait = en.charIcon(a) || en.charSideIcon(a);
    const equips = detail?.equipList || [];
    const weapon = equips.find(e => e.weapon);
    const equipment = weapon ? [{
      label: '武器 ' + (en.loc(weapon.flat?.nameTextMapHash) || '名称不明'),
      url: en.uiPath(weapon.flat?.icon)
    }] : [];
    const sets = new Map();
    for (const e of equips) {
      if (!e.reliquary) continue;
      const set = en.relicSet(e);
      const entry = sets.get(set.id) || { name: set.name, count: 0 };
      entry.count++;
      entry.url ||= en.uiPath(e.flat?.icon);
      sets.set(set.id, entry);
    }
    for (const set of sets.values()) {
      if (set.count >= 2) equipment.push({ label: set.name + ' ×' + set.count, url: set.url });
    }
    const equipmentText = equipment.length ? '\n-# ' + equipment.map(item => safe(item.label)).join(' │ ') : '';
    const text = new TextDisplayBuilder().setContent('### ' + safe(name) + '\n' + showcaseStats(a, detail) + equipmentText);
    const container = new ContainerBuilder().setAccentColor(0x1D9E75);
    if (portrait) {
      container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(text)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(portrait).setDescription(name)));
    } else {
      container.addTextDisplayComponents(text);
    }
    const images = equipment.filter(item => item.url);
    if (images.length) {
      container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(...images.map(item =>
        new MediaGalleryItemBuilder().setURL(item.url).setDescription(item.label)
      )));
    }
    return await i.editReply({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('キャラクター展示エラー:', error.message);
    return i.editReply({ content: 'キャラクターを表示できませんでした。もう一度お試しください。' });
  }
}

async function makeCard({ uid, p, displayName, avatarURL, emojis }) {
  const container = new ContainerBuilder().setAccentColor(0x1D9E75);
  const files = [];
  const uidBlock = '**UID**\n```\n' + uid + '\n```';
  if (p) {
    await en.names();
    const icon = en.pfpIcon(p.profilePicture) || avatarURL;
    const [header, showcase, statIcons] = await Promise.all([
      profileHeader(en.namecardImages(p.nameCardId), icon).catch(() => null),
      showcaseLine(p.showAvatarInfoList || [], emojis),
      Promise.all(['adventure', 'world', 'achievement'].map(stat => statEmoji(emojis, stat)))
    ]);
    const stats = [
      '冒険ランク ' + (p.level ?? '—'),
      '世界ランク ' + (p.worldLevel ?? '—'),
      'アチーブメント ' + (p.finishAchievementNum ?? '—')
    ].map((label, index) => statIcons[index] ? emojiText(statIcons[index]) + ' ' + label : label).join('　│　');
    if (header) {
      files.push(new AttachmentBuilder(header, { name: 'uid-header.png' }));
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://uid-header.png'))
      );
    }
    const nickname = safe(p.nickname?.trim() || displayName).slice(0, 80);
    const signature = p.signature?.trim() ? '\n' + safe(p.signature.trim()).slice(0, 250) : '';
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## ' + nickname + signature + '\n' +
      uidBlock + '\n' +
      '-# ' + stats
    ));
    if (showcase) {
      // A heading gives inline icons more room without adding a gallery.
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('# ' + showcase));
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
    }
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## ' + safe(displayName).slice(0, 80) + '\n' + uidBlock + '\n-# プロフィールを取得できませんでした。後ほど再取得します。'
    ));
  }
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Enka').setStyle(ButtonStyle.Link).setURL('https://enka.network/u/' + uid + '/'),
    new ButtonBuilder().setLabel('Akasha').setStyle(ButtonStyle.Link).setURL('https://akasha.cv/profile/' + uid)
  ));
  return { components: [container], files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

// Upgrade each saved card once and retry temporary failures on the existing timer.
const retryable = err => err !== 400 && err !== 404;
const permanentDiscordErrors = new Set([10003, 10008, 50001, 50005, 50013]);
let retryBusy = false;
async function retryPending(client) {
  if (retryBusy) return;
  retryBusy = true;
  const migration = { updated: 0, skipped: 0, retry: 0 };
  try {
    for (const guild of client.guilds.cache.values()) {
      const d = st.get(guild.id);
      for (const [userId, entry] of Object.entries(d.intro || {})) {
        if (!entry.uid || !entry.msg || !entry.ch) continue;
        const upgrade = entry.cardVersion !== CARD_VERSION && entry.cardSkippedVersion !== CARD_VERSION;
        if (!upgrade && !entry.pending) continue;
        if (entry.retryAfter && Date.now() < entry.retryAfter) continue;
        const result = await en.player(entry.uid).catch(() => ({ err: 503 }));
        if (!result.p) {
          if (!retryable(result.err)) {
            entry.pending = false;
            if (upgrade) {
              entry.cardSkippedVersion = CARD_VERSION;
              migration.skipped++;
              console.warn('UIDカード一括更新対象外:', entry.msg, 'Enka', result.err);
            }
          } else {
            entry.retryAfter = Date.now() + 10 * 60 * 1000;
            if (upgrade) migration.retry++;
          }
          st.saveLater(guild);
          continue;
        }
        try {
          const ch = await guild.channels.fetch(entry.ch);
          const msg = await ch.messages.fetch(entry.msg);
          if (msg.author.id !== client.user.id) {
            entry.pending = false;
            if (upgrade) {
              entry.cardSkippedVersion = CARD_VERSION;
              migration.skipped++;
              console.warn('UIDカード一括更新対象外:', entry.msg, '別の投稿者');
            }
            st.saveLater(guild);
            continue;
          }
          const member = await guild.members.fetch(userId).catch(() => null);
          const card = await makeCard({ uid: entry.uid, ...result, displayName: member?.displayName || msg.mentions.users.first()?.username || 'ユーザー', avatarURL: member?.user.displayAvatarURL() || client.user.displayAvatarURL(), emojis: client.application?.emojis });
          if (d.intro[userId] !== entry) continue;
          // Clear legacy fields when enabling Components V2 on an existing message.
          const legacy = msg.flags.has(MessageFlags.IsComponentsV2) ? {} : { content: null, embeds: [] };
          await msg.edit({ ...card, ...legacy, flags: msg.flags.bitfield | card.flags, attachments: [] });
          entry.pending = false;
          entry.cardVersion = CARD_VERSION;
          delete entry.cardSkippedVersion;
          delete entry.retryAfter;
          if (upgrade) migration.updated++;
          st.saveLater(guild);
        } catch (error) {
          if (permanentDiscordErrors.has(error.code)) {
            entry.pending = false;
            if (upgrade) {
              entry.cardSkippedVersion = CARD_VERSION;
              migration.skipped++;
            }
          } else {
            entry.retryAfter = Date.now() + 10 * 60 * 1000;
            if (upgrade) migration.retry++;
          }
          st.saveLater(guild);
          console.error('自己紹介再取得失敗:', guild.id, userId, error.message);
        }
      }
    }
  } finally {
    retryBusy = false;
    if (migration.updated || migration.skipped || migration.retry) {
      console.log('UIDカード一括更新:', JSON.stringify(migration));
    }
  }
}

module.exports = { panel, place, bump, open, submit, showCharacter, retryPending };
