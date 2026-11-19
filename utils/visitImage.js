const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('node:path');
const fs = require('node:fs');

const font = path.join(__dirname, '..', 'node_modules', '@fontsource', 'noto-sans-jp', 'files', 'noto-sans-jp-japanese-400-normal.woff');
if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'VisitJapanese');
const family = 'VisitJapanese, "Yu Gothic", Meiryo, sans-serif';

function wrap(context, text, width) {
  const lines = [];
  let line = '';
  for (const character of text) {
    if (line && context.measureText(line + character).width > width) { lines.push(line); line = ''; }
    line += character;
  }
  if (line) lines.push(line);
  return lines;
}

async function render(venueName, schedule) {
  const padding = 32, clockWidth = 100, columnWidth = 380;
  const width = padding * 2 + clockWidth + columnWidth * schedule.dates.length;
  const measure = createCanvas(1, 1).getContext('2d');
  measure.font = `23px ${family}`;
  const rows = schedule.times.map(time => {
    const cells = schedule.dates.map(date => schedule.bookings.filter(item => item.date === date && item.time === time)
      .flatMap(item => wrap(measure, item.name + ' 様', columnWidth - 36)));
    return { time, cells, height: Math.max(48, ...cells.map(lines => lines.length * 31 + 20)) };
  });
  measure.font = `bold 30px ${family}`;
  const title = wrap(measure, '来場予約一覧_' + venueName, width - padding * 2);
  const titleHeight = title.length * 44 + 28;
  const tableTop = padding + titleHeight;
  const height = tableTop + 66 + rows.reduce((sum, row) => sum + row.height, 0) + padding;
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2f5f8'; ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'middle';
  ctx.font = `bold 30px ${family}`; ctx.fillStyle = '#173247';
  title.forEach((line, index) => ctx.fillText(line, padding, padding + 23 + index * 44));
  ctx.fillStyle = '#173f51'; ctx.fillRect(padding, tableTop, width - padding * 2, 66);
  ctx.fillStyle = '#ffffff'; ctx.font = `bold 23px ${family}`;
  ctx.fillText('時間', padding + 23, tableTop + 33);
  schedule.dates.forEach((date, index) => {
    const day = new Date(date + 'T00:00:00Z');
    const label = `${day.getUTCMonth() + 1}月${day.getUTCDate()}日（${'日月火水木金土'[day.getUTCDay()]}）`;
    ctx.fillText(label, padding + clockWidth + columnWidth * index + 18, tableTop + 33);
  });
  let y = tableTop + 66;
  for (const [index, row] of rows.entries()) {
    ctx.fillStyle = index % 2 ? '#f7f9fb' : '#ffffff';
    ctx.fillRect(padding, y, width - padding * 2, row.height);
    ctx.font = `22px ${family}`; ctx.fillStyle = '#536577';
    ctx.fillText(row.time, padding + 18, y + row.height / 2);
    row.cells.forEach((lines, column) => {
      const x = padding + clockWidth + columnWidth * column;
      if (lines.length) { ctx.fillStyle = '#e3f3ee'; ctx.fillRect(x + 5, y + 4, columnWidth - 10, row.height - 8); }
      ctx.fillStyle = '#163f36'; ctx.font = `23px ${family}`;
      lines.forEach((line, n) => ctx.fillText(line, x + 18, y + 10 + n * 31 + 15));
      ctx.strokeStyle = '#d9e1e7'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + row.height); ctx.stroke();
    });
    ctx.strokeStyle = '#d9e1e7'; ctx.beginPath(); ctx.moveTo(padding, y + row.height); ctx.lineTo(width - padding, y + row.height); ctx.stroke();
    y += row.height;
  }
  return canvas.encode('png');
}

module.exports = { render };
