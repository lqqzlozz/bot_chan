const fs = require('node:fs/promises');
const path = require('node:path');
const namesJa = require('../data/genshinCharacterNamesJa.json');
const {details} = require('./azaDetails');
const PAGE = 'https://genshin.aza.gg/spiral-abyss?l=en';
const API = 'https://n1-api.aza.gg/v1/kv/read?key_id=genshin_abyss_statistics';

function percent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid AZA rate');
  return Math.round(value * 10000) / 100;
}
function catalogFromPage(html) {
  const catalog = new Map();
  // Parse only the public table, never execute the embedded hydration scripts.
  for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const link = row.match(/<a\b[^>]*href="#\/[^"#]*-(\d{8})"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const rarity = row.match(/gi-star-([45])-bg-gradient/);
    const name = [...link[2].matchAll(/<span\b[^>]*>([^<>]+)<\/span>/g)].at(-1)?.[1];
    if (!rarity || !name || name.length > 100 || catalog.has(link[1])) throw new Error('Invalid/duplicate AZA catalog row');
    catalog.set(link[1], {avatarId: Number(link[1]), name: namesJa[link[1]], rarity: Number(rarity[1])});
  }
  if (catalog.size < 100) throw new Error('AZA character table incomplete');
  return catalog;
}
function normalize(payload, html, now = new Date()) {
  if (payload?.retcode !== 0 || payload?.meta?.author !== 'aza.gg' || payload?.meta?.api_ver !== '5.6') throw new Error('Unrecognized AZA API version/response');
  const d = payload.data;
  const start = Number(d?.schedule?.start_time), end = Number(d?.schedule?.end_time);
  const timestamp = d?.updated_at;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end || !Number.isSafeInteger(d?.schedule?.id) ||
      !Number.isSafeInteger(timestamp) || timestamp < start * 1000 || timestamp > now.getTime() + 3600000) throw new Error('Invalid AZA period/timestamp');
  if (now.getTime() - timestamp > 7 * 86400000 || now.getTime() > end * 1000 + 86400000) throw new Error('AZA data is stale');
  if (!Number.isSafeInteger(d.sample_size_x_a) || d.sample_size_x_a <= 0 || !Number.isSafeInteger(d.sample_size_x_b) || d.sample_size_x_b <= 0) throw new Error('Invalid AZA sample metadata');
  const catalog = catalogFromPage(html);
  const ownership = [], usage = [];
  for (const [id, character] of catalog) {
    if (character.rarity !== 5) continue;
    const stats = d.character?.[id];
    if (!stats) throw new Error('Missing AZA stats for ' + id);
    ownership.push({...character, rate: percent(stats.own_rate)});
    usage.push({...character, rate: percent(stats.use_by_own_rate), appearanceRate: percent(stats.use_rate)});
  }
  if (ownership.length < 60) throw new Error('AZA five-star data incomplete');
  const sort = rows => rows.sort((a,b) => b.rate - a.rate || a.avatarId - b.avatarId);
  return {
    source: 'AZA.GG', sourceUrl: PAGE, sourceApi: API, apiVersion: payload.meta.api_ver,
    period: new Date(start * 1000).toISOString() + ' ～ ' + new Date(end * 1000).toISOString(),
    scheduleId: d.schedule.id, updatedAt: new Date(timestamp).toISOString(), fetchedAt: now.toISOString(),
    sampleSize: null, sample: {origin: d.sample_size_x_a, reference: d.sample_size_x_b},
    methodology: 'AZA.GG投稿サンプル。所持率=own_rate、使用率=use_by_own_rate（所持者中）、採用率=use_rate（全サンプル中）。全プレイヤーの代表値ではありません。',
    partial: false, ownership: sort(ownership), usage: sort(usage), ...details(d, catalog, percent)
  };
}
async function get(url, fetchImpl) {
  const r = await fetchImpl(url, {signal: AbortSignal.timeout(30000), headers: {'User-Agent': 'bot_chan-statistics/1.0 (+https://github.com/lqqzlozz/bot_chan)'}});
  if (!r.ok) throw new Error('AZA HTTP ' + r.status + ' at ' + new URL(url).host);
  return r;
}
async function update(output, fetchImpl = fetch, now = new Date()) {
  const payload = await (await get(API, fetchImpl)).json();
  const html = await (await get(PAGE, fetchImpl)).text();
  const result = normalize(payload, html, now);
  const missingNames = new Map();
  for (const row of result.characters) {
    if (row.name) continue;
    const url = `https://ar-cs.aza.gg/g/genshin_impact/data/ja/character/${row.avatarId}.json`;
    const character = await (await get(url, fetchImpl)).json();
    if (Number(character?.id) !== row.avatarId || typeof character.name !== 'string' ||
        !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character.name)) {
      throw new Error('Japanese character name unavailable for ' + row.avatarId);
    }
    missingNames.set(row.avatarId, character.name);
  }
  for (const row of [...result.ownership, ...result.usage, ...result.characters]) {
    row.name ??= missingNames.get(row.avatarId);
  }
  await fs.mkdir(path.dirname(output), {recursive:true});
  const temporary = output + '.tmp';
  try {
    await fs.writeFile(temporary, JSON.stringify(result, null, 2) + '\n');
    await fs.rename(temporary, output);
  } finally { await fs.rm(temporary, {force:true}).catch(() => {}); }
  return result;
}
module.exports = {PAGE, API, percent, catalogFromPage, normalize, update};
