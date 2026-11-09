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

// Four compact columns. Character Lv/C occupy fixed positions independent of equipment visibility.
async function charRow(list) {
  const entries = list.slice(0, 12);
  if (!entries.length) return null;
  const columns = 4, W = 640, cellW = 154, gap = 8, rowH = 90;
  const rows = Math.ceil(entries.length / columns), H = rows * rowH + 4;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const images = await Promise.all(entries.map(async entry => {
    const [character, weapon, artifacts] = await Promise.all([
      load(entry.url), load(entry.weapon),
      Promise.all((entry.artifacts || []).slice(0, 2).map(load))
    ]);
    return { character, weapon, artifacts };
  }));
  function icon(img, x, y, w, h) {
    if (!img) return;
    const scale = Math.min(w / img.width, h / img.height);
    const iw = img.width * scale, ih = img.height * scale;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  entries.forEach((entry, i) => {
    const x = 1 + (i % columns) * (cellW + gap);
    const y = 1 + Math.floor(i / columns) * rowH;
    const asset = images[i];
    // Quiet rounded tile makes each character read as a single unit.
    ctx.fillStyle = 'rgba(112,123,145,.16)';
    ctx.strokeStyle = 'rgba(190,199,218,.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, cellW, 82, 12);
    ctx.fill();
    ctx.stroke();
    // Character portrait takes visual priority.
    icon(asset.character, x + 5, y + 8, 60, 66);
    // Fixed character stats immediately beside the portrait, never beside the weapon.
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f1f2f5';
    ctx.fillText('Lv.' + (entry.lv ?? '?'), x + 64, y + 32);
    ctx.fillText(entry.c == null ? '—' : 'C' + entry.c, x + 64, y + 62);
    if (entry.private) {
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#b8beca';
      ctx.fillText('非公開', x + 109, y + 48);
    } else {
      icon(asset.weapon, x + 112, y + 6, 35, 35);
      asset.artifacts.forEach((img, j) => icon(img, x + 106 + j * 21, y + 47, 23, 26));
    }
  });
  return canvas.toBuffer('image/png');
}
module.exports = { profileHeader, charRow };
