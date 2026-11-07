const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const st = require('./store');
const { jstToday } = require('./imageGenerator');

const GUILD = '1496054346385723472';
const CHANNEL = '1496130366145298473';
const sessions = new Map();
const locks = new Map();
const stickyJobs = new Map();
const stickyTimers = new Map();
const dateToday = () => { const t = jstToday(); return `${t.y}-${String(t.m).padStart(2,'0')}-${String(t.d).padStart(2,'0')}`; };
const jump = (guild, channel, id) => `https://discord.com/channels/${guild}/${channel}/${id}`;
const v2 = (...components) => ({components, flags: MessageFlags.IsComponentsV2, allowedMentions:{parse:[]}});
const txt = s => new TextDisplayBuilder().setContent(s);
const button = (id,label,style) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const panel = () => new ContainerBuilder().addTextDisplayComponents(txt('## Welcome｜来場予約管理\n来場予約の登録・削除はこちらから。')).addActionRowComponents(new ActionRowBuilder().addComponents(button('wel_create','来場予約を作成する',ButtonStyle.Primary),button('wel_delete','来場予約を削除する',ButtonStyle.Danger)));
const itemPanel = (r) => new ContainerBuilder().addTextDisplayComponents(txt(`### 来場予約\n**${r.date}　${r.time}**\n**${r.name}**\n登録者：<@${r.user}>`)).addActionRowComponents(new ActionRowBuilder().addComponents(button(`wel_remove:${r.id}`,'🗑️ 予約を削除',ButtonStyle.Danger)));
const removedPanel = r => new ContainerBuilder().addTextDisplayComponents(txt(`### 来場予約｜キャンセル済み\n~~${r.date}　${r.time}　${r.name}~~`));
const validDate = v => {if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false; const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;};
const validTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const normalizeName = s => s.trim().replace(/(?:[\s　]*(?:様|さん))+\s*$/u,'').trim().replace(/\s+/g,'　')+'　様';
function allReservations(guild) { const w=st.get(guild.id).welcome||{};return Object.entries(w).flatMap(([date,day])=>(day.guests||[]).map((r,i)=>({...r,date,id:r.id||`legacy:${date}:${i}`,ch:r.ch||day.ch,msg:r.msg||day.msg}))).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)); }
async function ensure(guild) {
 if(!guild||guild.id!==GUILD)return;
 const channel=await guild.channels.fetch(CHANNEL);if(!channel?.send)return;
 return bump(channel);
}
const isPanel = message => message.components?.some(c=>JSON.stringify(c.toJSON?.()||c).includes('"wel_create"'));
async function bump(channel) {
 if(channel.id!==CHANNEL||channel.guild?.id!==GUILD)return;
 const active=stickyJobs.get(channel.id);
 if(active){active.again=true;return active.promise;}
 const job={again:false};
 stickyJobs.set(channel.id,job);
 job.promise=(async()=>{
  do{
   job.again=false;
   const d=st.get(GUILD),me=channel.client.user.id;
   let old;
   if(d.welcomePanel?.msg){
    try{old=await channel.messages.fetch(d.welcomePanel.msg);}
    catch(e){if(e.code!==10008)throw e;}
   }
   if(!old||old.author.id!==me||!isPanel(old)){
    const recent=await channel.messages.fetch({limit:100});
    old=recent.find(m=>m.author.id===me&&isPanel(m));
   }
   const latest=(await channel.messages.fetch({limit:1})).first();
   if(old&&latest?.id===old.id){
    if(d.welcomePanel?.msg!==old.id){d.welcomePanel={ch:CHANNEL,msg:old.id};await st.save(channel.guild);}
    continue;
   }
   // Send first, so a failed repost never removes the working controls.
   const message=await channel.send({...v2(panel()),flags:MessageFlags.IsComponentsV2|MessageFlags.SuppressNotifications});
   d.welcomePanel={ch:CHANNEL,msg:message.id};
   if(old)await old.delete().catch(e=>{if(e.code!==10008)throw e;});
   await st.save(channel.guild);
   console.log('Welcome操作パネルを最下部へ移動:',CHANNEL,message.id);
  }while(job.again);
 })();
 try{return await job.promise;}finally{if(stickyJobs.get(channel.id)===job)stickyJobs.delete(channel.id);}
}
function schedule(message,client){
 if(message.guildId!==GUILD||message.channelId!==CHANNEL)return;
 if(message.author.id===client.user.id&&isPanel(message))return;
 clearTimeout(stickyTimers.get(CHANNEL));
 const timer=setTimeout(()=>{
  stickyTimers.delete(CHANNEL);
  bump(message.channel).catch(e=>console.error('Welcomeパネル追従エラー:',e.message));
 },500);
 timer.unref?.();stickyTimers.set(CHANNEL,timer);
}
const pad = n => String(n).padStart(2,'0');
const opts = (values,suffix,current) => values.map(n=>({label:String(n)+suffix,value:pad(n),default:pad(n)===pad(current)}));
const menu = (id,placeholder,options) => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(options));
function bookingStep(user) {
 const s=sessions.get(user),[year,month,day]=s.date.split('-').map(Number);
 const years=Array.from({length:4},(_,i)=>Number(dateToday().slice(0,4))+i);
 const maxDay=new Date(year,month,0).getDate();
 const allDays=Array.from({length:maxDay},(_,i)=>i+1).filter(d=>year+'-'+pad(month)+'-'+pad(d)>=dateToday());
 const page=s.dayPage||0;
 const dayOptions=allDays.filter(d=>page===0?d<=24:d>=25);
 const dayMenu=new StringSelectMenuBuilder().setCustomId('wel_day').setPlaceholder('日').addOptions([...opts(dayOptions,'日',day),{label:page===0?'25〜31日を表示':'1〜24日を表示',value:'switch'}]);
 const dateLabel=year+'年'+month+'月'+day+'日　'+s.time;
 const selectContainer=new ContainerBuilder().addTextDisplayComponents(txt('### 来場日時を設定\n現在：**'+dateLabel+'**\n変更したい項目だけ選んでください。'))
  .addActionRowComponents(menu('wel_year','年',opts(years,'年',year)))
  .addActionRowComponents(menu('wel_month','月',opts(Array.from({length:12},(_,i)=>i+1),'月',month)))
  .addActionRowComponents(new ActionRowBuilder().addComponents(dayMenu))
  .addActionRowComponents(menu('wel_hour','時',opts(Array.from({length:13},(_,i)=>i+8),'時',Number(s.time.slice(0,2)))))
  .addActionRowComponents(menu('wel_minute','分',opts([0,15,30,45],'分',Number(s.time.slice(3)))));
 const actionContainer=new ContainerBuilder().addActionRowComponents(new ActionRowBuilder().addComponents(button('wel_name','この日時で決定',ButtonStyle.Success)));
 return v2(selectContainer,actionContainer);
}
function nameModal(){return new ModalBuilder().setCustomId('wel_submit').setTitle('お客様名を入力').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('お客様名（敬称略）').setStyle(TextInputStyle.Short).setRequired(true)));}
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
 const payload={content:`**Welcome｜${date}**\n${links}`,embeds:[],files:[],allowedMentions:{parse:[]}};
 const old=day.msg&&await channel.messages.fetch(day.msg).catch(()=>null);
 if(old){await old.edit({...payload,attachments:[]});}
 else {const m=await channel.send(payload);day.msg=m.id;day.ch=CHANNEL;}
}
async function handle(interaction){
 if(interaction.guildId!==GUILD||interaction.channelId!==CHANNEL)return interaction.reply({content:'この機能は社内のWelcome専用チャンネルで使用してください。',flags:MessageFlags.Ephemeral});
 const id=interaction.customId;
 if(id==='wel_create'){sessions.set(interaction.user.id,{items:[],date:dateToday(),time:'10:00',step:'main'});return interaction.reply({...bookingStep(interaction.user.id),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});}
 if(id==='wel_next'){const s=sessions.get(interaction.user.id);if(!s)return interaction.reply({content:'操作が期限切れです。最初から登録してください。',flags:MessageFlags.Ephemeral});s.time='10:00';s.step='main';return interaction.update(bookingStep(interaction.user.id));}
 if(['wel_year','wel_month','wel_day','wel_hour','wel_minute','wel_name'].includes(id)){
  const s=sessions.get(interaction.user.id);if(!s)return interaction.reply({content:'操作が期限切れです。最初から登録してください。',flags:MessageFlags.Ephemeral});
  if(id==='wel_name')return interaction.showModal(nameModal());
  const value=interaction.values[0];if(id==='wel_day'&&value==='switch'){s.dayPage=s.dayPage?0:1;return interaction.update(bookingStep(interaction.user.id));}let [year,month,day]=s.date.split('-').map(Number);
  if(id==='wel_year')year=Number(value);if(id==='wel_month')month=Number(value);
  if(id==='wel_day')day=Number(value);if(id==='wel_year'||id==='wel_month')s.dayPage=0;
  day=Math.min(day,new Date(year,month,0).getDate());s.date=year+'-'+pad(month)+'-'+pad(day);
  if(s.date<dateToday())s.date=dateToday();
  if(id==='wel_hour')s.time=value+':'+s.time.slice(3);
  if(id==='wel_minute')s.time=s.time.slice(0,2)+':'+value;
  s.step='main';return interaction.update(bookingStep(interaction.user.id));
 }
 if(id==='wel_submit'){
  const s=sessions.get(interaction.user.id);
  if(!s?.date||!s?.time)return interaction.reply({content:'操作が期限切れです。最初から登録してください。',flags:MessageFlags.Ephemeral});
  const raw=interaction.fields.getTextInputValue('name');
  if(!validDate(s.date)||s.date<dateToday()||!validTime(s.time)||!raw.trim()||raw.trim().length>60)return interaction.reply({content:'お客様名を確認して、もう一度登録してください。',flags:MessageFlags.Ephemeral});
  s.items.push({date:s.date,time:s.time,name:normalizeName(raw)});
  const rows=s.items.map(x=>`${x.date} ${x.time}　${x.name}`).join('\n');
  return interaction.reply({content:`**入力中：${s.items.length}組**\n${rows}\n\n続けて登録するか、完了して予約を登録してください。`,components:[new ActionRowBuilder().addComponents(button('wel_next','＋ 続けて登録',ButtonStyle.Secondary),button('wel_finish','完了',ButtonStyle.Success),button('wel_cancel','キャンセル',ButtonStyle.Danger))],flags:MessageFlags.Ephemeral});
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
  sessions.delete(interaction.user.id);return interaction.editReply({content:'来場予約を登録しました。',components:[]});
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
  const p={content:`**この予約を削除しますか？**\n${r.date} ${r.time}　${r.name}\n削除後、予約一覧も自動更新されます。`,components:[row]};
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
  return interaction.editReply({content:removed?'予約を削除しました。':'予約はすでに削除されています。',components:[]});
 }
}
module.exports={ensure,handle,bump,schedule,GUILD,CHANNEL};
