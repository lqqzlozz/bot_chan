# 原神統計の取得・表示

現行の取得元はAZA.GGです。詳細な取得証拠・公開API・利用条件・Snap Hutaoの調査結果は
[genshin-stats-research.md](genshin-stats-research.md) に記録しています。

- 更新：`node scripts/updateAzaStats.js`
- テスト：`node --test test/aza-stats.test.js`
- 取得した実応答から再検証：`node scripts/verifyAzaSnapshot.js API.json PAGE.html`
- GitHub Actions：`Verify and update AZA statistics`（毎日JST 11:15、手動、PR検証）

`/stats-pull` は★5所持率、`/stats-usage` は★5所持者中の螺旋使用率を降順表示します。
AZAのUse Rate（全サンプル中の採用率）とは分けています。
出典・対象期間・ソース更新日時・origin/refを表示し、古い統計には注記します。
`/stats-team` は準備中です。

JSONは `data/genshinStats.json` に保持します。★5の判定・名称は同じ公開画面のキャラクターIDに結び付けます。
HTTPエラー、スキーマ変更、不正な率、不完全な一覧、古い応答では更新を拒否し、前回値を保持します。
実行時に外部フィードを取得する仕組みや `GENSHIN_STATS_JSON_URL` は使用していません。
画像生成を待たずにJSONからテキスト一覧を表示します。

AZAの安定した公開API契約・明示的なデータ再配布ライセンスは未確認です。
公開集計値のみを出典付きで扱い、個人データ・認証情報・画像の転載やアクセス制限の回避は行いません。
Snap Hutaoは現行APIの実取得に成功していますが、正式な開発者ライセンスの確認前なので定期取得には採用していません。
