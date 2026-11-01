const st=require('./store');
const {MessageFlags,PermissionFlagsBits,ActionRowBuilder,ButtonBuilder,ButtonStyle,ContainerBuilder,TextDisplayBuilder,SeparatorBuilder}=require('discord.js');
// Record only intentional configuration values; exclude UID, member history, message bodies.
const fields=[
 ['alarms','アラーム'],['alarmChannelId','アラーム通知先'],['sticky','常駐アナウンス'],
 ['vcMentionSchedule','VCメンション時間帯'],['vc','VC通知先'],['vcOff','VC参加通知'],['rkOff','VCランキング'],['bump','Bump通知'],
 ['gnews','原神のお知らせ'],['introP','UID登録'],['buildPanels','ビルドカード'],
 ['giftP','ギフトコード'],['genshin','原神機能'],['inactiveMonths','未活動判定期間'],
 ['inactiveSettings','未活動管理設定'],['inactive','未活動管理'],['officialFeed','公式お知らせ']
];
function compact(d){
 const v={};
 for(const [key] of fields){
  const x=d[key];
  if(key==='vcMentionSchedule')v[key]=x?{start:x.start,end:x.end,primaryRole:x.primaryRole,secondaryRole:x.secondaryRole}:null;
  else if(key==='alarms')v[key]=(x||[]).map(a=>({time:a.time,ch:a.ch,msg:a.msg?.slice(0,80)}));
  else if(key==='sticky')v[key]=Object.keys(x||{}).sort();
  else if(key==='inactive')v[key]=x?{enabled:x.enabled,months:x.months,role:x.role,exclude:x.exclude,log:x.log,approvalChannelId:x.approvalChannelId}:null;
  else if(key==='gnews')v[key]=x?{ch:x.ch,role:x.role}:null;
  else if(key==='introP')v[key]=x?{ch:x.ch,role:x.role}:null;
  else if(key==='giftP')v[key]=x?{ch:x.ch}:null;
  else if(key==='bump')v[key]=x?{ch:x.ch,here:x.here}:null;
  else if(key==='buildPanels')v[key]=Object.keys(x||{}).sort();
  else v[key]=x??null;
 }
 return v;
}
const names={ch:'チャンネル',role:'ロール',exclude:'除外ロール',enabled:'有効化',months:'判定期間',log:'ログ送信先',approvalChannelId:'確認通知先',primaryRole:'時間帯①ロール',secondaryRole:'時間帯②ロール',start:'開始時刻',end:'終了時刻',here:'@here通知',channelId:'受信先',seen:'既読',posts:'投稿履歴'};
function format(key,value){
 if(value===null||value===undefined||value==='')return '未設定';
 if(key==='rkOff'||key==='vcOff')return value?'OFF':'ON';
 if(typeof value==='boolean')return value?'ON':'OFF';
 if(key==='months'||key==='inactiveMonths')return value+'か月';
 if(['ch','vc','log','channelId','approvalChannelId','alarmChannelId'].includes(key)&&/^\\d{15,22}$/.test(String(value)))return '<#'+value+'>';
 if(['role','exclude','primaryRole','secondaryRole'].includes(key)&&/^\\d{15,22}$/.test(String(value)))return '<@&'+value+'>';
 if(Array.isArray(value))return value.length?value.map(v=>/^\\d{15,22}$/.test(String(v))?'<#'+v+'>':String(v)).join('、'):'なし';
 return String(value);
}
function changes(before,after){
 const lines=[];
 for(const [key,title] of fields){
  const a=before[key],b=after[key];
  if(JSON.stringify(a)===JSON.stringify(b))continue;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
   for(const sub of new Set([...Object.keys(a),...Object.keys(b)])){
    if(JSON.stringify(a[sub])!==JSON.stringify(b[sub]))lines.push(title+' / '+(names[sub]||sub)+'：'+format(sub,a[sub])+' → '+format(sub,b[sub]));
   }
  }else lines.push(title+'：'+format(key,a)+' → '+format(key,b));
 }
 return lines.slice(0,15);
}
async function record(guild,user,before){
 const d=st.get(guild.id),details=changes(before,compact(d));
 if(!details.length)return false;
 const item={at:Date.now(),by:user.id,action:details.map(x=>x.split('：')[0]).join('・'),details};
 const old=d.managementLog||[];
 d.managementLog=[...old,item].slice(-50);
 if(!await st.save(guild)){d.managementLog=old;console.error('管理ログの保存失敗',guild.id);return false;}
 await publish(guild).catch(e=>console.error('管理ログ投稿失敗',guild.id,e.message));
 return true;
}
function detail(entry){return entry.details?.length?entry.details.join('\n'):(entry.action||'詳細なし（旧形式の履歴）');}
function view(guildId,page=0){
 const rows=(st.get(guildId).managementLog||[]).slice().reverse();
 const total=rows.length,index=Math.max(0,Math.min(Number(page)||0,Math.max(0,total-1)));
 const box=new ContainerBuilder();
 box.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📋 管理ログ'));
 if(!total){
  box.addTextDisplayComponents(new TextDisplayBuilder().setContent('まだ設定変更の履歴はありません。'));
 }else{
  const entry=rows[index],at=Math.floor(entry.at/1000);
  box.addTextDisplayComponents(new TextDisplayBuilder().setContent(
   '**'+(index+1)+' / '+total+'**\n\n**操作した人**\n<@'+entry.by+'>\n\n**変更内容**\n'+detail(entry)+'\n\n**変更日時**\n<t:'+at+':F>'
  ));
  const button=(key,label,disabled)=>new ButtonBuilder().setCustomId('pt_audit_'+key+'_'+index).setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
  box.addActionRowComponents(new ActionRowBuilder().addComponents(button('prev','PREV',index===0),button('next','NEXT',index===total-1)));
 }
 return {content:null,components:[box],flags:MessageFlags.IsComponentsV2,allowedMentions:{parse:[]}};
}
function summary(guildId,page=0){
 const rows=(st.get(guildId).managementLog||[]).slice().reverse();
 if(!rows.length)return 'まだ設定変更の履歴はありません。';
 const i=Math.max(0,Math.min(page,rows.length-1)),entry=rows[i];
 return '**'+(i+1)+' / '+rows.length+'**\n\n**操作した人**\n<@'+entry.by+'>\n\n**変更内容**\n'+detail(entry)+'\n\n**変更日時**\n<t:'+Math.floor(entry.at/1000)+':F>';
}
async function publish(guild){
 const ch=st.findCh(guild);if(!ch)throw Error('#bot-configが見つかりません');
 const me=guild.members.me||await guild.members.fetchMe();
 if(!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]))throw Error('管理ログの閲覧・投稿・履歴権限が不足しています');
 const d=st.get(guild.id);
 const body=view(guild.id,0);
 let msg=d.managementLogMessageId&&await ch.messages.fetch(d.managementLogMessageId).catch(()=>null);
 if(msg&&msg.author.id!==guild.client.user.id)msg=null;
 if(!msg){
  const recent=await ch.messages.fetch({limit:100}).catch(()=>null);
  msg=recent?.find(m=>m.author.id===guild.client.user.id&&(m.content?.startsWith('## 📋 管理ログ')||m.components?.some(c=>JSON.stringify(c.toJSON?.()||c).includes('pt_audit_'))))||null;
 }
 if(msg){
  // Preserve the admin's currently selected audit page during periodic synchronization.
  const current=msg.components?.[0]?.toJSON?.();
  const buttonId=JSON.stringify(current||{}).match(/pt_audit_(?:prev|next)_(\d+)/);
  const index=buttonId?Number(buttonId[1]):0;
  const desired=view(guild.id,index);
  if(JSON.stringify(msg.components?.map(c=>c.toJSON?.()||c))===JSON.stringify(desired.components.map(c=>c.toJSON?.()||c)))return;
  try{await msg.edit(desired);}catch(e){console.warn('古い管理ログを更新できないため再作成:',guild.id,e.message);msg=null;}}
 if(!msg)msg=await ch.send({...body,flags:MessageFlags.SuppressNotifications});
 if(d.managementLogMessageId!==msg.id){d.managementLogMessageId=msg.id;await st.save(guild);}
}
module.exports={compact,record,summary,view,publish};
