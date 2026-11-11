# キャラクターのピックアップ履歴

`data/genshinPickupHistory.json` は Paimon.moe の [通常・集録祈願データ](https://github.com/MadeBaruna/paimon-moe/blob/4b873a6decad0384665084c69e9927a9fa266555/src/data/banners.js) と [同時開催データ](https://github.com/MadeBaruna/paimon-moe/blob/4b873a6decad0384665084c69e9927a9fa266555/src/data/bannersDual.js) を2026-11-11に確認し、キャラクターID別に集計したスナップショットです。

- イベント祈願は★5と★4のピックアップを収録。
- 集録祈願は指定対象の★5キャラクターを収録。武器と★4の通常排出枠は対象外。
- 同じキャラの種別・バージョン・開始日・終了日が一致する掲載は1回に集約。日付はアジアサーバー基準。
- 集計元の最新掲載はVer.7.2第1期。追加する場合は同じ項目で更新し、`node --test test/aza-stats.test.js` を実行。

Paimon.moe は [MIT License](https://github.com/MadeBaruna/paimon-moe/blob/4b873a6decad0384665084c69e9927a9fa266555/LICENSE) です。

```text
MIT License

Copyright (c) 2021 Made Baruna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
