const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const st = require('./store');
const en = require('./enka');
const { profileHeader, characterIconStrip } = require('./charRow');

const COLOR = '#1D9E75';
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

  const { p, raw, err } = await en.player(uid).catch(() => ({ err: 503 }));
  // UIDの打ち間違いだけはやり直してもらう
  if (!p && (err === 400 || err === 404)) return oops(i, errMsg[err]);

  const card = await makeCard({ uid, p, raw, displayName: i.member.displayName, avatarURL: i.user.displayAvatarURL() });

  // 前のカードがあれば差し替え
  const d = st.get(i.guildId);
  if (!d.intro) d.intro = {};
  const old = d.intro[i.user.id];
  if (old) {
    const ch = await i.client.channels.fetch(old.ch).catch(() => null);
    if (ch) await ch.messages.delete(old.msg).catch(() => null);
  }
  const m = await i.channel.send(card);
  d.intro[i.user.id] = { ch: i.channelId, msg: m.id, uid, pending: !p && retryable(err) };
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

async function showcaseRows(showcased, raw) {
  const details = new Map((raw || []).map(a => [String(a.avatarId), a]));
  const entries = showcased.slice(0, 12).map(a => {
    const name = showcaseName(a);
    const detail = details.get(String(a.avatarId));
    const stats = detail ? ' Lv.' + (a.level ?? '?') + ' C' + (detail.talentIdList || []).length : '';
    return { name, stats, url: en.charIcon(a) || en.charSideIcon(a) };
  });
  const groups = [];
  for (let start = 0; start < entries.length; start += 4) {
    groups.push(entries.slice(start, start + 4));
  }
  return Promise.all(groups.map(async group => ({
    image: await characterIconStrip(group.map(entry => entry.url)).catch(() => null),
    caption: group.map(({ name, stats }) => safe(name) + stats).join('　│　'),
    names: group.map(entry => entry.name).join('、')
  })));
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

async function makeCard({ uid, p, raw, displayName, avatarURL }) {
  const container = new ContainerBuilder().setAccentColor(0x1D9E75);
  const files = [];
  const uidBlock = '**UID**\n```\n' + uid + '\n```';
  if (p) {
    await en.names();
    const icon = en.pfpIcon(p.profilePicture) || avatarURL;
    const [header, rows] = await Promise.all([
      profileHeader(en.namecardImages(p.nameCardId), icon).catch(() => null),
      showcaseRows(p.showAvatarInfoList || [], raw)
    ]);
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
      '-# 冒険ランク ' + (p.level ?? '—') + '　│　世界ランク ' + (p.worldLevel ?? '—') +
      '　│　アチーブメント ' + (p.finishAchievementNum ?? '—')
    ));
    if (rows.length) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### キャラクター展示'));
      for (const [index, row] of rows.entries()) {
        if (row.image) {
          const filename = 'uid-icons-' + (index + 1) + '.png';
          files.push(new AttachmentBuilder(row.image, { name: filename }));
          container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://' + filename).setDescription(row.names)
          ));
        }
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# ' + row.caption));
      }
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '**キャラクター展示**\n-# 非公開または未設定（ゲーム内のプロフィール公開設定をご確認ください）'
      ));
    }
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## ' + safe(displayName).slice(0, 80) + '\n' + uidBlock + '\n-# プロフィールを取得できませんでした。後ほど再取得します。'
    ));
  }
  // Link buttons belong to the same container; no extra message or duplicate UID footer.
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Enka').setStyle(ButtonStyle.Link).setURL('https://enka.network/u/' + uid + '/'),
    new ButtonBuilder().setLabel('Akasha').setStyle(ButtonStyle.Link).setURL('https://akasha.cv/profile/' + uid)
  ));
  return { components: [container], files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

// Retry only temporary Enka failures. Keep the pending UID in the saved server config.
const retryable = err => err !== 400 && err !== 404;
let retryBusy = false;
async function retryPending(client) {
  if (retryBusy) return;
  retryBusy = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      const d = st.get(guild.id);
      for (const [userId, entry] of Object.entries(d.intro || {})) {
        if (!entry.uid || !entry.msg || !entry.ch) continue;
        // Migrate older UID cards that were posted while Enka was unavailable.
        if (entry.pending === undefined) {
          try {
            const ch = await client.channels.fetch(entry.ch);
            const msg = await ch.messages.fetch(entry.msg);
            entry.pending = !msg.embeds[0]?.fields?.some(field => field.name === '冒険ランク');
          } catch { entry.pending = false; }
          st.saveLater(guild);
        }
        if (!entry.pending) continue;
        if (entry.retryAfter && Date.now() < entry.retryAfter) continue;
        const result = await en.player(entry.uid).catch(() => ({ err: 503 }));
        if (!result.p) {
          if (!retryable(result.err)) {
            entry.pending = false;
          } else {
            entry.retryAfter = Date.now() + 10 * 60 * 1000;
          }
          st.saveLater(guild);
          continue;
        }
        try {
          const ch = await client.channels.fetch(entry.ch);
          const msg = await ch.messages.fetch(entry.msg);
          const member = await guild.members.fetch(userId).catch(() => null);
          await en.names();
          const card = await makeCard({ uid: entry.uid, ...result, displayName: member?.displayName || msg.mentions.users.first()?.username || 'ユーザー', avatarURL: member?.user.displayAvatarURL() || client.user.displayAvatarURL() });
          if (msg.flags.has(MessageFlags.IsComponentsV2)) {
            await msg.edit({ components: card.components, files: card.files, attachments: [], allowedMentions: { parse: [] } });
          } else {
            // Legacy Embed posts cannot reliably be converted to Components V2 in place.
            const replacement = await ch.send(card);
            entry.msg = replacement.id;
            await msg.delete().catch(() => null);
          }
          entry.pending = false;
          delete entry.retryAfter;
          st.saveLater(guild);
        } catch (error) {
          // Deleted messages or unavailable channels cannot be restored automatically.
          if (error.code === 10008 || error.code === 10003) entry.pending = false;
          else entry.retryAfter = Date.now() + 10 * 60 * 1000;
          st.saveLater(guild);
          console.error('自己紹介再取得失敗:', guild.id, userId, error.message);
        }
      }
    }
  } finally { retryBusy = false; }
}

module.exports = { panel, place, bump, open, submit, showCharacter, retryPending };
