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
async function profileHeader(namecardUrl, avatarUrl) {
  const [banner, avatar] = await Promise.all([load(namecardUrl), load(avatarUrl)]);
  const W = 640, H = 205;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#31384a';
  ctx.fillRect(0, 0, W, H);
  if (banner) cover(ctx, banner, 0, 0, W, H);
  // Preserve the original namecard artwork; only shade behind the avatar for contrast.
  const gradient = ctx.createLinearGradient(0, 0, 220, 0);
  gradient.addColorStop(0, 'rgba(14,19,31,.38)');
  gradient.addColorStop(1, 'rgba(14,19,31,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 220, H);
  if (avatar) {
    const size = 132, x = 25, y = 36;
    ctx.save();
    rounded(ctx, x, y, size, size, size / 2);
    cover(ctx, avatar, x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = '#f4e1b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvas.toBuffer('image/png');
}

// Five narrow side portraits per row, no cards or large blank right-hand area.
async function charRow(list) {
  const entries = list.slice(0, 12);
  if (!entries.length) return null;
  const columns = 4, W = 640, side = 112, gap = 42, left = 33;
  const rows = Math.ceil(entries.length / columns), rowHeight = 141;
  const H = rows * rowHeight + 4;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const images = await Promise.all(entries.map(entry => load(entry.url)));
  // Transparent background blends into Discord's dark/light surfaces.
  ctx.clearRect(0, 0, W, H);
  entries.forEach((entry, index) => {
    const x = left + (index % columns) * (side + gap);
    const y = Math.floor(index / columns) * rowHeight;
    const icon = images[index];
    if (icon) {
      const scale = Math.min(side / icon.width, side / icon.height);
      const w = icon.width * scale, h = icon.height * scale;
      ctx.drawImage(icon, x + (side - w) / 2, y + (side - h) / 2, w, h);
    }
    // Plain white text, no badge background.
    const label = 'Lv.' + (entry.lv ?? '?') + (entry.c == null ? '' : ' C' + entry.c);
    ctx.font = 'bold 19px "NotoSansJP-Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + side / 2, y + 130);
  });
  return canvas.toBuffer('image/png');
}
module.exports = { profileHeader, charRow };
