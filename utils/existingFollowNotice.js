const {ChannelType,PermissionFlagsBits:P}=require('discord.js');
const st=require('./store');
const {SOURCE_GUILD}=require('./officialFeed');
const NOTICE='⚙️ BOT管理パネル ベータ版公開！\n\n各サーバーの `#bot-config` に、BOTの設定を変更できる管理パネルを設置しました！\n\nまだベータ版なので、不具合や使いづらいところがあるかもしれません。\n\n🐛 不具合・改善要望などがあれば、管理パネル内の「お問い合わせ」から気軽に送ってください！\n\n今後も少しずつ改善していきます！';
async function detectAndNotify(client,guild){
 if(guild.id===SOURCE_GUILD)return;
 const data=st.get(guild.id);
 // A previously sent notice is never resent, including after destination changes.
 if(data.betaPanelNoticeSent)return;
 const sourceGuild=client.guilds.cache.get(SOURCE_GUILD);
 if(!sourceGuild)return;
 const source=sourceGuild.channels.cache.find(c=>c.name==='log'&&c.type===ChannelType.GuildAnnouncement);
 if(!source)return;
 const me=guild.members.me||await guild.members.fetchMe();
 let destination=null;
 for(const c of guild.channels.cache.values()){
  if(c.type!==ChannelType.GuildText)continue;
  if(!c.permissionsFor(me)?.has([P.ViewChannel,P.ManageWebhooks]))continue;
  const hooks=await c.fetchWebhooks().catch(()=>null);
  if(hooks?.some(h=>h.type===2&&h.sourceChannel?.id===source.id)){destination=c;break;}
 }
 if(!destination)return;
 // Save the detected destination even if the announcement cannot be posted.
 const previous=data.officialFeed;
 data.officialFeed={enabled:true,channelId:destination.id};
 if(!await st.save(guild)){data.officialFeed=previous;return;}
 if(!destination.permissionsFor(me)?.has([P.SendMessages,P.ReadMessageHistory]))return;
 const history=await destination.messages.fetch({limit:100}).catch(()=>null);
 let posted=history?.find(m=>m.author.id===client.user.id&&m.content===NOTICE);
 if(!posted)posted=await destination.send({content:NOTICE,allowedMentions:{parse:[]}});
 data.betaPanelNoticeSent={messageId:posted.id,channelId:destination.id};
 if(!await st.save(guild))console.error('案内送信済み情報の保存に失敗',guild.id);
 await require('./managementPanel').ensure(guild);
}
async function scanAll(client){
 for(const guild of client.guilds.cache.values()){
  await detectAndNotify(client,guild).catch(e=>console.error('既存フォローの案内失敗',guild.id,e.message));
 }
}
module.exports={scanAll};
