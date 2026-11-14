const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const i18n = require('./buildLocale');

// フォント：数字と本文は丸ゴ、名前と見出しはひな明朝
const FB = (p, f) => path.join(__dirname, '..', 'node_modules', '@fontsource', p, 'files', f);
try {
  GlobalFonts.registerFromPath(FB('zen-maru-gothic', 'zen-maru-gothic-japanese-500-normal.woff'), 'ZenMaru');
  GlobalFonts.registerFromPath(FB('zen-maru-gothic', 'zen-maru-gothic-japanese-700-normal.woff'), 'ZenMaruB');
  GlobalFonts.registerFromPath(FB('hina-mincho', 'hina-mincho-japanese-400-normal.woff'), 'Hina');
} catch (e) {
  console.error('カード用フォントの読み込み失敗:', e.message);
}

// The Chinese glyph sets are not covered by the Japanese display fonts.
// Expo Google Fonts packages contain full TTF files (not browser-only subsets).
const fontRoot = (family, file) => path.join(__dirname, '..', 'node_modules', '@expo-google-fonts', family, '400Regular', file);
for (const [family, file, alias] of [
  ['noto-sans-sc', 'NotoSansSC_400Regular.ttf', 'NotoSC'],
  ['noto-sans-tc', 'NotoSansTC_400Regular.ttf', 'NotoTC'],
]) {
  try {
    if (!GlobalFonts.registerFromPath(fontRoot(family, file), alias)) {
      console.error('中国語フォントを登録できません:', alias);
    }
  } catch (e) {
    console.error('中国語フォントの読み込み失敗:', alias, e.message);
  }
}

function fontFamilies(locale) {
  if (/^zh-(CN|SG)(?:-|$)/i.test(locale || '')) return { body: 'NotoSC', bold: 'NotoSC', serif: 'NotoSC' };
  if (/^zh-(TW|HK|MO)(?:-|$)/i.test(locale || '')) return { body: 'NotoTC', bold: 'NotoTC', serif: 'NotoTC' };
  return { body: 'ZenMaru', bold: 'ZenMaruB', serif: 'Hina' };
}

// 元素カラー [差し色, 薄い色]
const EL = {
  Fire: ['#DE6446', '#FCEDE8', '炎元素'],
  Water: ['#3B97D3', '#E7F2FB', '水元素'],
  Wind: ['#33A88B', '#E5F4EF', '風元素'],
  Electric: ['#8B5CC8', '#F1EBFA', '雷元素'],
  Grass: ['#6A9F2A', '#EDF5E2', '草元素'],
  Ice: ['#47AEC6', '#E6F5F8', '氷元素'],
  Rock: ['#C9931A', '#FAF2DF', '岩元素'],
};

const W = 960, H = 1760;
const INK = '#2B2B2B', SUB = '#8A8A8A', LINE = '#EFEFEF';

const font = (f, s) => `${s}px "${f}"`;

