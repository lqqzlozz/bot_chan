const {ChannelType,PermissionFlagsBits}=require('discord.js');
const SOURCE_GUILD='1341988738074542111';
async function follow(client,guild,channelId){
 const sourceGuild=await client.guilds.fetch(SOURCE_GUILD).catch(()=>null);
 if(!sourceGuild)throw Error('配信元サーバーにBOTが参加していません');
 const source=sourceGuild.channels.cache.find(c=>c.name==='log'&&c.type===ChannelType.GuildAnnouncement)
  ||(await sourceGuild.channels.fetch().catch(()=>new Map())).find(c=>c.name==='log'&&c.type===ChannelType.GuildAnnouncement);
 if(!source)throw Error('配信元の #log アナウンスチャンネルが見つかりません');
 if(guild.id===SOURCE_GUILD)throw Error('配信元サーバー自身はフォロー対象外です');
 const target=await guild.channels.fetch(channelId).catch(()=>null);
 if(target?.type!==ChannelType.GuildText)throw Error('受信先には通常のテキストチャンネルを指定してください');
 const member=guild.members.me||await guild.members.fetchMe();
 if(!target.permissionsFor(member)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ManageWebhooks]))
  throw Error('BOTに受信先の「チャンネルを見る」と「ウェブフックの管理」が必要です');
 // Check accessible text channels in the destination guild before creating another follower.
 // If webhook listing is forbidden in a channel, do not assume it is unconfigured.
 for(const c of guild.channels.cache.values()){
  if(c.type!==ChannelType.GuildText)continue;
  if(!c.permissionsFor(member)?.has(PermissionFlagsBits.ManageWebhooks))continue;
  const hooks=await c.fetchWebhooks().catch(()=>null);
  if(!hooks)continue;
  if(hooks.some(h=>h.type===2&&(h.sourceChannel?.id===source.id||h.sourceChannelId===source.id)))
   return {already:true,channelId:c.id};
 }
 await source.addFollower(target.id,'公式お知らせの受信設定');
 return {already:false};
}
module.exports={follow,SOURCE_GUILD};
