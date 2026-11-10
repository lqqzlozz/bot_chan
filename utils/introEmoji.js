const { createHash } = require('node:crypto');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const sessions = new WeakMap();

function characterEmoji(manager, url) {
  if (!manager || !url) return null;
  let state = sessions.get(manager);
  if (!state) {
    state = { listing: null, pending: new Map() };
    sessions.set(manager, state);
  }
  const name = 'uid_' + createHash('sha256').update(url).digest('hex').slice(0, 24);
  const existing = manager.cache.find(emoji => emoji.name === name);
  if (existing) return existing;
  if (state.pending.has(name)) return state.pending.get(name);

  state.listing ||= manager.fetch().catch(error => {
    state.listing = null;
    throw error;
  });
  const task = state.listing.then(async () => {
    const saved = manager.cache.find(emoji => emoji.name === name);
    if (saved) return saved;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const image = await loadImage(Buffer.from(await response.arrayBuffer()));
    const canvas = createCanvas(128, 128);
    const scale = 128 / Math.max(image.width, image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    canvas.getContext('2d').drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
    return manager.create({ name, attachment: canvas.toBuffer('image/png') });
  }).catch(error => {
    console.warn('UIDアイコン絵文字の取得失敗:', error.message);
    return null;
  }).finally(() => state.pending.delete(name));
  state.pending.set(name, task);
  return task;
}

module.exports = { characterEmoji };