// 立ち絵の上でも読めるよう白いふちを付けて書く
function txt(ctx, s, x, y) {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.strokeText(s, x, y);
  ctx.restore();
  ctx.fillText(s, x, y);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// 縦書き（長い名前は文字を小さくして収める）
function tate(ctx, s, x, y, max, size, family = 'Hina') {
  const ch = [...s];
  let fs = size;
  while (ch.length * fs * 1.08 > max && fs > 40) fs -= 4;
  ctx.font = font(family, fs);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ch.forEach((c, i) => {
    const cy = y + fs / 2 + i * fs * 1.08;
    // 伸ばし棒などは90度回す
    if ('ー－〜～…‥（）「」'.includes(c)) {
      ctx.save();
      ctx.translate(x, cy);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(c, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(c, x, cy);
    }
  });
  ctx.textBaseline = 'alphabetic';
}

// 画像を枠いっぱいに（はみ出す分は切る）
function cover(ctx, im, x, y, w, h, fy = 0.35) {
  const s = Math.max(w / im.width, h / im.height);
  const iw = im.width * s, ih = im.height * s;
  ctx.drawImage(im, x + (w - iw) / 2, y + (h - ih) * fy, iw, ih);
}

async function img(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await loadImage(Buffer.from(await r.arrayBuffer()));
  } catch {
    return null;
  }
}

// d: { name, el, lv, cons, tal:[A,E,Q], art, stats:[[名,値,強調?]], wp:{name,icon,lv,r,sub}, sets:[[名,数]], relics:[{icon,main,subs:[],score,best}], total, base, showOp, uid }
async function charCard(d, locale = 'ja') {
  const fonts = fontFamilies(locale);
  const tr = key => i18n.t(locale,key);
  const [ac, tint] = EL[d.el] || ['#888888', '#F2F2F2', ''];
  const elName = i18n.element(locale,d.el);
  const [art, wpi, talents, ris] = await Promise.all([
    img(d.art).then(primary => primary || img(d.artFallback)),
    img(d.wp?.icon),
    Promise.all((d.talIcons || []).map(img)),
    Promise.all(d.relics.map(r => img(r.icon))),
  ]);

  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // ---- 立ち絵
  const AH = 700;
  let g = ctx.createLinearGradient(0, 0, 0, AH);
  g.addColorStop(0, tint);
  g.addColorStop(1, '#fff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, AH);

  if (art) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, AH);
    ctx.clip();
    cover(ctx, art, -40, 0, W - 80, AH);
    ctx.restore();
  } else {
    // 画像が取れない時の仮
    ctx.fillStyle = tint;
    rr(ctx, 150, 90, 520, AH - 90, [260, 260, 0, 0]);
    ctx.fill();
  }

  // 下を白にとかす
  g = ctx.createLinearGradient(0, AH - 200, 0, AH);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, '#fff');
  ctx.fillStyle = g;
  ctx.fillRect(0, AH - 200, W, 200);

  // 名前の後ろを少し白く
  g = ctx.createLinearGradient(W - 260, 0, W, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(W - 260, 0, 260, AH);

  // 左の元素帯
  ctx.fillStyle = ac;
  ctx.fillRect(0, 0, 18, H);

  // 名前（縦書き）
  ctx.fillStyle = INK;
  tate(ctx, d.name, W - 90, 56, AH - 170, 100, fonts.serif);

  // 元素名
  ctx.font = font(fonts.serif, 30);
  ctx.fillStyle = ac;
  ctx.textAlign = 'right';
  ctx.fillText(elName, W - 52, AH - 50);

  // Lv と凸
  ctx.textAlign = 'left';
  ctx.font = font(fonts.bold, 40);
  ctx.fillStyle = INK;
  txt(ctx, `Lv.${d.lv}`, 58, 80);
  const lw = ctx.measureText(`Lv.${d.lv}`).width;
  if (d.cons != null) {
    ctx.font = font(fonts.bold, 30);
    const ct = `C${d.cons}`;
    const cw = ctx.measureText(ct).width + 28;
    ctx.fillStyle = ac;
    rr(ctx, 58 + lw + 16, 46, cw, 46, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(ct, 58 + lw + 30, 80);
  }

  // 天賦の透明な形だけを元素色で描く。四角い背景は付けない。
  let tx = 58;
  ['normal','skill','burst'].map(tr).forEach((label, i) => {
    if (talents[i]) {
      const icon = createCanvas(42, 42);
      const ic = icon.getContext('2d');
      ic.drawImage(talents[i], 0, 0, 42, 42);
      ic.globalCompositeOperation = 'source-in';
      ic.fillStyle = ac;
      ic.fillRect(0, 0, 42, 42);
      ctx.drawImage(icon, tx + 3, 104);
    }
    else {
      ctx.font = font(fonts.bold, 14);
      ctx.fillStyle = ac;
      ctx.textAlign = 'center';
      ctx.fillText(label, tx + 24, 131);
      ctx.textAlign = 'left';
    }
    tx += 58;
    ctx.font = font(fonts.bold, 30);
    ctx.fillStyle = INK;
    const v = String(d.tal[i] ?? '-');
    txt(ctx, v, tx, 134);
    tx += ctx.measureText(v).width + 26;
  });

  // ---- ステータス
  let y = AH + 30;
  d.stats.forEach(([k, v, hi], i) => {
    const ry = y + i * 46;
    ctx.font = font(fonts.body, 30);
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    ctx.fillText(k, 64, ry + 32);
    ctx.font = font(fonts.bold, 32);
    ctx.fillStyle = hi ? ac : INK;
    ctx.textAlign = 'right';
    ctx.fillText(v, W - 64, ry + 32);
    if (i < d.stats.length - 1) {
      ctx.fillStyle = LINE;
      ctx.fillRect(64, ry + 45, W - 128, 2);
    }
  });
  y += d.stats.length * 46 + 24;

  // 見出し
  const head = (t, yy, right) => {
    ctx.font = font(fonts.serif, 26);
    ctx.fillStyle = SUB;
    ctx.textAlign = 'left';
    ctx.fillText(t, 64, yy);
    if (right) {
      ctx.textAlign = 'right';
      ctx.fillText(right, W - 64, yy);
    }
  };

  // ---- 武器
  head(tr('weapon'), y + 24);
  y += 40;
  ctx.fillStyle = tint;
  rr(ctx, 64, y, 100, 100, 16);
  ctx.fill();
  if (wpi) ctx.drawImage(wpi, 68, y + 4, 92, 92);
  ctx.textAlign = 'left';
  ctx.font = font(fonts.bold, 34);
  ctx.fillStyle = INK;
  ctx.fillText(d.wp.name, 188, y + 42);
  const ww = ctx.measureText(d.wp.name).width;
  if (d.wp.r != null) {
    ctx.font = font(fonts.bold, 26);
    const rt = `R${d.wp.r}`;
    ctx.fillStyle = ac;
    rr(ctx, 188 + ww + 14, y + 12, ctx.measureText(rt).width + 22, 38, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(rt, 188 + ww + 25, y + 40);
  }
  ctx.font = font(fonts.body, 26);
  ctx.fillStyle = SUB;
  ctx.fillText(`Lv.${d.wp.lv}　${d.wp.sub || ''}`, 188, y + 84);
  y += 124;

  // ---- 聖遺物
  const setTxt = d.sets.filter(([, c]) => c).map(([n, c]) => `${n}×${c}`).join('　');
  head(tr('artifacts'), y + 24);
  ctx.font = font(fonts.body, 24);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  if (d.showScore ?? d.showOp) {
    // 合計スコアだけ色付き
    ctx.font = font(fonts.bold, 30);
    ctx.fillStyle = ac;
    ctx.textAlign = 'right';
    ctx.fillText(d.total.toFixed(1), W - 64, y + 24);
    const tw = ctx.measureText(d.total.toFixed(1)).width;
    ctx.font = font(fonts.serif, 24);
    ctx.fillStyle = SUB;
    ctx.fillText(`${d.base} ${tr('standard')}`, W - 64 - tw - 14, y + 24);
  }
  // セット名はスコアと別の行にし、2セットずつでも重ねず全部表示する。
  ctx.font = font(fonts.body, 24);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText(setTxt, 64, y + 58, W - 128);
  y += 78;

  const TW = (W - 128 - 4 * 12) / 5, TH = 320;
  d.relics.forEach((r, i) => {
    const x = 64 + i * (TW + 12);
    ctx.fillStyle = '#FAFAFA';
    rr(ctx, x, y, TW, TH, 16);
    ctx.fill();
    const im = ris[i];

    // OPなし＝画像だけ大きめに真ん中
    if (!d.showOp) {
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.arc(x + TW / 2, y + TH / 2, 64, 0, Math.PI * 2);
      ctx.fill();
      if (im) ctx.drawImage(im, x + TW / 2 - 70, y + TH / 2 - 70, 140, 140);
      return;
    }

    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(x + TW / 2, y + 56, 44, 0, Math.PI * 2);
    ctx.fill();
    if (im) ctx.drawImage(im, x + TW / 2 - 46, y + 10, 92, 92);
    if (!r.main) return;

    ctx.textAlign = 'center';
    ctx.font = font(fonts.bold, 24);
    ctx.fillStyle = INK;
    ctx.fillText(r.main, x + TW / 2, y + 136);
    ctx.font = font(fonts.body, 20);
    ctx.fillStyle = '#666';
    r.subs.forEach((s, j) => ctx.fillText(s, x + TW / 2, y + 172 + j * 30));

    if (d.showScore ?? d.showOp) {
      ctx.font = font(fonts.bold, 32);
      ctx.fillStyle = r.best ? ac : SUB;
      ctx.fillText(r.score.toFixed(1), x + TW / 2, y + TH - 22);
    }
  });
  y += TH;

  // フッター
  ctx.font = font(fonts.body, 20);
  ctx.fillStyle = '#B5B5B5';
  ctx.textAlign = 'right';
  ctx.fillText(`UID ${d.uid}　bot_chan × Enka.Network`, W - 64, H - 24);

  return cv.toBuffer('image/png');
}

module.exports = { charCard, EL, fontFamilies };
