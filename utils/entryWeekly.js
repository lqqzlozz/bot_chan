const st = require('./store');
const { GUILD } = require('./entryScope');
const { panel, profiles, serialize } = require('./entryPanel');

const clock = new Intl.DateTimeFormat('en-CA', {
  timeZone:'Asia/Tokyo', weekday:'short', year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', hourCycle:'h23'
});

function resetDate(now) {
  const parts = Object.fromEntries(clock.formatToParts(now).map(({type,value}) => [type,value]));
  return parts.weekday === 'Mon' && parts.hour === '08' ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

async function save(guild) {
  if (!await st.save(guild)) throw new Error('bot-configに週次募集の状態を保存できませんでした。');
}

async function resetChannel(guild, config, channelId, date) {
  const data = config.entry[channelId];
  if (!data?.msg) return;
  const history = config.entryWeekly ??= {};
  let state = history[channelId];
  if (state?.date === date && (state.done || state.messageId !== data.msg)) return;
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(data.msg);
  if (state?.date !== date) {
    profiles(guild.id);
    state = {
      date, messageId:data.msg, phase:'reset',
      users:[...new Set(data.participants.map(p => p.id))], sent:0
    };
    history[channelId] = state;
    await save(guild);
  }
  if (state.phase === 'reset') {
    const role = await guild.roles.fetch(data.roleId);
    if (!role) throw new Error('参加者ロールが見つかりません。');
    for (const id of state.users) {
      try {
        const member = await guild.members.fetch(id);
        if (member.roles.cache.has(role.id)) await member.roles.remove(role);
      } catch (error) {
        if (error.code !== 10007) throw error;
      }
    }
    data.participants = [];
    delete data.teamMessageId;
    state.phase = 'announce';
    await save(guild);
  }
  await message.edit(panel(data));
  const chunks = Math.max(1, Math.ceil(state.users.length / 50));
  while (state.sent < chunks) {
    const users = state.users.slice(state.sent * 50, (state.sent + 1) * 50);
    const mentions = users.map(id => '<@'+id+'>').join(' ');
    await channel.send({
      content: [mentions,'今週も振り分けをお願いしたい人は、下のボタンを押してね！'].filter(Boolean).join('\n'),
      allowedMentions: { parse:[], users },
      components: [{type:1, components:[{
        type:2, style:1, label:'今週も参加する', custom_id:'entry_week_join_'+data.msg+'_'+date
      }]}]
    });
    state.sent++;
    await save(guild);
  }
  state.done = true;
  await save(guild);
}

let running = false;
async function tick(client, now = new Date()) {
  const date = resetDate(now);
  const guild = date && client.guilds.cache.get(GUILD);
  if (!guild || running) return;
  running = true;
  try {
    const config = st.get(guild.id);
    for (const channelId of Object.keys(config.entry)) {
      await serialize(channelId, () => resetChannel(guild, config, channelId, date)).catch(error => {
        if (![10003,10008].includes(error.code)) console.error('大会募集の週次更新に失敗:', error.message);
      });
    }
  } finally { running = false; }
}

module.exports = { tick };
