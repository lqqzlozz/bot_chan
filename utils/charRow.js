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
  const W = 640, H = 205;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#31384a';
  ctx.fillRect(0, 0, W, H);
  if (banner) {
    // 横長素材を拡大・トリミングせず、縦横比を保って中央配置。
    const scale = Math.min(1, W / banner.width, H / banner.height);
    const w = banner.width * scale, h = banner.height * scale;
    ctx.drawImage(banner, (W - w) / 2, (H - h) / 2, w, h);
  }
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

// Four compact columns. Character Lv/C occupy fixed positions independent of equipment visibility.
async function charRow(list) {
  const entries = list.slice(0, 12);
  if (!entries.length) return null;
  const columns = 4, W = 640, cellW = 156, rowH = 92, H = Math.ceil(entries.length / columns) * rowH;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const images = await Promise.all(entries.map(async entry => ({
    character: await load(entry.url),
    weapon: await load(entry.weapon),
    artifacts: await Promise.all((entry.artifacts || []).slice(0, 2).map(load))
  })));
  function icon(img, x, y, w, h) {
    if (!img) return;
    const scale = Math.min(w / img.width, h / img.height);
    const iw = img.width * scale, ih = img.height * scale;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  entries.forEach((entry, i) => {
    const x = 8 + (i % columns) * 158, y = Math.floor(i / columns) * rowH;
    const asset = images[i];
    // Side portrait left; the character's level and constellation in the middle;
    // equipment always at the far right, so Lv cannot be mistaken for weapon level.
    icon(asset.character, x, y + 7, 57, 68);
    ctx.font = 'bold 17px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('Lv.' + (entry.lv ?? '?'), x + 59, y + 34);
    ctx.fillText(entry.c == null ? '—' : 'C' + entry.c, x + 59, y + 66);
    if (entry.private) {
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#aab0bd';
      ctx.fillText('非公開', x + 107, y + 52);
    } else {
      icon(asset.weapon, x + 111, y + 6, 35, 35);
      asset.artifacts.forEach((img, j) => icon(img, x + 106 + j * 23, y + 48, 24, 29));
    }
  });
  return canvas.toBuffer('image/png');
}
module.exports = { profileHeader, charRow };
