const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const st = require('./store');
const { isAdmin, deny } = require('./perm');

// DISBOARDのbumpリマインド
const DIS = '302050872383242240';
const WAIT = 2 * 60 * 60;  // 2時間
const COLOR = '#5F5E5A';
const queues = new Map(), movers = new Map();
function serial(id, run) {
  const next = (queues.get(id) || Promise.resolve()).catch(() => null).then(run);
  queues.set(id, next);
  const clear = () => { if (queues.get(id) === next) queues.delete(id); };
  next.then(clear, clear);
  return next;
}

const box = t => new EmbedBuilder().setColor(COLOR).setDescription(t);

// DISBOARDの「表示順をアップしたよ」
function isBump(m) {
  if (m.author?.id !== DIS) return false;
  const t = m.embeds?.map(e => `${e.description || ''} ${e.title || ''}`).join(' ') || '';
  return /アップしたよ|Bump done/i.test(t);
}

const who = m => m.interactionMetadata?.user?.id || m.interaction?.user?.id || null;

// 既存の案内を編集する。消えている場合だけ通知音なしで投稿する。
async function put(ch, b, opt, notify = false, move = false) {
  const payload = { content: notify ? '@here' : '', ...opt, allowedMentions: { parse: notify ? ['everyone'] : [] } };
  const old = b.msg && await ch.messages.fetch(b.msg).catch(() => null);
  if (!notify && !move && old && await old.edit(payload).catch(() => null)) return true;
  // メッセージ編集ではメンション通知されないため、ONの場合だけ新規投稿。
  const m = await ch.send({ ...payload, ...(!notify ? { flags: MessageFlags.SuppressNotifications } : {}) }).catch(e => { console.error('bump投稿失敗:', e.message); return null; });
  if (!m) return false;
  b.msg = m.id;
  if (old) await old.delete().catch(() => null);
  return true;
}

function countMsg(at, uid) {
  const n = Math.floor(at / 1000) + WAIT;
  return { embeds: [box(`${uid ? `<@${uid}> がbumpしてくれたよ！\n` : ''}次にbumpできるのは <t:${n}:R>（<t:${n}:t>）`)], allowedMentions: { parse: [] } };
}

function current(b) {
  if (b.at && Date.now() / 1000 < Math.floor(b.at / 1000) + WAIT) return countMsg(b.at, b.by);
  return { embeds: [box(b.at ? 'bumpできるよ！ DISBOARDの `/bump` を実行してね' : 'まだbumpの記録がないよ。DISBOARDの `/bump` を実行してね')] };
}

async function place(ch) {
  return serial(ch.guildId, async () => {
    const b = st.get(ch.guildId).bump;
    if (!b || b.ch !== ch.id) return;
    // 貼り直しでは期限・通知済みフラグを変えず、メンションも送らない。
    if (await put(ch, b, current(b), false, true)) st.saveLater(ch.guild, 3000);
  });
}

function schedule(ch) {
  clearTimeout(movers.get(ch.id));
  const timer = setTimeout(() => {
    movers.delete(ch.id);
    place(ch).catch(e => console.error('bump常駐エラー:', e.message));
  }, 1000);
  timer.unref?.(); movers.set(ch.id, timer);
}

// bumpされた時
async function on(m) {
  return serial(m.guildId, async () => {
  const d = st.get(m.guildId);
  const b = d.bump;
  if (!b?.ch || b.ch !== m.channelId || !isBump(m)) return;
  b.at = m.createdTimestamp;
  b.rem = false;
  b.by = who(m);
  await put(m.channel, b, countMsg(b.at, b.by), false, true);
  await st.save(m.guild);
  });
}

