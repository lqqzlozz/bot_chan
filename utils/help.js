const { EmbedBuilder } = require('discord.js');

function genshinGuide() {
  return new EmbedBuilder().setColor('#1D9E75').setTitle('原神サーバーの使い方').setDescription([
    '**管理者の設定**',
    '非公開の #bot-config にある管理パネルから、UID登録・ビルドカード・ギフトコード・原神のお知らせを設定できます。',
    '', '**メンバーの使い方**',
    'UID登録の案内ボタンからUIDを登録してください。',
    'ビルドカードの案内からキャラクターと計算基準を選択できます。',
    '`/artifact`：展示キャラクターの聖遺物を紹介できます。',
    '装備・ステータス・スコアを表示するには、原神側で「キャラ詳細を表示」をONにしてください。',
    '', '**設定の保存**',
    '#bot-config は削除・改名せず、BOTの閲覧・送信・履歴閲覧・ファイル添付の権限を維持してください。',
  ].join('\n'));
}

function generalGuide() {
  return new EmbedBuilder().setColor('#5865F2').setTitle('BOTの使い方').setDescription([
    '**サーバー管理者へ**',
    'BOTの設定・通知・アナウンス・原神機能は、非公開の #bot-config に自動設置される管理パネルから操作してください。',
    '', '**スラッシュコマンド**',
    '`/help`：この案内を表示',
    '`/artifact`：原神サーバーで聖遺物を紹介',
    '`/entry`：対応サーバー専用の大会エントリー',
    '`/servers`：BOT所有者専用のサーバー一覧',
    '', '**設定の保存**',
    '#bot-config は削除・改名しないでください。',
  ].join('\n'));
}
module.exports = { genshinGuide, generalGuide };
