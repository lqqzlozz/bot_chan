const { createHash } = require('node:crypto');
const { createCanvas, loadImage, Path2D } = require('@napi-rs/canvas');

const sessions = new WeakMap();

function applicationEmoji(manager, name, makeImage) {
  if (!manager) return null;
  let state = sessions.get(manager);
  if (!state) {
    state = { listing: null, pending: new Map() };
    sessions.set(manager, state);
  }
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
    const attachment = await makeImage();
    return attachment ? manager.create({ name, attachment }) : null;
  }).catch(error => {
    console.warn('UIDアイコン絵文字の取得失敗:', error.message);
    return null;
  }).finally(() => state.pending.delete(name));
  state.pending.set(name, task);
  return task;
}

function characterEmoji(manager, url) {
  if (!url) return null;
  const name = 'uid_' + createHash('sha256').update(url).digest('hex').slice(0, 24);
  return applicationEmoji(manager, name, async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const image = await loadImage(Buffer.from(await response.arrayBuffer()));
    const canvas = createCanvas(128, 128);
    const scale = 128 / Math.max(image.width, image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    canvas.getContext('2d').drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
    return canvas.toBuffer('image/png');
  });
}

const circle = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18';
const statPaths = {
  adventure: circle + ' M15.5 8.5l-2 5-5 2 2-5z',
  world: circle + ' M3 12h18 M12 3a4 9 0 1 0 0 18a4 9 0 1 0 0-18',
  achievement: 'M7 4h10v6a5 5 0 0 1-10 0z M7 6H3v2a4 4 0 0 0 4 4 M17 6h4v2a4 4 0 0 1-4 4 M12 15v5 M8 20h8'
};

function statEmoji(manager, stat) {
  return applicationEmoji(manager, 'uid_stat_' + stat, () => {
    const canvas = createCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    ctx.scale(128 / 24, 128 / 24);
    ctx.strokeStyle = '#bfc3ca';
    ctx.lineWidth = 1.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(statPaths[stat]));
    return canvas.toBuffer('image/png');
  });
}

module.exports = { characterEmoji, statEmoji };
