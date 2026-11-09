const { createCanvas, loadImage } = require('@napi-rs/canvas');

// 画像は名刺・アイコンと展示キャラのみ。UIDやランクなどはDiscord Embedに残す。
async function image(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return null;
    return loadImage(Buffer.from(await response.arrayBuffer()));
  } catch { return null; }
}
function rounded(ctx,x,y,w,h,r) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.clip();
}
async function charRow(list, options = {}) {
  const entries = list.slice(0, 12);
  const cols = 4, size = 94, gap = 12, cellH = 120;
  const width = 640, headerH = options.namecard || options.avatar ? 168 : 0;
  const rows = Math.ceil(entries.length / cols);
  const height = headerH + (rows ? 30 + rows * cellH + 12 : 0);
  if (!height) return null;
  const cv = createCanvas(width, height), ctx = cv.getContext('2d');
  const [banner, avatar, ...icons] = await Promise.all([image(options.namecard),image(options.avatar),...entries.map(e=>image(e.url))]);
  ctx.fillStyle = '#20232d';ctx.fillRect(0,0,width,height);
  if (headerH) {
    if (banner) {
      const scale = Math.max(width/banner.width,headerH/banner.height);
      ctx.drawImage(banner,(width-banner.width*scale)/2,(headerH-banner.height*scale)/2,banner.width*scale,banner.height*scale);
    } else {
      ctx.fillStyle = '#34465c';ctx.fillRect(0,0,width,headerH);
    }
    ctx.fillStyle='rgba(13,19,30,.28)';ctx.fillRect(0,0,width,headerH);
    if (avatar) {
      ctx.save();rounded(ctx,24,24,120,120,60);
      ctx.drawImage(avatar,24,24,120,120);ctx.restore();
      ctx.strokeStyle='#f0dba8';ctx.lineWidth=4;ctx.beginPath();ctx.arc(84,84,62,0,Math.PI*2);ctx.stroke();
    }
  }
  if (rows) {
    ctx.fillStyle='#e6e8ee';ctx.font='bold 19px "NotoSansJP-Black", sans-serif';ctx.textAlign='left';
    ctx.fillText('キャラクター展示',20,headerH+24);
    entries.forEach((entry,i)=>{
      const x=20+(i%cols)*(size+gap),y=headerH+35+Math.floor(i/cols)*cellH;
      ctx.fillStyle='#333c4b';ctx.beginPath();ctx.roundRect(x,y,size,size,12);ctx.fill();
      const icon=icons[i];
      if(icon){ctx.save();rounded(ctx,x,y,size,size,12);ctx.drawImage(icon,x,y,size,size);ctx.restore();}
      ctx.fillStyle='#e6e8ee';ctx.font='bold 15px "NotoSansJP-Black", sans-serif';ctx.textAlign='center';
      const level=entry.lv!=null?'Lv.'+entry.lv:'Lv.?';
      const constellation=entry.c!=null?' C'+entry.c:'';
      ctx.fillText(level+constellation,x+size/2,y+size+18);
    });
  }
  return cv.toBuffer('image/png');
}
module.exports = { charRow };
