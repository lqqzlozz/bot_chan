const st=require('./store');
const {deliver}=require('./betaPanelNotice');
async function convertAll(client){
 for(const guild of client.guilds.cache.values()){
  const record=st.get(guild.id).betaPanelNoticeSent;
  if(!record?.messageId||!record.channelId)continue;
  try{
   const ch=await guild.channels.fetch(record.channelId).catch(()=>null);
   if(!ch?.messages)continue;
   const msg=await ch.messages.fetch(record.messageId).catch(()=>null);
   if(msg&&msg.author.id===client.user.id&&!msg.embeds?.length)
    await deliver(ch,record.messageId);
  }catch(e){console.error('ベータ案内Embed移行失敗',guild.id,e.message);}
 }
}
module.exports={convertAll};
