const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {normalize, update} = require('../utils/azaStats');
const {valid, description} = require('../utils/genshinStatsView');
const now = new Date('2026-11-11T03:00:00Z');
function fixture() {
  const character = {};
  let html = '<table>';
  const ids = Object.keys(require('../data/genshinCharacterNamesJa.json'));
  for(let n=0;n<110;n++) {
    const id=ids[n], rarity=n<70?5:4;
    html+=`<tr><td><a href="#/test-${id}"><img class="gi-star-${rarity}-bg-gradient"><span>Character ${n}</span></a></td></tr>`;
    character[id]={own_rate:.5,use_rate:.1,use_by_own_rate:.2};
  }
  return {html:html+'</table>',payload:{retcode:0,meta:{author:'aza.gg',api_ver:'5.6'},data:{updated_at:now.getTime(),schedule:{id:124,start_time:1792094400,end_time:'1794772799'},sample_size:0,sample_size_x_a:1388,sample_size_x_b:3500,character}}};
}
test('filters five-stars and keeps usage denominators and sample metadata distinct',()=>{
  const f=fixture(), data=normalize(f.payload,f.html,now);
  assert.equal(data.ownership.length,70);
  assert.equal(data.usage[0].rate,20);
  assert.equal(data.usage[0].appearanceRate,10);
  assert.equal(data.ownership[0].rate,50);
  assert.equal(data.sampleSize,null);
  assert.deepEqual(data.sample,{origin:1388,reference:3500});
  assert.ok(valid(data));
  const text=description(data,'usage',now);
  assert.match(text.join(''),/所持者中/);
  assert.ok(text.every(x=>x.length<=4096));
  assert.ok(text.join('').length<5500);
  assert.match(description(data,'usage',new Date('2026-11-20')).join(''),/更新が古い/);
});
test('rejects corrupt, stale, duplicate, missing and changed-schema data',()=>{
  for(const mutate of [f=>{f.payload.retcode=1;},f=>{f.payload.meta.api_ver='6';},f=>{f.payload.data.updated_at=1;},f=>{f.payload.data.character[10000002].own_rate=50;},f=>{f.payload.data.character[10000002].use_by_own_rate=null;},f=>{delete f.payload.data.character[10000002];},f=>{f.html+=f.html;},f=>{f.html='Cloudflare challenge';}]){
    const f=fixture();mutate(f);assert.throws(()=>normalize(f.payload,f.html,now));
  }
});
test('failed HTTP/schema validation retains the previous snapshot; success replaces it',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aza-test-')), output=path.join(dir,'stats.json');
  try {
    await fs.writeFile(output,'previous');
    await assert.rejects(update(output,async()=>({ok:false,status:403}),now),/HTTP 403/);
    assert.equal(await fs.readFile(output,'utf8'),'previous');
    const f=fixture();
    await assert.rejects(update(output,async()=>({ok:true,json:async()=>f.payload,text:async()=>'challenge'}),now));
    assert.equal(await fs.readFile(output,'utf8'),'previous');
    f.html=f.html.replace('#/test-10000002','#/test-10000999');
    f.payload.data.character[10000999]=f.payload.data.character[10000002];
    await update(output,async url=>({
      ok:true,
      json:async()=>url.endsWith('/10000999.json')?{id:10000999,name:'新キャラクター'}:f.payload,
      text:async()=>f.html
    }),now);
    const saved=JSON.parse(await fs.readFile(output,'utf8'));
    assert.equal(saved.ownership.length,70);
    assert.equal(saved.ownership.find(row=>row.avatarId===10000999).name,'新キャラクター');
    assert.equal(saved.usage.find(row=>row.avatarId===10000999).name,'新キャラクター');
    await assert.rejects(fs.stat(output+'.tmp'));
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('Discord command replies with verified data without an image and gates disabled guilds',async()=>{
  const f=fixture(), data=normalize(f.payload,f.html,now);
  class Embed {
    constructor(){this.data={};}
    setTitle(x){this.data.title=x;return this;}
    setDescription(x){this.data.description=x;return this;}
    setColor(x){return this;}
    setFooter(x){this.data.footer=x;return this;}
    addFields(x){this.data.fields=x;return this;}
    setThumbnail(x){this.data.thumbnail=x;return this;}
  }
  let enabled=true, current=data;
  const module={exports:{}};
  const code=await fs.readFile(path.join(__dirname,'../utils/genshinStats.js'),'utf8');
  vm.runInNewContext(code,{module,__dirname:path.join(__dirname,'../utils'),console,require(name){
    if(name==='discord.js')return {EmbedBuilder:Embed};
    if(name==='./gi')return {isGI:()=>enabled};
    if(name==='node:fs')return {readFileSync:()=>JSON.stringify(current)};
    if(name==='node:path')return path;
    if(name==='./genshinStatsView')return require('../utils/genshinStatsView');
    if(name==='./genshinStatsDetailsView')return require('../utils/genshinStatsDetailsView');
    throw new Error('Unexpected import '+name);
  }});
  const replies=[], defers=[], i={guildId:'test',reply:async x=>replies.push(x),deferReply:async x=>defers.push(x),editReply:async x=>replies.push(x)};
  await module.exports.execute(i,'usage');
  assert.match(replies.at(-1).embeds[0].data.description,/所持者中/);
  assert.equal(replies.at(-1).files,undefined);
  assert.match(replies.at(-1).embeds[0].data.description,/神里綾華/);
  assert.doesNotMatch(replies.at(-1).embeds[0].data.description,/2026-10/);
  assert.match(replies.at(-1).embeds[0].data.footer.text,/出典 AZA.GG.*2026-10/);
  assert.equal(replies.at(-1).embeds[0].data.url,undefined);
  current={...data,characters:data.characters.map(row=>({...row, constellations:[{level:0,rate:64.33}], artifacts:[{sets:{14001:4},rate:81.11}]})),teams:[{half:1,members:[10000002,10000003,10000005,10000007],rate:12.77}]};
  await module.exports.execute(i,'team');
  assert.match(replies.at(-1).embeds[0].data.fields[0].value,/神里綾華.*12\.77%/);
  await module.exports.execute(i,'char');
  assert.equal(defers.at(-1),undefined);
  const menus=replies.at(-1).components;
  assert.equal(menus.length,1);
  assert.ok(menus[0].components[0].options.some(option=>option.label==='か行'));
  assert.ok(menus.every(menu=>menu.components[0].options.length<=25));
  const detailView=require('../utils/genshinStatsDetailsView');
  const sorted=detailView.characterGroups([{avatarId:3,name:'フリーナ'},{avatarId:2,name:'神里綾華'},{avatarId:1,name:'アルベド'},{avatarId:4,name:'甘雨'},{avatarId:5,name:'ヴェスナ'}]);
  assert.deepEqual(sorted.map(group=>[group.name,group.characters.map(row=>row.name)]),[
    ['あ行',['アルベド','ヴェスナ']],['か行',['神里綾華','甘雨']],['は行',['フリーナ']]
  ]);
  await module.exports.handleSelect({...i,customId:'gstats_char_page',values:['か行'],update:async x=>replies.push(x)});
  assert.ok(replies.at(-1).components[0].components[0].options.some(option=>option.label==='か行' && option.default));
  assert.ok(replies.at(-1).components[1].components[0].options.some(option=>option.label==='神里綾華'));
  await module.exports.handleSelect({...i,customId:'gstats_char_pick',values:['10000002'],update:async x=>replies.push(x)});
  const char=replies.at(-1).embeds[0].data;
  assert.match(char.title,/神里綾華/);
  assert.match(char.fields[0].value,/64\.33%/);
  assert.match(char.fields[1].value,/氷風を彷徨う勇士/);
  assert.equal(char.thumbnail,'https://enka.network/ui/UI_AvatarIcon_Side_Ayaka.png');
  current={};await module.exports.execute(i,'pull');assert.match(replies.at(-1).content,/検証済み/);
  enabled=false;await module.exports.execute(i,'usage');assert.equal(replies.at(-1).ephemeral,true);
});
