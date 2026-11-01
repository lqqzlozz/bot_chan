const { EmbedBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { randomBytes } = require('crypto');
const st = require('./store');
const { isOwner } = require('./perm');
const DAY = 86400000, GRACE = 7 * DAY;
const running = new Set(), flush = new Map();
const buttonLocks = new Set();
const locked = (gid, uid) => buttonLocks.has(`${gid}:${uid}`);
function clearWarning(u) {
  for (const key of ['warningAt', 'warningToken', 'warningJoinedAt', 'warningMonths', 'warningRole', 'confirmToken', 'confirmUntil', 'dmFailedAt']) delete u[key];
}

async function managedRole(guild, id) {
  const role = await guild.roles.fetch(id);
  if (!guild.members.me?.permissions.has(P.ManageRoles) || !role || role.id === guild.id || role.managed || !role.editable) throw new Error('指定ロールを操作できません。Botのロール管理権限とロールの上下関係を確認してください。');
  return role;
}

async function restore(member, u, id) {
  const role = await managedRole(member.guild, id);
  await member.roles.add(role, '非アクティブ管理：参加継続・活動再開による指定ロール付与');
  delete u.suspendedRole; delete u.restoreRole; delete u.restoreFailedAt;
}

async function restoreSuspended(guild, s) {
  let failed = 0;
  for(const u of Object.values(s.users||{})){
   if(u.approvalMessage)await (guild.channels.cache.get(s.approvalChannelId)||st.findCh(guild))?.messages.delete(u.approvalMessage).catch(()=>null);
   delete u.approvalMessage;delete u.approvalToken;
  }
  for (const [id, u] of Object.entries(s.users)) {
    const role = u.restoreRole || u.suspendedRole;
    if (!role) continue;
    const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
    if (!member) { failed++; continue; }
    try { await restore(member, u, role); clearWarning(u); }
    catch (e) { failed++; await log(guild, s, `<@${id}> のロール再付与に失敗しました：${e.message}`).catch(() => null); }
  }
  return failed;
}

function buttons(gid, uid, token, confirm = false) {
  const button = (action, label, style) => new ButtonBuilder().setCustomId(`ia_${action}_${gid}_${uid}_${token}`).setLabel(label).setStyle(style);
  return [new ActionRowBuilder().addComponents(...(confirm ? [
    button('confirm', '退出を確定する', ButtonStyle.Danger), button('back', '戻る', ButtonStyle.Secondary),
  ] : [button('keep', '参加を続ける', ButtonStyle.Success), button('leave', '退出する', ButtonStyle.Secondary)]))];
}

function warning(guild, member, u) {
 const months=u.warningMonths||3;
 return {
  embeds:[new EmbedBuilder().setColor('#BA7517').setTitle(guild.name+'：参加意思の確認').setDescription(
   months+'か月間、発言・VC参加を確認できていません。\\n当サーバーは一定の期間活動されない方を整理していく方針です。\\n\\n'+
   '**参加を続ける**：参加継続の意思があるとみなします。今後の活動を楽しみにしています！\\n'+
   '**退出する**：確認画面を出し、確定後にキックします。\\n\\n'+
   '発言・VC参加でもキックの確認予定は解除されます。\\n\\n'+
   'このメッセージに反応がない場合、7日後にサーバー管理者へキックの確認通知が届きます。**管理者の承認なしに自動キックされることはありません。**'
  )],
  components:buttons(guild.id,member.id,u.warningToken),allowedMentions:{parse:[]}
 };
}

// 月末は移動先の月末に丸める。日時は日本時間で扱う。
function threeMonths(at, months = 3) {
  const d = new Date(at + 9 * 3600000);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return d.getTime() - 9 * 3600000;
}

function record(guild, user, at = Date.now()) {
  const s = st.get(guild.id).inactive;
  if (!s?.enabled || user.bot) return;
  const u = s.users[user.id] ||= {};
  u.at = Math.max(u.at || 0, at);
  if (u.suspendedRole) u.restoreRole = u.suspendedRole;
  if(u.approvalMessage) st.findCh(guild)?.messages.delete(u.approvalMessage).catch(()=>null);
  delete u.approvalToken;delete u.approvalMessage;
  clearWarning(u);
  if (!flush.has(guild.id)) {
    const t = setTimeout(() => { flush.delete(guild.id); st.save(guild); }, 60000);
    t.unref?.(); flush.set(guild.id, t);
  }
}

function eligible(member, s, now) {
  if (member.user.bot || member.id === member.guild.ownerId || isOwner(member) || member.permissions.has(P.Administrator)) return false;
  if (s.exclude && member.roles.cache.has(s.exclude)) return false;
  if (!member.joinedTimestamp || member.voice?.channelId || !member.kickable) return false;
  const u = s.users[member.id] || {};
  if (u.restoreRole) return false;
  return now >= threeMonths(Math.max(s.since, member.joinedTimestamp, u.at || 0), s.months || 3);
}

async function log(guild, s, text) {
  const ch = guild.channels.cache.get(s.log);
  if (!ch) throw new Error('活動監視のログ送信先がありません');
  await ch.send({ embeds: [new EmbedBuilder().setColor('#BA7517').setTitle('非アクティブ管理').setDescription(text)], allowedMentions: { parse: [] } });
}

async function persist(guild, s) {
  if (await st.save(guild)) return true;
  s.enabled = false;
  await log(guild, s, '⚠️ 設定を保存できないため、自動キックを停止しました。#bot-config を確認してから再度有効化してください。').catch(() => null);
  return false;
}

async function issueWarning(guild, member, s, u, now) {
  if (u.roleFailureAt && now - u.roleFailureAt < DAY) return;
  let role;
  try { if (s.role) role = await managedRole(guild, s.role); }
  catch (e) {
    u.roleFailureAt = now;
    await log(guild, s, `<@${member.id}>：${e.message} 警告・ロール剥奪・キックは行いません。`);
    await persist(guild, s); return;
  }
  const key = `${guild.id}:${member.id}`;
  buttonLocks.add(key);
  const observed = u.at || 0, token = randomBytes(8).toString('hex');
  u.warningAt = now; u.warningToken = token; u.warningJoinedAt = member.joinedTimestamp; u.warningMonths = s.months || 3;
  if (role) u.warningRole = role.id;
  try {
    try { await member.send(warning(guild, member, u)); }
    catch {
      clearWarning(u); u.dmFailedAt = now;
      await log(guild, s, `<@${member.id}>：警告DMを送信できないため、ロール剥奪・キックは行いません。`);
      await persist(guild, s); return;
    }
    if ((u.at || 0) !== observed || u.warningToken !== token || !s.enabled) return;
    if (role && member.roles.cache.has(role.id)) {
      // 剥奪前に復元用の情報を保存する。
      u.suspendedRole = role.id;
      if (!await persist(guild, s)) return;
      if ((u.at || 0) !== observed || u.warningToken !== token || !s.enabled) { await restore(member, u, role.id); return; }
      try { await member.roles.remove(role, '非アクティブ管理：参加意思確認のため指定ロールを一時解除'); }
      catch (e) {
        delete u.suspendedRole; clearWarning(u); u.roleFailureAt = now;
        await log(guild, s, `<@${member.id}> のロール解除に失敗したため、キック予定を取り消しました：${e.message}`);
        await persist(guild, s); return;
      }
      if ((u.at || 0) !== observed || u.warningToken !== token || !s.enabled) { await restore(member, u, role.id); await persist(guild, s); return; }
    }
    delete u.roleFailureAt; delete u.dmFailedAt;
    if (!await persist(guild, s)) return;
    await log(guild, s, `<@${member.id}> に参加意思確認のDMを送りました。${role ? `指定ロール：<@&${role.id}>（持っていた場合は解除済み）。` : ''}7日後に管理者へ確認を依頼します。管理者の承認なしにキックされることはありません。`);
  } finally { buttonLocks.delete(key); }
}

async function sweep(guild, now = Date.now()) {
  const s = st.get(guild.id).inactive;
  if (!s?.enabled || running.has(guild.id)) return;
  running.add(guild.id);
  try {
    // 記録していない時間を「活動なし」とみなさない。
    if (now - s.seenAt > 15 * 60000) {
      s.since = now;
      for (const u of Object.values(s.users)) { if (u.suspendedRole) u.restoreRole = u.suspendedRole; clearWarning(u); }
      await log(guild, s, `BOTが15分以上活動を確認できなかったため、判定期間を今日から${s.months || 3}か月にリセットしました。`);
    }
    s.seenAt = now;
    if (!await persist(guild, s)) return;
    // 活動再開・停止後の復元は、1時間ごとの候補判定を待たずに処理する。
    let recoveryChanged = false;
    for (const [uid, u] of Object.entries(s.users)) {
      if (!u.restoreRole || locked(guild.id, uid) || (u.restoreFailedAt && now - u.restoreFailedAt < 3600000)) continue;
      const member = await guild.members.fetch({ user: uid, force: true }).catch(() => null);
      if (!member) continue;
      try { await restore(member, u, u.restoreRole); }
      catch (e) { u.restoreFailedAt = now; await log(guild, s, `<@${uid}> のロール再付与に失敗しました：${e.message}`); }
      recoveryChanged = true;
    }
    if (recoveryChanged && !await persist(guild, s)) return;
    if (now - (s.checkedAt || 0) < 3600000) return;
    // ログが送れない状態では警告・キックを進めない。
    const channel = guild.channels.cache.get(s.log);
    if (!channel?.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) return;
    const members = await guild.members.fetch();
    for (const m of members.values()) if (!m.user.bot && m.voice?.channelId) record(guild, m.user, now);
    for (const m of members.values()) {
      if (!s.enabled) break;
      if (locked(guild.id, m.id)) continue;
      if (s.users[m.id]?.restoreRole) {
        continue;
      }
      if (!eligible(m, s, now)) {
        if (s.users[m.id]) {
          if (s.users[m.id].suspendedRole) s.users[m.id].restoreRole = s.users[m.id].suspendedRole;
          if(s.users[m.id].approvalMessage)(guild.channels.cache.get(s.approvalChannelId)||st.findCh(guild))?.messages.delete(s.users[m.id].approvalMessage).catch(()=>null);
          delete s.users[m.id].approvalMessage;delete s.users[m.id].approvalToken;
          clearWarning(s.users[m.id]);
        }
        continue;
      }
      const u = s.users[m.id] ||= {};
      if (!u.warningAt || !u.warningToken) {
        if (u.dmFailedAt && now - u.dmFailedAt < DAY) continue;
        await issueWarning(guild, m, s, u, now);
        continue;
      }
      if (now < u.warningAt + GRACE) continue;
      // 直前の再取得後も、除外・参加日・VC・最新の発言時刻を再判定する。
      const fresh = await guild.members.fetch({ user: m.id, force: true }).catch(() => null);
      if (!fresh || !s.enabled || locked(guild.id, m.id) || !u.warningAt || !eligible(fresh, s, Date.now())) continue;
      if (!await persist(guild, s)) return;
      if (!s.enabled || locked(guild.id, m.id) || !u.warningAt || !eligible(fresh, s, Date.now())) continue;
      if (!u.approvalToken) {
        const channel = guild.channels.cache.get(s.approvalChannelId)||st.findCh(guild);
        if (!channel) continue;
        const token = randomBytes(8).toString('hex');
        u.approvalToken = token;
        if (!await persist(guild,s)) return;
        const confirm = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ik_kick_'+m.id+'_'+token).setLabel('キックする').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ik_cancel_'+m.id+'_'+token).setLabel('見送る').setStyle(ButtonStyle.Secondary)
        );
        try{
          const msg=await channel.send({content:'**非アクティブメンバー：キック確認**\\n対象：<@'+m.id+'>\\n理由：'+(s.months||3)+'か月活動なし・警告後7日経過\\n-# 管理者が「キックする」を押すまで実行されません。',components:[confirm],allowedMentions:{parse:[]}});
          u.approvalMessage=msg.id;
          await persist(guild,s);
        }catch(e){delete u.approvalToken;await persist(guild,s);console.error('キック承認通知失敗',e.message);}
      }
      if (!await persist(guild, s)) return;
    }
    s.checkedAt = now;
    await persist(guild, s);
  } finally { running.delete(guild.id); }
}

