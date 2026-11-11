function valid(data) {
  return data?.source === 'AZA.GG' && data.partial === false &&
    ['ownership','usage'].every(key => Array.isArray(data[key]) && data[key].length >= 60 && data[key].length <= 100 &&
      new Set(data[key].map(row => row.avatarId)).size === data[key].length &&
      data[key].every(row => row.rarity === 5 && typeof row.name === 'string' && row.name.trim() && Number.isSafeInteger(row.avatarId) && Number.isFinite(row.rate) && row.rate >= 0 && row.rate <= 100));
}
function description(data, key, now = new Date()) {
  if (!valid(data)) throw new Error('No verified five-star snapshot');
  if (!['ownership','usage'].includes(key)) throw new Error('Unknown stats type');
  const stale = !Number.isFinite(Date.parse(data.updatedAt)) || now - new Date(data.updatedAt) > 7 * 86400000;
  const intro = ['★5キャラクター一覧',
    key === 'usage' ? '使用率：そのキャラクターの所持者中（AZA.GG Use/Own）' : '所持率：AZA.GG投稿サンプル中',
    '全プレイヤーの代表値ではありません。',
    stale ? '⚠ 更新が古いため参考値です。' : null,
    data.period ? '期間：' + data.period : null,
    data.sample ? `サンプル表記：origin ${data.sample.origin} / ref ${data.sample.reference}（合算しません）` : null
  ].filter(Boolean).join('\n');
  const lines = data[key].map((row,index) => `${index+1}. ${row.name.replace(/[\\`*_~|<>@\[\]]/g,'').slice(0,30)}：${row.rate.toFixed(1)}%`);
  const chunks = [intro + '\n\n'];
  for (const line of lines) {
    if (chunks.at(-1).length + line.length + 1 > 3800) chunks.push('');
    chunks[chunks.length-1] += line + '\n';
  }
  return chunks;
}
module.exports = {valid, description};
