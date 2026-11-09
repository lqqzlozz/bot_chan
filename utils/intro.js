const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const st = require('./store');
const en = require('./enka');
const { charRow } = require('./charRow');

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
  m.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('uid').setLabel('UID').setStyle(TextInputStyle.Short).setMinLength(9).setMaxLength(12).setRequired(true)
    ),
  );
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

  const { p, av, raw, err } = await en.player(uid).catch(() => ({ err: 503 }));
  // UIDの打ち間違いだけはやり直してもらう
  if (!p && (err === 400 || err === 404)) return oops(i, errMsg[err]);

  const { e, files, components } = await makeCard({ uid, p, av, raw, displayName: i.member.displayName, avatarURL: i.user.displayAvatarURL() });

  // 前のカードがあれば差し替え
  const d = st.get(i.guildId);
  if (!d.intro) d.intro = {};
  const old = d.intro[i.user.id];
  if (old) {
    const ch = await i.client.channels.fetch(old.ch).catch(() => null);
    if (ch) await ch.messages.delete(old.msg).catch(() => null);
  }
  const m = await i.channel.send({ content: `<@${i.user.id}> がUIDを登録しました`, allowedMentions: { parse: [] }, embeds: [e], components, files });
  d.intro[i.user.id] = { ch: i.channelId, msg: m.id, uid, pending: !p && retryable(err) };
  st.saveLater(i.guild, 3000);

  // A role is optional: UID registration must succeed without any role assignment.
  const role = roleId && roleId !== 'none' ? await i.guild.roles.fetch(roleId).catch(() => null) : null;
  const ok = role ? await i.member.roles.add(role).then(() => true).catch(() => false) : true;
  if (!ok) await oops(i, 'ロールが付けられなかったので、管理者に連絡してね。');

  await bump(i.channel);
}


async function makeCard({ uid, p, av, raw, displayName, avatarURL }) {
  const e = new EmbedBuilder()
    .setColor(COLOR)
    .setFooter({ text: `UID ${uid}` });
  const files = [];

  if (p) {
    await en.names();
    const icon = en.pfpIcon(p.profilePicture) || avatarURL;
    e.setAuthor({ name: `${displayName} さんの自己紹介`, iconURL: icon })
      .addFields(
        { name: '冒険ランク', value: String(p.level ?? '-'), inline: true },
        { name: '世界ランク', value: String(p.worldLevel ?? '-'), inline: true },
        { name: 'アチーブメント', value: String(p.finishAchievementNum ?? '-'), inline: true },
      );
    // 名前は見出しで大きく（タイトルは文字サイズ変えられないので）
    const sg = p.signature?.trim();
    e.setDescription(`## ${p.nickname?.trim() || displayName}` + (sg ? `\n「${sg}」` : ''));
    // UID・ランク・自己紹介はコピー可能なEmbedテキストのまま。
    e.addFields({ name: 'UID', value: '\`' + uid + '\`', inline: false });
    const sh = p.showAvatarInfoList || [];
    const buf = await charRow(sh.map(a => ({
      url: en.charSideIcon(a), lv: a.level, c: av?.[a.avatarId]
    })), { namecard: en.namecardImage(p.nameCardId), avatar: icon }).catch(() => null);
    if (buf) {
      files.push(new AttachmentBuilder(buf, { name: 'profile.png' }));
      e.setImage('attachment://profile.png');
    }
  } else {
    // 取れなかった時は最低限で
    e.setAuthor({ name: `${displayName} さんの自己紹介`, iconURL: avatarURL })
      .setDescription(`## ${displayName}`);
  }

  const components = raw?.length ? [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Enka').setStyle(ButtonStyle.Link).setURL(`https://enka.network/u/${uid}/`),
    new ButtonBuilder().setLabel('Akasha').setStyle(ButtonStyle.Link).setURL(`https://akasha.cv/profile/${uid}`)
  )] : [];

  return { e, files, components };
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
          await msg.edit({ embeds: [card.e], components: card.components, files: card.files, attachments: [] });
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

module.exports = { panel, place, bump, open, submit, retryPending };
