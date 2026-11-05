const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const st = require('./store');
const { generateWelcomeImage, jstToday } = require('./imageGenerator');

const GUILD = '1496054346385723472';
const CHANNEL = '1496130366145298473';
const ROLE = '1496147336043298866';
const sessions = new Map();
const locks = new Map();
const dateToday = () => { const t = jstToday(); return `${t.y}-${String(t.m).padStart(2,'0')}-${String(t.d).padStart(2,'0')}`; };
const file = async (date, guests) => new AttachmentBuilder(await generateWelcomeImage({ guests },1920,1080),{name:`${date}.jpg`});
const jump = (guild, channel, id) => `https://discord.com/channels/${guild}/${channel}/${id}`;
const v2 = (...components) => ({components, flags: MessageFlags.IsComponentsV2, allowedMentions:{parse:[]}});
const txt = s => new TextDisplayBuilder().setContent(s);
const button = (id,label,style) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const panel = () => new ContainerBuilder().addTextDisplayComponents(txt('## Welcome｜来場予約管理\n来場予約の登録・削除はこちらから。')).addActionRowComponents(new ActionRowBuilder().addComponents(button('wel_create','来場予約を作成する',ButtonStyle.Primary),button('wel_delete','来場予約を削除する',ButtonStyle.Danger)));
const itemPanel = (r) => new ContainerBuilder().addTextDisplayComponents(txt(`### 来場予約\n**${r.date}　${r.time}**\n**${r.name}**\n登録者：<@${r.user}>`)).addActionRowComponents(new ActionRowBuilder().addComponents(button(`wel_remove:${r.id}`,'🗑️ 予約を削除',ButtonStyle.Danger)));
const removedPanel = r => new ContainerBuilder().addTextDisplayComponents(txt(`### 来場予約｜キャンセル済み\n~~${r.date}　${r.time}　${r.name}~~`));
const validDate = v => {if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false; const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;};
const validTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const normalizeName = s => s.trim().replace(/(さん|様)\s*$/,'').trim().replace(/\s+/g,'　')+'　様';
function allReservations(guild) { const w=st.get(guild.id).welcome||{};return Object.entries(w).flatMap(([date,day])=>(day.guests||[]).map((r,i)=>({...r,date,id:r.id||`legacy:${date}:${i}`,ch:r.ch||day.ch,msg:r.msg||day.msg}))).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)); }
async function ensure(guild) {
 if(!guild||guild.id!==GUILD)return;
 const channel=await guild.channels.fetch(CHANNEL).catch(()=>null);if(!channel?.send)return;
 const d=st.get(guild.id);const old=d.welcomePanel;
 if(old?.msg&&await channel.messages.fetch(old.msg).catch(()=>null))return;
 const m=await channel.send(v2(panel()));d.welcomePanel={ch:CHANNEL,msg:m.id};await st.save(guild);
}
const pad = n => String(n).padStart(2,'0');
const menu = (id,placeholder,options) => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(options));
const options = (start,end,suffix) => Array.from({length:end-start+1},(_,i)=>({label:`${start+i}${suffix}`,value:pad(start+i)}));
function bookingStep(user) {
 const s=sessions.get(user);
 const [y,m,d]=s.date.split('-').map(Number);
 if(s.step==='year') return {content:'**① 来場日を選択**\n年を選んでください。',components:[menu('wel_year','年を選択',Array.from({length:4},(_,i)=>({label:`${y+i}年`,value:String(y+i)})))]};
 if(s.step==='month')return {content:`**① 来場日を選択**\n${s.year}年｜月を選んでください。`,components:[menu('wel_month','月を選択',options(1,12,'月'))]};
 if(s.step==='day'){
  const count=new Date(s.year,Number(s.month),0).getDate();
  const today=dateToday();
  const days=options(1,count,'日').filter(x=>`${s.year}-${s.month}-${x.value}`>=today);
  if(!days.length){s.step='month';return bookingStep(user);}
  return {content:`**① 来場日を選択**\n${s.year}年${Number(s.month)}月｜日を選んでください。`,components:[menu('wel_day','日を選択',days)]};
 }
 if(s.step==='hour')return {content:`**② 来場時間を選択**\n${s.date}｜時を選んでください。`,components:[menu('wel_hour','時を選択',options(0,23,'時'))]};
 if(s.step==='minute')return {content:`**② 来場時間を選択**\n${s.date} ${s.hour}時｜分を選んでください。`,components:[menu('wel_minute','分を選択',options(0,59,'分'))]};
}
function nameModal(){return new ModalBuilder().setCustomId('wel_submit').setTitle('お客様名を入力').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('お客様名（様は自動で付与）').setStyle(TextInputStyle.Short).setRequired(true)));}
async function locked(guild, fn) {const prior=locks.get(guild.id)||Promise.resolve();const next=prior.catch(()=>{}).then(fn);locks.set(guild.id,next);try{return await next;}finally{if(locks.get(guild.id)===next)locks.delete(guild.id);}}
async function refresh(guild,date) {
 const d=st.get(guild.id);const day=d.welcome?.[date];if(!day)return;
 const channel=await guild.channels.fetch(CHANNEL);
 const guests=(day.guests||[]).sort((a,b)=>a.time.localeCompare(b.time));
 if(!guests.length){
   if(day.msg)await channel.messages.delete(day.msg).catch(()=>null);
   if(day.ping)await channel.messages.delete(day.ping).catch(()=>null);
   delete d.welcome[date];return;
 }
 const links=guests.map(r=>`• ${r.time}　${r.name}　${r.msg?`[予約を見る](${jump(guild.id,r.ch||CHANNEL,r.msg)})`:'（旧形式の予約）'}`).join('\n');
 const attachment=await file(date,guests);
 const payload={content:`**Welcome｜${date}**\n${links}`,files:[attachment],allowedMentions:{parse:[]}};
 const old=day.msg&&await channel.messages.fetch(day.msg).catch(()=>null);
 if(old){await old.edit({...payload,attachments:[]});}
 else {const m=await channel.send(payload);day.msg=m.id;day.ch=CHANNEL;}
}
async function handle(interaction){
 if(interaction.guildId!==GUILD||interaction.channelId!==CHANNEL)return interaction.reply({content:'この機能は社内のWelcome専用チャンネルで使用してください。',flags:MessageFlags.Ephemeral});
 const id=interaction.customId;
 if(id==='wel_create'){sessions.set(interaction.user.id,{items:[],date:dateToday(),step:'year'});return interaction.reply({...bookingStep(interaction.user.id),flags:MessageFlags.Ephemeral});}
 if(id==='wel_next'){const s=sessions.get(interaction.user.id);if(!s)return interaction.reply({content:'操作が期限切れです。最初から登録してください。',flags:MessageFlags.Ephemeral});s.step='hour';return interaction.update(bookingStep(interaction.user.id));}
 if(['wel_year','wel_month','wel_day','wel_hour','wel_minute'].includes(id)){
  const s=sessions.get(interaction.user.id);
  if(!s)return interaction.reply({content:'操作が期限切れです。最初から登録してください。',flags:MessageFlags.Ephemeral});
  const value=interaction.values[0];
  if(id==='wel_year'){s.year=Number(value);s.step='month';}
  if(id==='wel_month'){s.month=value;s.step='day';}
  if(id==='wel_day'){s.date=`${s.year}-${s.month}-${value}`;s.step='hour';}
  if(id==='wel_hour'){s.hour=value;s.step='minute';}
  if(id==='wel_minute'){s.time=`${s.hour}:${value}`;return interaction.showModal(nameModal());}
  return interaction.update(bookingStep(interaction.user.id));
 }
 if(id==='wel_submit'){
  const s=sessions.get(interaction.user.id);
  if(!s?.date||!s?.time)return interaction.reply({content:'操作が期限切れです。最初から登録してください。',flags:MessageFlags.Ephemeral});
  const raw=interaction.fields.getTextInputValue('name');
  if(!validDate(s.date)||s.date<dateToday()||!validTime(s.time)||!raw.trim()||raw.trim().length>60)return interaction.reply({content:'お客様名を確認して、もう一度登録してください。',flags:MessageFlags.Ephemeral});
  s.items.push({date:s.date,time:s.time,name:normalizeName(raw)});
  const rows=s.items.map(x=>`${x.date} ${x.time}　${x.name}`).join('\n');
  return interaction.reply({content:`**入力中：${s.items.length}組**\n${rows}\n\n続けて登録するか、完了して画像を作成してください。`,components:[new ActionRowBuilder().addComponents(button('wel_next','＋ 続けて登録',ButtonStyle.Secondary),button('wel_finish','完了',ButtonStyle.Success),button('wel_cancel','キャンセル',ButtonStyle.Danger))],flags:MessageFlags.Ephemeral});
 }
 if(id==='wel_cancel'){sessions.delete(interaction.user.id);return interaction.update({content:'登録をキャンセルしました。',components:[]});}
 if(id==='wel_finish'){
  const s=sessions.get(interaction.user.id);if(!s?.items.length)return interaction.reply({content:'登録する予約がありません。',flags:MessageFlags.Ephemeral});
  await interaction.deferUpdate();
  await locked(interaction.guild,async()=>{
   const d=st.get(interaction.guildId);d.welcome ||= {};
   for(const x of s.items){
    const day=d.welcome[x.date]||={ch:CHANNEL,guests:[],rem:false};
    if(day.guests.some(r=>r.time===x.time&&r.name===x.name))continue;
    const rid=`${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
    const r={...x,id:rid,user:interaction.user.id,ch:CHANNEL};
    const msg=await interaction.channel.send(v2(itemPanel(r)));r.msg=msg.id;day.guests.push(r);
   }
   for(const date of new Set(s.items.map(x=>x.date)))await refresh(interaction.guild,date);
   await st.save(interaction.guild);
  });
  sessions.delete(interaction.user.id);return interaction.editReply({content:'来場予約を登録し、Welcome画像を更新しました。',components:[]});
 }
 if(id==='wel_delete'){
  const list=allReservations(interaction.guild).filter(x=>x.date>=dateToday());
  if(!list.length)return interaction.reply({content:'削除できる来場予約はありません。',flags:MessageFlags.Ephemeral});
  const dates=[...new Set(list.map(x=>x.date))];
  const menu=new StringSelectMenuBuilder().setCustomId('wel_date').setPlaceholder('削除する予約の日付を選択').addOptions(dates.slice(0,25).map(date=>({label:date,value:date})));
  return interaction.reply({content:'削除する予約の日付を選択してください。',components:[new ActionRowBuilder().addComponents(menu)],flags:MessageFlags.Ephemeral});
 }
 if(id==='wel_date'){
  const date=interaction.values[0],list=allReservations(interaction.guild).filter(x=>x.date===date);
  const menu=new StringSelectMenuBuilder().setCustomId('wel_pick').setPlaceholder('削除する予約を選択').addOptions(list.slice(0,25).map(x=>({label:`${x.time}｜${x.name}`.slice(0,100),value:x.id})));
  return interaction.update({content:`${date} の予約を選択してください。`,components:[new ActionRowBuilder().addComponents(menu)]});
 }
 if(id==='wel_pick'||id.startsWith('wel_remove:')){
  const rid=id==='wel_pick'?interaction.values[0]:id.slice('wel_remove:'.length);
  const r=allReservations(interaction.guild).find(x=>x.id===rid);
  if(!r)return interaction.reply({content:'予約が見つかりません。',flags:MessageFlags.Ephemeral});
  const row=new ActionRowBuilder().addComponents(button(`wel_confirm:${rid}`,'削除する',ButtonStyle.Danger),button('wel_abort','戻る',ButtonStyle.Secondary));
  const p={content:`**この予約を削除しますか？**\n${r.date} ${r.time}　${r.name}\n削除後、統合画像も自動更新されます。`,components:[row]};
  if(id==='wel_pick')return interaction.update(p);
  return interaction.reply({...p,flags:MessageFlags.Ephemeral});
 }
 if(id==='wel_abort')return interaction.update({content:'削除を取り消しました。',components:[]});
 if(id.startsWith('wel_confirm:')){
  await interaction.deferUpdate();
  const rid=id.slice('wel_confirm:'.length);
  let removed=false;
  await locked(interaction.guild,async()=>{
   const d=st.get(interaction.guildId);
   for(const [date,day] of Object.entries(d.welcome||{})){
    const i=day.guests.findIndex((r,index)=>(r.id||`legacy:${date}:${index}`)===rid);
    if(i<0)continue;
    const [r]=day.guests.splice(i,1);removed=true;
    if(r.msg){const msg=await interaction.channel.messages.fetch(r.msg).catch(()=>null);if(msg)await msg.edit(v2(removedPanel(r))).catch(()=>null);}
    await refresh(interaction.guild,date);await st.save(interaction.guild);break;
   }
  });
  return interaction.editReply({content:removed?'予約を削除し、Welcome画像を更新しました。':'予約はすでに削除されています。',components:[]});
 }
}
module.exports={ensure,handle,GUILD,CHANNEL};
