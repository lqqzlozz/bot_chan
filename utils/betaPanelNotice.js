const {EmbedBuilder}=require('discord.js');
const TITLE='⚙️ BOT管理パネル ベータ版公開！';
const DESCRIPTION='各サーバーの `#bot-config` に、BOTの設定を変更できる管理パネルを設置しました！\n\nまだベータ版なので、不具合や使いづらいところがあるかもしれません。\n\n🐛 不具合・改善要望などがあれば、管理パネル内の「お問い合わせ」から気軽に送ってください！\n\n今後も少しずつ改善していきます！';
const LEGACY=TITLE+'\n\n'+DESCRIPTION;
function payload(){return {embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle(TITLE).setDescription(DESCRIPTION)],allowedMentions:{parse:[]}};}
async function deliver(channel,knownId){
 const old=knownId?await channel.messages.fetch(knownId).catch(()=>null):null;
 if(old&&old.author.id===channel.client.user.id){
  if(!old.embeds?.length)await old.edit({content:'',...payload()});
  return old;
 }
 const recent=await channel.messages.fetch({limit:100}).catch(()=>null);
 const found=recent?.find(m=>m.author.id===channel.client.user.id&&(m.content===LEGACY||m.embeds?.some(e=>e.title===TITLE)));
 if(found){
  if(!found.embeds?.length)await found.edit({content:'',...payload()});
  return found;
 }
 return channel.send(payload());
}
module.exports={TITLE,DESCRIPTION,LEGACY,payload,deliver};