async function handleApproval(i){
 if(!i.guild||!i.isButton())return;
 const match=/^ik_(kick|cancel)_(\\d+)_(\\w+)$/.exec(i.customId);
 if(!match)return;
 const [,action,uid,token]=match,s=st.get(i.guildId).inactive,u=s?.users?.[uid];
 if(!i.memberPermissions?.has(P.KickMembers))return i.reply({content:'キック権限のある管理者のみ操作できます。',ephemeral:true});
 if(!s?.enabled||!u?.approvalToken||u.approvalToken!==token||u.approvalMessage!==i.message.id)return i.reply({content:'この確認は無効です。',ephemeral:true});
 if(locked(i.guildId,uid))return i.reply({content:'処理中です。',ephemeral:true});
 buttonLocks.add(i.guildId+':'+uid);
 try{
  await i.deferUpdate();
  const member=await i.guild.members.fetch({user:uid,force:true}).catch(()=>null);
  if(action==='cancel'){
   delete u.approvalToken;delete u.approvalMessage;u.at=Date.now();if(u.suspendedRole)u.restoreRole=u.suspendedRole;clearWarning(u);
   await persist(i.guild,s);
   return i.message.delete().catch(()=>i.editReply({content:'見送りました。',components:[]}));
  }
  if(!member||!s.enabled||!u.warningAt||Date.now()<u.warningAt+GRACE||!eligible(member,s,Date.now())||member.joinedTimestamp!==u.warningJoinedAt){
   delete u.approvalToken;delete u.approvalMessage;await persist(i.guild,s);
   return i.message.delete().catch(()=>i.editReply({content:'活動状況が変わったため中止しました。',components:[]}));
  }
  await member.kick('管理者が非アクティブ判定と警告期間を確認して承認');
  delete s.users[uid];await persist(i.guild,s);
  await log(i.guild,s,'<@'+uid+'> を <@'+i.user.id+'> の承認によりキックしました。').catch(()=>null);
  return i.message.delete().catch(()=>i.editReply({content:'キックを実行しました。',components:[]}));
 }catch(e){console.error('管理者キック承認失敗',e);if(i.deferred)await i.followUp({content:'処理に失敗しました。',ephemeral:true}).catch(()=>null);}
 finally{buttonLocks.delete(i.guildId+':'+uid);}
}
async function tick(client) {
  for (const g of client.guilds.cache.values()) {
    if (!st.get(g.id).inactive?.enabled) continue;
    await sweep(g).catch(e => console.error(`非アクティブ管理エラー ${g.id}:`, e.message));
  }
}
async function handleButton(i, client) {
  const [, action, gid, uid, token] = i.customId.split('_');
  if (i.user.id !== uid) return i.reply({ content: 'このボタンはDMを受け取った本人だけが操作できます。', ephemeral: true });
  const guild = client.guilds.cache.get(gid);
  const s = guild && st.get(gid).inactive;
  const u = s?.users[uid];
  if (s?.enabled && u?.warningAt && action === 'confirm' && u.confirmToken === token && Date.now() >= u.confirmUntil) {
    delete u.confirmToken; delete u.confirmUntil;
    return i.update({ content: '確認画面の有効期限が切れたため、参加意思の確認に戻りました。', ...warning(guild, { id: uid }, u) });
  }
  const valid = () => s?.enabled && st.get(gid).inactive === s && u?.warningAt && (
    ['confirm', 'back'].includes(action) ? u.confirmToken === token && (action === 'back' || Date.now() < u.confirmUntil) : u.warningToken === token
  );
  const ended = text => ({ content: text, embeds: [], components: [], allowedMentions: { parse: [] } });
  if (!valid() || !['keep', 'leave', 'confirm', 'back'].includes(action)) return i.update(ended('この案内は終了しています。すでに活動したか、設定が変更された可能性があります。'));
  if (locked(gid, uid)) return i.reply({ content: '現在処理中です。数秒待ってからもう一度押してください。', ephemeral: true });
  buttonLocks.add(`${gid}:${uid}`);
  try {
    await i.deferUpdate();
    const member = await guild.members.fetch({ user: uid, force: true }).catch(() => null);
    if (!member || !valid() || (u.warningJoinedAt && member.joinedTimestamp !== u.warningJoinedAt)) return i.editReply(ended('この案内は現在の参加状態では利用できません。サーバー管理者へお問い合わせください。'));
    if (action === 'keep') {
      const at = Date.now();
      const roleId = u.warningRole || u.suspendedRole || s.role;
      record(guild, member.user, at);
      u.choice = 'keep'; u.choiceAt = at;
      if (roleId) {
        u.restoreRole = roleId;
        try { await restore(member, u, roleId); }
        catch (e) {
          const saved = await persist(guild, s);
          await log(guild, s, `<@${uid}> は参加継続を希望しましたが、<@&${roleId}> の付与に失敗しました：${e.message}`).catch(() => null);
          return i.editReply(ended(`参加継続を受け付け、キック予定を解除しました。ただし指定ロールを付与できませんでした。管理者に連絡してください。${saved ? 'Botも再付与を試みます。' : '保存にも失敗したため、自動処理を停止しました。'}`));
        }
      }
      if (!await persist(guild, s)) return i.editReply(ended('参加継続を受け付けましたが保存に失敗したため、自動キックを停止しました。サーバー管理者へお問い合わせください。'));
      await log(guild, s, `<@${uid}> が「参加を続ける」を選択しました。${roleId ? `<@&${roleId}> を付与しました。` : ''}キック予定を解除し、今日から3か月を数え直します。`).catch(e => console.error('参加意思ログ失敗:', e.message));
      return i.editReply(ended(`「${guild.name}」への参加継続を受け付けました。${roleId ? '指定ロールを付与しました。' : ''}キック予定は解除されました。今日から3か月を数え直します。`));
    }
    if (action === 'back') {
      delete u.confirmToken; delete u.confirmUntil;
      return i.editReply({ content: '', ...warning(guild, member, u) });
    }
    if (action === 'leave') {
      u.confirmToken = randomBytes(8).toString('hex'); u.confirmUntil = Date.now() + 10 * 60000;
      return i.editReply({ content: `「${guild.name}」から本当に退出しますか？\n「退出を確定する」を押すと、Botがあなたをサーバーからキックします。\n確認画面は10分間有効です。`, embeds: [], components: buttons(gid, uid, u.confirmToken, true), allowedMentions: { parse: [] } });
    }
    if (!eligible(member, s, Date.now())) return i.editReply(ended('現在はキック対象外です。退出する場合はDiscordの「サーバーから脱退」を使用してください。'));
    await log(guild, s, `<@${uid}> が「退出を確定する」を選択しました。本人の希望による退出処理を行います。`);
    if (!valid() || !eligible(member, s, Date.now())) return i.editReply(ended('参加状態が変わったため退出処理を中止しました。'));
    // 保存成功後だけ実行する。途中で失敗した場合も古い警告を再利用しない。
    record(guild, member.user);
    u.choice = 'leave'; u.choiceAt = Date.now();
    if (!await persist(guild, s)) return i.editReply(ended('保存に失敗したため退出処理を中止し、自動キックを停止しました。管理者へお問い合わせください。'));
    if (!s.enabled || st.get(gid).inactive !== s) return i.editReply(ended('監視設定が変更されたため退出処理を中止しました。'));
    try {
      await member.kick('警告DMの参加意思確認で、本人が退出を二段階で確定');
    } catch (e) {
      await log(guild, s, `<@${uid}> の希望による退出に失敗しました：${e.message.slice(0, 200)}`).catch(() => null);
      return i.editReply(ended('Botの権限などにより退出処理に失敗しました。Discordの「サーバーから脱退」を使用するか、管理者に連絡してください。'));
    }
    delete s.users[uid]; await persist(guild, s);
    await log(guild, s, `<@${uid}> は参加意思確認で退出を確定したため、キックしました。`).catch(e => console.error('退出ログ失敗:', e.message));
    return i.editReply(ended(`「${guild.name}」から退出しました。`));
  } finally { buttonLocks.delete(`${gid}:${uid}`); }
}

module.exports = { handleApproval, threeMonths, record, eligible, sweep, tick, handleButton, managedRole, restoreSuspended };
