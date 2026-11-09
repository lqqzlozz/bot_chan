const { EmbedBuilder } = require('discord.js');
const st = require('./store');
const { ensureConfig } = require('./setup');

function welcomeEmbed() {
  const creator = '1088369918069715024';
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🤖 Botの導入ありがとうございます！')
    .setDescription([
      'このたびはBotを導入いただき、ありがとうございます。',
      '',
      '🔒 **このチャンネルについて**',
      'ここはBotの設定を保存するためのチャンネルです。削除・改名せずに残しておいてください。',
      'Botとサーバーの所有者・管理者向けの非公開チャンネルとして作成しています。',
      '',
      '📢 **導入通知について**',
      'Botを導入したサーバーの名前・所有者情報は、Bot制作者に通知されます。',
      '招待リンクは、Botに閲覧権限があり既存のリンクを取得できる場合のみ通知されます。新しい招待リンクを自動作成することはありません。',
      '',
      '💬 **使い方を詳しく知りたい場合**',
      'Botの機能について詳しい説明をご希望の場合は、制作者（下記ユーザーID）をこのサーバーに招待してください。',
      `制作者：<@${creator}> （ID: \`${creator}\`）`,
      '',
      '基本的な機能は #bot-config の管理パネルから確認できます。',
    ].join('\n'));
}

async function welcomeGuild(guild) {
  const existing = st.findCh(guild);
  const ch = await ensureConfig(guild);
  // Avoid posting a new welcome to a pre-existing bot-config channel.
  if (existing) return { created: false, channelId: ch.id };
  await ch.send({ embeds: [welcomeEmbed()], allowedMentions: { parse: [] } });
  return { created: true, channelId: ch.id };
}

module.exports = { welcomeGuild, welcomeEmbed };
