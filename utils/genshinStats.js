const { EmbedBuilder } = require('discord.js');
const { isGI } = require('./gi');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', 'data');
const {valid, description} = require('./genshinStatsView');
const TYPES = {
  pull: { title: 'キャラクター所持率', key: 'ownership' },
  usage: { title: '螺旋におけるキャラクター使用率', key: 'usage' },
  team: { title: '螺旋における人気パーティー', key: 'teams' }
};
function snapshot() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT,'genshinStats.json'),'utf8')); }
  catch { return {ownership:[],usage:[],teams:[]}; }
}
async function execute(i,type) {
  if (!i.guildId || !isGI(i.guildId)) return i.reply({content:'原神機能がONのサーバーでのみ利用できます。',ephemeral:true});
  await i.deferReply();
  try {
    const config=TYPES[type];
    if (!config) throw new Error('Unknown stats type');
    if (type==='team') return await i.editReply({content:'人気編成の統計は準備中です。'});
    const data=snapshot();
    if (!valid(data)) return await i.editReply({content:'検証済みの★5統計は準備中です。'});
    const embeds=description(data,config.key).map((text,index) => {
      const embed=new EmbedBuilder().setTitle(config.title+(index?'（続き）':''))
        .setDescription(text).setColor(0x5865f2);
      if (!index) {
        const period = data.period?.replace(/(\d{4}-\d{2}-\d{2})T[^ ]+/g, '$1');
        const sample = data.sample && 'origin ' + data.sample.origin + ' / ref ' + data.sample.reference;
        embed.setFooter({text:['出典 AZA.GG', period, data.updatedAt && '更新 ' + data.updatedAt.slice(0,10), sample].filter(Boolean).join(' ｜ ')});
      }
      return embed;
    });
    await i.editReply({embeds,allowedMentions:{parse:[]}});
  } catch(error) {
    console.error('原神統計表示エラー:',error);
    await i.editReply({content:'統計を表示できませんでした。管理者にログの確認を依頼してください。'}).catch(()=>null);
  }
}
async function handleButton(i) {
  if (!i.customId?.startsWith('gstats_')) return false;
  await i.reply({content:'ページ送りは廃止しました。コマンドを再実行してください。',ephemeral:true});
  return true;
}
module.exports={execute,handleButton,TYPES,valid,loadSnapshot:async()=>snapshot()};
