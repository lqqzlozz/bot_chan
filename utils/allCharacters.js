const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const st = require('./store');
const enka = require('./enka');
const { isGI } = require('./gi');
const store = require('./hoyolabStore');
const links = require('./hoyolabLink');
const { hiragana } = require('./genshinStatsDetailsView');
const collator = new Intl.Collator('ja');
const rarityById = new Map(require('../data/genshinStats.json').characters.map(row => [String(row.avatarId), row.rarity]));
const button = (owner, action, label, style = ButtonStyle.Secondary) => new ButtonBuilder()
  .setCustomId(`allchar:${owner}:${action}`).setLabel(label).setStyle(style);
const embed = text => new EmbedBuilder().setColor('#1D9E75').setDescription(text);
const payload = text => ({ embeds: [embed(text)], components: [], allowedMentions: { parse: [] } });
const rarityFor = character => {
  const rarity = character.rarity ?? rarityById.get(String(character.id));
  return rarity === 105 ? 5 : [4, 5].includes(rarity) ? rarity : '?';
};

function render(owner, result) {
  const value = result.value;
  if (!value) {
    const response = payload('HoYoLabと連携すると、所持しているキャラ全員の名前・レベル・凸数を表示できます。');
    response.embeds[0].setTitle('所持キャラクター一覧');
    response.components = [new ActionRowBuilder().addComponents(button(owner, 'connect', 'HoYoLabと連携', ButtonStyle.Primary), button(owner, 'delete', '🗑️'))];
    return response;
  }
  const characters = [...value.characters].sort((a, b) =>
    b.level - a.level || b.constellation - a.constellation ||
    collator.compare(hiragana(a.name), hiragana(b.name)) || String(a.id).localeCompare(String(b.id)));
  // Put variable-width names last: Android's Japanese font fallback does not
  // reliably match the width of ASCII spaces, even inside a code block.
  const lines = characters.map(character => `★${rarityFor(character)}   Lv.${String(character.level).padStart(3)}  ${character.constellation}凸   ${character.name.replace(/[\r\n`]/g, '')}`);
  // Keep every character in the same message; long lists use consecutive embeds
  // to stay within Discord's per-description limit without page controls.
  const header = '```text\nレア  レベル  凸数  キャラ名\n';
  const sections = [];
  let section = header;
  for (const line of lines) {
    if (section.length + line.length + 5 > 4096) {
      sections.push(section + '```');
      section = header;
    }
    section += line + '\n';
  }
  sections.push(lines.length ? section + '```' : '所持キャラの登録はありません。');
  const response = payload(sections[0]);
  response.embeds.push(...sections.slice(1).map(embed));
  response.embeds[0].setTitle(`所持キャラクター一覧（${value.characters.length}名）`);
  const fetched = new Date(value.fetchedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
  const note = result.status === 'auth' ? ' • 再連携が必要です。保存済みの一覧を表示中' : result.status === 'cached' ? ' • 更新できなかったため保存済みの一覧を表示中' : '';
  response.embeds.at(-1).setFooter({ text: `HoYoLab • UID ${value.uid} • 取得 ${fetched}${note}` });
  const controls = [];
  controls.push(button(owner, 'refresh', '更新'), button(owner, 'connect', result.status === 'auth' ? 'HoYoLabへ再連携' : '連携し直す'), button(owner, 'delete', '🗑️'));
  response.components = [new ActionRowBuilder().addComponents(...controls), new ActionRowBuilder().addComponents(button(owner, 'unlink', '連携を解除'))];
  return response;
}

function uidFor(interaction) {
  return enka.cleanUid(st.get(interaction.guildId).intro?.[interaction.user.id]?.uid || '');
}

