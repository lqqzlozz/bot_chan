const {MessageFlags,PermissionFlagsBits}=require('discord.js');
const st=require('./store');
const {isGI}=require('./gi');
const panel=require('./panelTestPreview');
function mode(id){const d=st.get(id);return isGI(id)||d.panelTestGenshin===true?'on':d.panelTestGenshin===false?'off':'pending';}
async function ensure(guild){
 const ch=st.findCh(guild);
 if(!ch)return false;
 const me=guild.members.me||await guild.members.fetchMe();
 if(!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]))return false;
 const d=st.get(guild.id);
 let msg=d.managementPanelId&&await ch.messages.fetch(d.managementPanelId).catch(()=>null);
 if(!msg||msg.author.id!==guild.client.user.id){
  // Recover previous panel after lost config metadata, without reposting duplicates.
  const recent=await ch.messages.fetch({limit:100}).catch(()=>null);
  msg=recent?.find(m=>m.author.id===guild.client.user.id&&m.components?.some(c=>JSON.stringify(c.toJSON?.()||c).includes('pt_pick')))||null;
 }
 if(msg){
  await msg.edit(panel.render('home',mode(guild.id),guild.id));
 }else{
  msg=await ch.send(panel.render('home',mode(guild.id),guild.id));
 }
 if(d.managementPanelId!==msg.id){
  d.managementPanelId=msg.id;
  await st.save(guild);
 }
 return true;
}
async function refreshAll(client){
 for(const guild of client.guilds.cache.values()){
  await ensure(guild).catch(e=>console.error('管理パネル更新失敗',guild.id,e.message));
 }
}
module.exports={ensure,mode,refreshAll};
