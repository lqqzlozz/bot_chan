const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { isGI } = require('./gi');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', 'data');
const TYPES = {
  pull: { title: 'キャラクター所持率', key: 'ownership' },
  usage: { title: '螺旋におけるキャラクター使用率', key: 'usage' },
  team: { title: '螺旋における人気パーティー', key: 'teams' }
};
function snapshot() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT,'genshinStats.json'),'utf8')); }
  catch { return {ownership:[],usage:[],teams:[]}; }
}
function valid(data) {
  return data && ['ownership','usage','teams'].every(key => Array.isArray(data[key]) &&
    data[key].every(row => typeof row.name === 'string' && Number.isFinite(row.rate) && row.rate >= 0 && row.rate <= 100));
}
async function execute(i,type) {
  if (!i.guildId || !isGI(i.guildId)) return i.reply({content:'原神機能がONのサーバーでのみ利用できます。',ephemeral:true});
  await i.deferReply();
  try {
    const config=TYPES[type];
    if (!config) throw new Error('Unknown stats type');
    if (type==='team') return await i.editReply({content:'人気編成の統計は準備中です。'});
    const imagePath=path.join(ROOT,'stats-'+type+'.png');
    const data=snapshot();
    if (!fs.existsSync(imagePath)) return await i.editReply({
      content:'統計画像を準備中です。自動取得と画像生成が成功すると、ここに★5キャラクター一覧が表示されます。'
    });
    const embed=new EmbedBuilder().setTitle(config.title)
      .setDescription('★5キャラクター一覧'+(data.partial?'（取得済みデータのみ）':''))
      .setImage('attachment://stats-'+type+'.png').setColor(0x5865f2)
      .setFooter({text:[data.updatedAt?'更新：'+data.updatedAt:null,data.source?'出典：'+data.source:null].filter(Boolean).join(' ｜ ').slice(0,2048)});
    await i.editReply({embeds:[embed],files:[new AttachmentBuilder(imagePath,{name:'stats-'+type+'.png'})]});
  } catch(error) {
    console.error('原神統計画像表示エラー:',error);
    await i.editReply({content:'統計画像を表示できませんでした。管理者にログの確認を依頼してください。'}).catch(()=>null);
  }
}
async function handleButton(i) {
  if (!i.customId?.startsWith('gstats_')) return false;
  await i.reply({content:'ページ送りは廃止しました。コマンドを再実行してください。',ephemeral:true});
  return true;
}
module.exports={execute,handleButton,TYPES,valid,loadSnapshot:async()=>snapshot()};