// /setbump
async function set(i) {
  if (!isAdmin(i)) return deny(i);
  await i.deferReply({ ephemeral: true });
  return serial(i.guildId, async () => {
  const d = st.get(i.guildId);
  const here = i.options?.getBoolean('here') ?? d.bump?.here ?? false;
  if (here && !i.channel.permissionsFor(i.guild.members.me)?.has(PermissionFlagsBits.MentionEveryone)) {
    return i.editReply('⚠️ @hereを付けるには、このチャンネルでBotの「@everyone、@here、すべてのロールにメンション」権限を許可してください。通知なしにする場合は `/setbump here:False` を実行してください。');
  }
  // 別のチャンネルから移す時は前の投稿を消す
  if (d.bump?.ch && d.bump.ch !== i.channelId && d.bump.msg) {
    await i.guild.channels.cache.get(d.bump.ch)?.messages.delete(d.bump.msg).catch(() => null);
  }
  const previous = d.bump;
  const b = d.bump = { ch: i.channelId, msg: previous?.ch === i.channelId ? previous.msg : null, at: previous?.ch === i.channelId ? previous.at : null, by: previous?.ch === i.channelId ? previous.by : null, rem: false, here };

  // 最後のbumpを履歴から探す
  const ms = await i.channel.messages.fetch({ limit: 100 }).catch(() => null);
  const last = ms && [...ms.values()].find(isBump);

  if (last) {
    b.at = last.createdTimestamp;
    b.by = who(last);
    if (Date.now() / 1000 >= Math.floor(b.at / 1000) + WAIT) {
      b.rem = true;
      await put(i.channel, b, { embeds: [box('bumpできるよ！ `/bump` してね')] }, false, true);
    } else {
      await put(i.channel, b, countMsg(b.at, who(last)), false, true);
    }
  } else if (b.at && Date.now() / 1000 < Math.floor(b.at / 1000) + WAIT) {
    await put(i.channel, b, countMsg(b.at, b.by), false, true);
  } else {
    b.rem = true;
    await put(i.channel, b, { embeds: [box('まだbumpの記録がないよ。`/bump` してね')] }, false, true);
  }

  if (!await st.save(i.guild)) return i.editReply(`⚠️ bumpの設定を保存できませんでした。${st.warn(i.guild)}\n/setup で保存先を確認してから再設定してください。`);
  return require('./feedback').done(i, { embeds: [box(`✅ このチャンネルの一番下にbumpの案内を常駐するよ。\n@here通知：${here ? 'ON（時間になったときだけ）' : 'OFF'}${st.warn(i.guild)}`)] });
  });
}

// 毎分：時間になったらリマインド
async function tick(client) {
  const now = Date.now() / 1000;
  for (const g of client.guilds.cache.values()) {
    const b = st.get(g.id).bump;
    if (!b?.ch || !b.at || b.rem) continue;
    if (now < Math.floor(b.at / 1000) + WAIT) continue;
    const ch = g.channels.cache.get(b.ch);
    if (!ch) continue;
    await serial(g.id, async () => {
      if (st.get(g.id).bump !== b || b.rem || now < Math.floor(b.at / 1000) + WAIT) return;
      b.rem = await put(ch, b, { embeds: [box('bumpできるよ！ DISBOARDの `/bump` を実行してね')] }, b.here === true);
      await st.save(g);
    });
  }
}

async function configure(ch, here = false) {
  const guild = ch.guild;
  const me = guild.members.me || await guild.members.fetchMe();
  const P = PermissionFlagsBits;
  if (!ch.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory]))
    throw new Error('Botにチャンネルの閲覧・送信・埋め込み・履歴閲覧権限が必要です。');
  if (here && !ch.permissionsFor(me)?.has(P.MentionEveryone))
    throw new Error('@here通知にはメンション権限が必要です。');
  return serial(guild.id,async()=>{
    const d=st.get(guild.id),previous=d.bump;
    if(previous?.ch && previous.ch!==ch.id && previous.msg){
      const old=await guild.channels.fetch(previous.ch).catch(()=>null);
      await old?.messages.delete(previous.msg).catch(()=>null);
    }
    const b=d.bump={ch:ch.id,msg:previous?.ch===ch.id?previous.msg:null,at:previous?.ch===ch.id?previous.at:null,
      by:previous?.ch===ch.id?previous.by:null,rem:false,here};
    const messages=await ch.messages.fetch({limit:100}).catch(()=>null);
    const last=messages && [...messages.values()].find(isBump);
    if(last){b.at=last.createdTimestamp;b.by=who(last);}
    if(b.at && Date.now()/1000<Math.floor(b.at/1000)+WAIT){
      await put(ch,b,countMsg(b.at,b.by),false,true);
    }else{
      b.rem=true;
      await put(ch,b,{embeds:[box(b.at?'bumpできるよ！ DISBOARDの \`/bump\` を実行してね':'まだbumpの記録がないよ。 DISBOARDの \`/bump\` を実行してね')]},false,true);
    }
    if(!await st.save(guild))throw new Error('Bump設定を保存できませんでした。');
    return b;
  });
}
module.exports = { set, on, tick, isBump, place, schedule, configure };
