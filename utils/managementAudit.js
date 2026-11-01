const st=require('./store');
const {MessageFlags,PermissionFlagsBits,ActionRowBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
// Record only intentional configuration values; exclude UID, member history, message bodies.
const fields=[
 ['vc','VC通知先'],['rkOff','VCランキング'],['bump','Bump通知'],
 ['gnews','原神のお知らせ'],['introP','UID登録'],['buildPanels','ビルドカード'],
 ['giftP','ギフトコード'],['genshin','原神機能'],['inactiveMonths','未活動判定期間'],
 ['inactiveSettings','未活動管理設定'],['inactive','未活動管理'],['officialFeed','公式お知らせ']
];
function compact(d){
 const v={};
 for(const [key] of fields){
  const x=d[key];
  if(key==='inactive')v[key]=x?{enabled:x.enabled,months:x.months,role:x.role,exclude:x.exclude,log:x.log}:null;
  else if(key==='gnews')v[key]=x?{ch:x.ch,role:x.role}:null;
  else if(key==='introP')v[key]=x?{ch:x.ch,role:x.role}:null;
  else if(key==='giftP')v[key]=x?{ch:x.ch}:null;
  else if(key==='bump')v[key]=x?{ch:x.ch,here:x.here}:null;
  else if(key==='buildPanels')v[key]=Object.keys(x||{}).sort();
  else v[key]=x??null;
 }
 return v;
}
function changed(a,b){return fields.filter(([key])=>JSON.stringify(a[key])!==JSON.stringify(b[key])).map(([,label])=>label);}
async function record(guild,user,before){
 const d=st.get(guild.id),labels=changed(before,compact(d));
 if(!labels.length)return false;
 const item={at:Date.now(),by:user.id,action:labels.join('・')};
 const old=d.managementLog||[];
 d.managementLog=[...old,item].slice(-50);
 if(!await st.save(guild)){d.managementLog=old;console.error('管理ログの保存失敗',guild.id);return false;}
 await publish(guild).catch(e=>console.error('管理ログ投稿失敗',guild.id,e.message));
 return true;
}
function view(guildId,page=0){
 const rows=(st.get(guildId).managementLog||[]).slice().reverse();
 const total=rows.length,index=Math.max(0,Math.min(Number(page)||0,Math.max(0,total-1)));
 if(!total)return {content:'## 📋 管理ログ\\nまだ設定変更の履歴はありません。',components:[],allowedMentions:{parse:[]}};
 const entry=rows[index];
 const button=(key,label,disabled)=>new ButtonBuilder().setCustomId('pt_audit_'+key+'_'+index).setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
 return {content:'## 📋 管理ログ\\n**'+(index+1)+' / '+total+'**\\n\\n日時：<t:'+Math.floor(entry.at/1000)+':F>\\n操作：<@'+entry.by+'>\\n変更：'+entry.action+'\\n\\n-# 最新のログから1件ずつ表示',components:[new ActionRowBuilder().addComponents(button('prev','← 新しいログ',index===0),button('next','古いログ →',index===total-1))],allowedMentions:{parse:[]}};
}
function summary(guildId,page=0){return view(guildId,page).content.replace(/^## 📋 管理ログ\\n/,'');}
async function publish(guild){
 const ch=st.findCh(guild);if(!ch)return;
 const me=guild.members.me||await guild.members.fetchMe();
 if(!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]))return;
 const d=st.get(guild.id);
 const body='## 📋 管理ログ\\n'+summary(guild.id,8)+'\\n\\n-# 直近50件をconfig.jsonに保存します。変更前の履歴は記録できません。';
 let msg=d.managementLogMessageId&&await ch.messages.fetch(d.managementLogMessageId).catch(()=>null);
 if(!msg){
  const recent=await ch.messages.fetch({limit:100}).catch(()=>null);
  msg=recent?.find(m=>m.author.id===guild.client.user.id&&m.content?.startsWith('## 📋 管理ログ'))||null;
 }
 if(msg)await msg.edit(body);else msg=await ch.send({...body,flags:MessageFlags.SuppressNotifications});
 if(d.managementLogMessageId!==msg.id){d.managementLogMessageId=msg.id;await st.save(guild);}
}
module.exports={compact,record,summary,view,publish};
