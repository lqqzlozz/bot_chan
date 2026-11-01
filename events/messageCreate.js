const { EmbedBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const st = require('../utils/store');
const { annRows } = require('../utils/annRows');
const intro = require('../utils/intro');
const gift = require('../utils/gift');
const dict = require('../utils/dict');
const bump = require('../utils/bump');
const buildPanel = require('../utils/buildPanel');
const inactive = require('../utils/inactive');
const wel = require('../utils/welcome');
const { parseVisitorMessage } = require('../utils/imageGenerator');

// Welcomeは会社のサーバーだけ
const WEL_GUILD = '1496054346385723472';

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.guild && !message.author.bot) inactive.record(message.guild, message.author);
    // DISBOARDのbump（botの発言なので先に見る）
    if (message.guild && message.author.id === '302050872383242240') {
      await bump.on(message).catch(e => console.error('bumpエラー:', e.message));
    }

    // UID登録の案内を一番下に（自分の投稿は無視）
    if (message.guild && message.author.id !== client.user.id && st.get(message.guildId).introP?.ch === message.channelId) {
      intro.bump(message.channel).catch(() => null);
    }
    // ギフトコードの案内も
    if (message.guild && message.author.id !== client.user.id && st.get(message.guildId).giftP?.ch === message.channelId) {
      gift.bump(message.channel).catch(() => null);
    }

    if (message.guild && message.author.id !== client.user.id && st.get(message.guildId).buildPanels?.[message.channelId]) {
      await buildPanel.place(message.channel).catch(e => console.error('ビルド案内エラー:', e.message));
    }

    if (message.guild && message.author.id !== client.user.id && st.get(message.guildId).bump?.ch === message.channelId && !bump.isBump(message)) {
      bump.schedule(message.channel);
    }

    if (message.author.bot && message.author.id === client.user.id) return;

    // --- 0. 住宅用語辞典（会社のサーバーでbotにメンション）---
    if (message.guildId === WEL_GUILD && new RegExp(`<@!?${client.user.id}>`).test(message.content)) {
      await dict.onMention(message, client).catch(e => console.error('辞典エラー:', e.message));
      return;
    }

    // --- 1. 来場予約の処理 ---
    // 時間と様/さんが入ってたら反応（全角もOK）
    if (message.guildId === WEL_GUILD && /[\d０-９]{1,2}\s*[：:時]\s*[\d０-９]{2}/.test(message.content) && /様|さん/.test(message.content)) {
      const parsed = parseVisitorMessage(message.content);
      if (parsed) {
        try {
          await wel.handle(message, parsed);
        } catch (e) {
          console.error(e);
        }
        return;
      }
    }

    // --- 2. アナウンスの常駐処理 ---
    if (!message.guild) return;
    const sk = st.get(message.guildId).sticky[message.channelId];
    if (!sk) return;

    try {
      const old = await message.channel.messages.fetch(sk.messageId).catch(() => null);

      // 画像は消す前に落としておく
      const files = [];
      for (const a of old?.attachments.values() || []) {
        const b = await fetch(a.url).then(r => r.arrayBuffer()).catch(() => null);
        if (b) files.push(new AttachmentBuilder(Buffer.from(b), { name: a.name }));
      }
      // Embedに入れた画像は添付に出てこないことがあるので、そっちからも拾う
      const iu = old?.embeds[0]?.image?.url;
      if (!files.length && iu) {
        const b = await fetch(iu).then(r => r.arrayBuffer()).catch(() => null);
        const nm = (iu.split('?')[0].split('/').pop() || 'ann.png').replace(/[^\w.\-]/g, '') || 'ann.png';
        if (b) files.push(new AttachmentBuilder(Buffer.from(b), { name: nm }));
      }
      // Keep the old announcement until the replacement has been sent.

      // 元メッセージが見つからない時(再起動直後とか)はtextから作り直す
      let emb = old?.embeds.map((e,n) => files[n] ? EmbedBuilder.from(e).setImage(`attachment://${files[n].name}`) : e);
      let cmp = old?.components;
      if (!old) {
        emb = [new EmbedBuilder().setColor('#5865F2').setDescription(sk.text)];
        // 前の形式(roleId1個)もそのまま読む
        const ids = sk.roles || (sk.roleId && sk.roleId !== 'none' ? [sk.roleId] : []);
        cmp = annRows(message.guild, ids);
      }

      // 貼り直しは通知なし
      const nw = await message.channel.send({ embeds: emb, components: cmp, files, flags: MessageFlags.SuppressNotifications });
      sk.messageId = nw.id;
      if (old) await old.delete().catch(e=>console.warn('旧常駐投稿の削除に失敗:',e.message));
      st.saveLater(message.guild);
    } catch (e) {
      console.error(e);
    }
  },
};
