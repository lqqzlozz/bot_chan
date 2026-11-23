const { createHash } = require('node:crypto');
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

async function deletePrevious(guild, channel, state, activeId) {
  const previousId = state.previousMessageId;
  if (!previousId) return;
  if (previousId !== activeId) {
    try {
      const previous = await channel.messages.fetch(previousId);
      if (previous.author.id === guild.client.user.id) await previous.delete();
    } catch (error) {
      if (error.code !== 10008) throw error;
    }
  }
  delete state.previousMessageId;
  await save(guild);
}

async function resetChannel(guild, config, channelId, date) {
  const data = config.entry[channelId];
  if (!data?.msg) return;
  const history = config.entryWeekly ??= {};
  let state = history[channelId];
  const renewalDate = date || (state?.postedMessageId && state.date);
  const renewing = renewalDate && !(state?.date === renewalDate && (state.done || state.messageId !== data.msg));
  if (!renewing && !state?.previousMessageId) return;
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased()) return;
  if (!renewing) return deletePrevious(guild, channel, state, data.msg);
  if (state?.date !== renewalDate) {
    profiles(guild.id);
    state = {
      date:renewalDate, messageId:data.msg, phase:'reset',
      users:[...new Set(data.participants.map(p => p.id))]
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
  const previousId = data.msg;
  if (!state.postedMessageId) {
    const nonce = createHash('sha256').update(`entry-week:${channelId}:${renewalDate}`).digest('hex').slice(0,24);
    const message = await channel.send({
      ...panel(data),
      content: '@everyone',
      allowedMentions: { parse:['everyone'] },
      nonce,
      enforceNonce: true
    });
    state.postedMessageId = message.id;
  }
  const completed = { date: renewalDate, messageId: state.postedMessageId, previousMessageId: previousId, done: true };
  data.msg = completed.messageId;
  history[channelId] = completed;
  try {
    await save(guild);
  } catch (error) {
    data.msg = previousId;
    history[channelId] = state;
    throw error;
  }
  await deletePrevious(guild, channel, completed, data.msg);
}

let running = false;
async function tick(client, now = new Date()) {
  const date = resetDate(now);
  const guild = client.guilds.cache.get(GUILD);
  if (!guild || running) return;
  const config = st.get(guild.id);
  if (!date && !Object.values(config.entryWeekly || {}).some(state => state.previousMessageId || state.postedMessageId)) return;
  running = true;
  try {
    for (const channelId of Object.keys(config.entry)) {
      await serialize(channelId, () => resetChannel(guild, config, channelId, date)).catch(error => {
        if (![10003,10008].includes(error.code)) console.error('大会募集の週次更新に失敗:', error.message);
      });
    }
  } finally { running = false; }
}

module.exports = { tick };