async function execute(interaction) {
  if (!isGI(interaction.guildId)) return interaction.reply(payload('このサーバーでは原神機能が有効になっていません。'));
  const uid = uidFor(interaction);
  if (!uid) return interaction.reply(payload('先にサーバーのUID登録パネルから、自分のUIDを登録してください。'));
  const started = Date.now();
  const saved = store.entry(interaction.guildId, interaction.user.id);
  const value = saved?.uid === uid ? saved : null;
  console.log('all-char: 初回応答開始', { linked: !!value });
  try {
    // Respond to the interaction itself. Initial linking never needs a network
    // request, and an existing snapshot can be displayed before refreshing it.
    await interaction.reply(render(interaction.user.id, { value, status: value?.needsAuth ? 'auth' : 'ok' }));
    console.log('all-char: 初回応答完了', { elapsedMs: Date.now() - started });
    if (!value || value.needsAuth) return;
    const result = await store.roster(interaction.guild, interaction.user.id, uid);
    if (result.value !== value || result.status !== 'ok') await interaction.editReply(render(interaction.user.id, result));
  } catch (error) { return reportError(interaction, error); }
}

async function reportError(interaction, error) {
  console.error('all-char: 応答失敗', { code: Number(error.code) || null });
  const response = payload('一覧を表示できませんでした。もう一度 /all-char を実行してください。');
  if (interaction.replied || interaction.deferred) return interaction.editReply(response).catch(() => null);
  return interaction.reply(response).catch(() => null);
}

async function handle(interaction) {
  const [, owner, action] = interaction.customId.split(':');
  if (owner !== interaction.user.id || !isGI(interaction.guildId)) return interaction.reply(payload('コマンドを実行した本人が操作してください。'));
  if (action === 'delete') { await interaction.deferUpdate(); return interaction.deleteReply(); }
  if (action === 'unlink') {
    const response = payload('bot-configに保存したHoYoLabの認証情報とキャラ一覧データを削除しますか？');
    response.components = [new ActionRowBuilder().addComponents(button(owner, 'unlink_confirm', '連携を解除する', ButtonStyle.Danger), button(owner, 'cancel', '戻る'))];
    return interaction.update(response);
  }
  if (action === 'unlink_confirm') {
    await interaction.deferUpdate();
    try { links.revoke(interaction.guildId, owner); await store.unlink(interaction.guild, owner); return interaction.editReply(render(owner, { value: null, status: 'unlinked' })); }
    catch { return interaction.editReply(payload('連携情報を削除できませんでした。#bot-config の保存権限を確認してやり直してください。')); }
  }
  const uid = uidFor(interaction);
  if (!uid) return interaction.reply(payload('先にサーバーのUID登録パネルから、自分のUIDを登録してください。'));
  if (action === 'connect') {
    // An authentication link can bind an account. Only its owner may receive it.
    try {
      const url = links.create(interaction.guildId, owner, uid);
      const response = payload('本人専用の連携リンクです。有効期限は10分です。\n認証情報を含むリンクのため、この案内だけ本人に表示しています。');
      response.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('HoYoLab連携ページを開く').setStyle(ButtonStyle.Link).setURL(url))];
      await interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
      console.log('all-char: 本人専用の連携案内を表示');
      return;
    } catch (error) {
      console.error('all-char: 連携案内の表示失敗', { code: Number(error.code) || null });
      if (interaction.replied || interaction.deferred) return reportError(interaction, error);
      return interaction.reply({ ...payload('HoYoLab連携ページを開けませんでした。もう一度操作してください。'), flags: MessageFlags.Ephemeral });
    }
  }
  await interaction.deferUpdate();
  try {
    const result = action.startsWith('page_') || action === 'cancel'
      ? { value: store.entry(interaction.guildId, owner), status: store.entry(interaction.guildId, owner)?.needsAuth ? 'auth' : 'ok' }
      : await store.roster(interaction.guild, owner, uid, action === 'refresh');
    if (result.value?.uid !== uid) result.value = null;
    return interaction.editReply(render(owner, result));
  } catch { return interaction.editReply(payload('一覧を更新できませんでした。少し待ってから試してください。')); }
}

module.exports = { execute, handle, render, reportError };
