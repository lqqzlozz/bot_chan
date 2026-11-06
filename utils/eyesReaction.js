const { isEnabled } = require('./entryScope');

function normalize(text) {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\p{Z}\p{P}\p{S}\p{Cf}\s]/gu, '');
}

// Sensitive dictionary: edit these patterns to tune detection without external APIs.
const patterns = [
  /ふぇら(?!ーり|り)/, /せっくす/, /ちん[こぽ]/, /まんこ/, /おっぱい/,
  /(?:犯|おか)す(?:ぞ|よ|から|ぜ|ね|$)/, /れいぷ/,
  /(?:ぶっ)?(?:殺|ころ)す/, /(?:殴|なぐ)る(?:ぞ|ぜ|から|よ|$)/,
  /(?:金|かね|お金|おかね)(?:を)?(?:よこせ|払え|はらえ|出せ|だせ)(?!る)/,
  /(?:馬鹿|ばか)(?!んす|り|うけ|みたいに楽しい|みたいにたのしい)/,
  /うざ[いぃっ]/, /(?:きも|キモ)[いぃっ]/, /気持ち悪い/,
  /死ね/, /しね(?:$|よ|え|ぇ|って|ば)/, /(?:消|き)えろ/,
];

function detects(text) {
  if (typeof text !== 'string' || !text) return false;
  // Do not match incidental words inside URLs or Discord mention/emoji names.
  const plain = text.replace(/https?:\/\/\S+|<[^>]+>/gi, '');
  return patterns.some(pattern => pattern.test(normalize(plain)));
}

async function onMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId || !isEnabled(message.guildId)) return;
  if (!detects(message.content)) return;
  try {
    await message.react('👀');
  } catch (error) {
    // Missing permissions/deleted messages must not interrupt existing handlers.
    console.error('👀リアクションエラー:', error.code || error.name);
  }
}

module.exports = { normalize, detects, onMessage };
