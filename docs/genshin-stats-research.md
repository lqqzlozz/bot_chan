# 統計ソース実取得調査（2026-11-11 JST）

## 実装した経路：AZA.GG

- 公開画面 https://genshin.aza.gg/spiral-abyss?l=en は認証なしの通常GETでHTTP 200。
- 同画面の配布JavaScriptが参照する公開JSON：
  https://n1-api.aza.gg/v1/kv/read?key_id=genshin_abyss_statistics
- JSONもHTTP 200、`retcode:0`、`meta.author:aza.gg`、`api_ver:5.6`。
- 検証時のデータ更新日時：2026-11-11T03:00:00.386Z（JST 12:00）。schedule 124。
- 画面のキャラクターID・名称・星数と照合し、★5 **71人**を抽出。
- 実値：神里綾華（10000002）`own_rate=0.5074`、`use_rate=0.0327`、`use_by_own_rate=0.0645`。
  表示値は所持率50.7%、全サンプル中の採用率3.3%、所持者中の使用率6.5%。
- `sample_size` は0だが、画面は `sample_size_x_a=1388` をorigin、`sample_size_x_b=3500`をrefとして表示。
  両者を合算した人数や厳密な分母を推測しない。Botもorigin/refをそのまま明示。
- 全原神プレイヤーの代表標本ではない。画面では韓国由来のサンプルが80%。

### 公開アクセスと利用条件の区別

`https://genshin.aza.gg/robots.txt` は `User-agent: *` に `Allow: /`。
`/dev/`, `/share-uid/`, `/test/`, `/temp/`, `/u/`, `/inspect/`, `/analytics/`, `/solution` は禁止。
実装はこれらにアクセスせず、公開統計JSONと公開画面へのGETを各1回、1日1回のみ行う。
Cookie、アカウント、個人UID、認証回避、Cloudflare回避は使わない。

APIリンク先 https://aza.gg/docs は閲覧できたが、統計APIの安定性保証、明示的なデータ再配布ライセンス、商用利用許諾は確認できなかった。
robots.txtやHTTP 200を包括的なライセンスの証拠とは扱わない。
本実装は出典付きの事実的な集計値のみを保存し、プロフィール、原データ、サイト文章、画像資産を転載しない。
大規模再配布や有料提供を行う場合は運営に条件を確認する必要がある。
スキーマ変更や403では処理を失敗させ、前回の検証済み値を保持する。

## Snap Hutao Remastered

公式案内：https://hutaorp.org/en/development/platform
公式機能説明：https://hutaorp.org/en/features/hutao-API

開発者ライセンスは申請制。案内ページは旧 `homa.snapgenshin.com` を指しているが、今回は旧サイトはタイムアウト。
**現行の申請画面 https://api.snaphutaorp.org/ はHTTP 200で存在する。**
画面には胡桃通行証のメールアドレスと開発中プロジェクトURLを入力し、返信はメールとある。
申請POSTは `/Accession/ApplyOpenSourceLicense`、項目は `UserName`, `ProjectUrl`。
ユーザー名の推測や申請の代理送信はしていない。

公式クライアントの現行mainから確認したドメイン：

- Homa本番：`https://homa.snaphutaorp.org`
- Homa予備：`https://homa.hutaorp.org`
- 開発者申請/APIルート：`https://api.snaphutaorp.org`

公式実装：
[ServerDomainService.cs](https://github.com/SnapHutaoRemasteringProject/Snap.Hutao.Remastered/blob/main/src/Snap.Hutao.Remastered/Snap.Hutao.Remastered/Web/ServerDomainService.cs)
[IHomaSpiralAbyssEndpoints.cs](https://github.com/SnapHutaoRemasteringProject/Snap.Hutao.Remastered/blob/main/src/Snap.Hutao.Remastered/Snap.Hutao.Remastered/Web/Endpoint/Hutao/IHomaSpiralAbyssEndpoints.cs)

GETエンドポイント（`?Last=false`、前期はtrue）：

- `/Statistics/Overview`
- `/Statistics/Avatar/HoldingRate`（所持率）
- `/Statistics/Avatar/UtilizationRate`（所持者中の使用率）
- `/Statistics/Avatar/AttendanceRate`（出場率）
- `/Statistics/Team/Combination`
- `/Statistics/Avatar/AvatarCollocation`
- `/Statistics/Weapon/WeaponCollocation`

本番Overviewは認証ヘッダーなしでHTTP 200、code/retcode=0。
`ScheduleId=124`, `RecordTotal=881`, `SpiralAbyssTotal=398`, `SpiralAbyssFullStar=346`。
HoldingRateもHTTP 200：AvatarId 10000125 の HoldingRate は0.8183881952326901。
これは実取得の証拠だが、ライセンス申請不要とは判断しない。
現行クライアントの統計GETには個別の認証ヘッダー設定がなく、アカウント系にはBearerとx-homa-tokenの補助実装がある。
将来の認証仕様やレート制限は未確認。Botの定期取得先には採用していない。

クライアントソースのMITライセンスは、統計サービス・DBの再配布許可とは別。
Snap Hutaoを正式な取得元にする場合、利用者が通行証アカウントで開発者ライセンスを申請し、
プロジェクト https://github.com/lqqzlozz/bot_chan でのDiscord表示・定期取得・集計値キャッシュの可否を確認する。
AZA経路の実装・テストにこの申請は不要。

## 運用

`node scripts/updateAzaStats.js` で取得・検証・一時ファイル経由の置換。
`node --test test/aza-stats.test.js` はネット不要。
`node scripts/verifyAzaSnapshot.js API.json PAGE.html` は手元の実応答の照合用。
GitHub ActionsはPR上でも実取得し、検証済みJSONをartifactに残す。main上では日次更新をコミットする。
旧LaQoos更新は手動実行のみ。旧画像には依存せず、Botは最新JSONを★5一覧として表示する。
使用率はAZAのUse/Ownを使用。期間、出典、更新日時、origin/ref、標本の偏りを表示し、7日以上古い値には注記する。
人気パーティーは分母・上下半別の定義が未確定のため引き続き準備中。
