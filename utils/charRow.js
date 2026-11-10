const { createCanvas, loadImage } = require('@napi-rs/canvas');

// Separate compact image assets for Components V2. All copyable information stays as text.
async function load(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.warn('UID画像取得失敗:', String(url).slice(0, 140), error.message);
    return null;
  }
}
function cover(ctx, image, x, y, w, h) {
  const scale = Math.max(w / image.width, h / image.height);
  ctx.drawImage(image, x + (w - image.width * scale) / 2, y + (h - image.height * scale) / 2,
    image.width * scale, image.height * scale);
}
function rounded(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
}
async function profileHeader(namecardUrls, avatarUrl) {
  const candidates = Array.isArray(namecardUrls) ? namecardUrls : [namecardUrls];
  const avatarPromise = load(avatarUrl);
  let banner = null;
  for (const url of candidates) {
    banner = await load(url);
    if (banner) break;
  }
  const avatar = await avatarPromise;
  const W = 640, H = 128;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  // The banner fills the entire header; no smaller banner floating on a solid panel.
  ctx.save();
  rounded(ctx, 0, 0, W, H, 23);
  ctx.fillStyle = '#31384a';
  ctx.fillRect(0, 0, W, H);
  if (banner) cover(ctx, banner, 0, 0, W, H);
  const gradient = ctx.createLinearGradient(0, 0, 160, 0);
  gradient.addColorStop(0, 'rgba(10,14,25,.34)');
  gradient.addColorStop(1, 'rgba(10,14,25,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 160, H);
  if (avatar) {
    const size = 92, x = 19, y = 18;
    ctx.save();
    rounded(ctx, x, y, size, size, size / 2);
    cover(ctx, avatar, x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = '#f4e1b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  return canvas.toBuffer('image/png');
}

module.exports = { profileHeader };
