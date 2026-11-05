const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { jstToday, generateWelcomeImage } = require('./imageGenerator');
const st = require('./store');

const ROLE = '1496147336043298866';
const REMIND = '08:15';

// d.welcome = { 'YYYY-MM-DD': { ch, msg, ping, guests: [...], rem } }

const nm = g => g.name.replace(/　様$/, '様');
const mmdd = dt => dt;
const todayStr = () => { const t = jstToday(); return `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`; };
const nowHM = () => new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });

function line(g) {
  const [, m, d] = g.date.split('-').map(Number);
  const [h, mi] = g.time.split(':');
  return `${nm(g)}が${m}月${d}日${+h}時${mi}分にご来社の予定です`;
}

async function img(dt, guests) {
  const buf = await generateWelcomeImage({ guests }, 1920, 1080);
  return new AttachmentBuilder(buf, { name: `${mmdd(dt)}.jpg` });
}

// 来場予約の投稿を受けたとき
async function handle(message, parsed) {
  const g = message.guild;
  const d = st.get(g.id);
  if (!d.welcome) d.welcome = {};

  // 日付ごとに分ける
  const byDate = {};
  for (const x of parsed.guests) (byDate[x.date] ||= []).push(x);

  const color = message.member?.roles?.color?.hexColor ?? '#808080';
  const td = todayStr();

  for (const [dt, nw] of Object.entries(byDate)) {
    const old = d.welcome[dt];
    const prev = old ? old.guests : [];

    // 同じ時間・名前は重複させない
    const all = [...prev];
    for (const x of nw) if (!all.some(a => a.time === x.time && a.name === x.name)) all.push(x);
    all.sort((a, b) => a.time.localeCompare(b.time));

    let txt = `<@${message.author.id}> がWelcomeを作成しました\n` + nw.map(line).join('\n');
    if (prev.length) txt += `\n${prev.map(nm).join('・')}と同日のためWelcomeを統合しました`;

    const file = await img(dt, all);
    const emb = new EmbedBuilder()
      .setColor(color)
      .setDescription(txt)
      .setImage(`attachment://${mmdd(dt)}.jpg`);

    const m1 = await message.reply({ embeds: [emb], files: [file] });
    const m2 = await message.channel.send(`<@&${ROLE}>`);

    // 前のは消す
    if (old) {
      const ch = await message.client.channels.fetch(old.ch).catch(() => null);
      if (ch) {
        await ch.messages.delete(old.msg).catch(() => null);
        if (old.ping) await ch.messages.delete(old.ping).catch(() => null);
      }
    }

    // 今日の8:15過ぎに入れた分はリマインド済み扱い
    const rem = old?.rem || (dt === td && nowHM() >= REMIND);
    d.welcome[dt] = { ch: message.channelId, msg: m1.id, ping: m2.id, guests: all, rem };
  }

  await st.save(g);
}

// 毎分呼ぶ 当日8:15にリマインド、過ぎた日付は掃除
async function tick(client, now) {
  const td = todayStr();

  for (const [gid, d] of st.db) {
    if (!d.welcome) continue;
    const g = client.guilds.cache.get(gid);
    if (!g) continue;
    let dirty = false;

    for (const [dt, w] of Object.entries(d.welcome)) {
      if (dt < td) { delete d.welcome[dt]; dirty = true; continue; }
      if (dt !== td || w.rem || now < REMIND) continue;

      w.rem = true;
      dirty = true;
      const ch = await client.channels.fetch(w.ch).catch(() => null);
      if (!ch) continue;

      try {
        await ch.send({
          content: `<@&${ROLE}> 今日は ${w.guests.map(nm).join('・')} がご来社予定だよ！`,
          files: [await img(dt, w.guests)],
          reply: { messageReference: w.msg, failIfNotExists: false },
        });
      } catch (e) {
        console.error('リマインド失敗:', e.message);
      }
    }

    if (dirty) await st.save(g);
  }
}

module.exports = { handle, tick };
