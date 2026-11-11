const artifactNames = require('../data/genshinArtifactNamesJa.json');
const weaponNames = require('../data/genshinWeaponNamesJa.json');
const enkaIcons = require('../data/genshinCharacterEnkaIcons.json');
const readings = {
  神里綾華:'かみさとあやか', 旅人:'たびびと', 香菱:'しゃんりん', 北斗:'ほくと',
  行秋:'ゆくあき', 魈:'しょう', 凝光:'ぎょうこう', 鍾離:'しょうり', 七七:'なな',
  重雲:'ちょううん', 甘雨:'かんう', 刻晴:'こくせい', 辛炎:'しんえん', 胡桃:'ふーたお',
  楓原万葉:'かえではらかずは', 煙緋:'えんひ', 宵宮:'よいみや', 雷電将軍:'らいでんしょうぐん',
  早柚:'さゆ', 珊瑚宮心海:'さんごのみやここみ', 九条裟羅:'くじょうさら', 荒瀧一斗:'あらたきいっと',
  八重神子:'やえみこ', 鹿野院平蔵:'しかのいんへいぞう', 夜蘭:'いぇらん', 綺良々:'きらら',
  申鶴:'しんかく', 雲菫:'うんきん', 久岐忍:'くきしのぶ', 神里綾人:'かみさとあやと',
  放浪者:'ほうろうしゃ', 白朮:'びゃくじゅつ', 嘉明:'がみん', 閑雲:'かんうん', 千織:'ちおり',
  藍硯:'らんやん', 夢見月瑞希:'ゆめみづきみずき', 兹白:'しはく'
};
const collator = new Intl.Collator('ja');
const reading = name => readings[name] || name;
const percent = n => n.toFixed(2) + '%';
const labels = {10000005:'旅人（空）',10000007:'旅人（蛍）'};
const label = row => labels[row.avatarId] || row.name;
const kanaRows = [
  ['あ行','あいうえおぁぃぅぇぉゔ'], ['か行','かきくけこがぎぐげごゕゖ'],
  ['さ行','さしすせそざじずぜぞ'], ['た行','たちつてとだぢづでどっ'],
  ['な行','なにぬねの'], ['は行','はひふへほばびぶべぼぱぴぷぺぽ'],
  ['ま行','まみむめも'], ['や行','やゆよゃゅょ'], ['ら行','らりるれろ'],
  ['わ行','わをんゐゑゎ'], ['その他','']
];
function hiragana(name) {
  return reading(name).normalize('NFKC').replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0)-96));
}
function characterGroups(characters) {
  const sorted = [...characters].sort((a,b) =>
    collator.compare(hiragana(a.name), hiragana(b.name)) || a.avatarId - b.avatarId);
  const groups = kanaRows.map(([name])=>({name,characters:[]}));
  for (const row of sorted) {
    const first=hiragana(row.name)[0];
    const group=kanaRows.findIndex(([,kana])=>first && kana.includes(first));
    groups[group<0 ? groups.length-1 : group].characters.push(row);
  }
  return groups.filter(group=>group.characters.length);
}
function characterMenus(groups, group, selectedId) {
  const menu = (custom_id, placeholder, options) => ({
    type:1,components:[{type:3,custom_id,placeholder,options}]
  });
  const rows = [menu('gstats_char_page','あ行・か行・さ行…から選ぶ',groups.map(item => ({
    label:item.name, value:item.name, default:item.name===group?.name
  })))];
  if (!group) return rows;
  for (let start=0;start<group.characters.length;start+=25) {
    const id=start===0?'gstats_char_pick':'gstats_char_pick_'+start;
    rows.push(menu(id,'キャラクターを選ぶ（五十音順）',group.characters.slice(start,start+25).map(row => ({
      label:label(row),value:String(row.avatarId),default:row.avatarId===selectedId
    }))));
  }
  return rows;
}
function characterIcon(avatarId) {
  const file=enkaIcons[avatarId];
  return file && 'https://enka.network/ui/'+file;
}
function teamSections(data, limit, avatarId) {
  const names = new Map(data.characters.map(row => [row.avatarId,label(row)]));
  return [1,2].map(half => {
    const teams = data.teams.filter(team => team.half===half && (!avatarId || team.members.includes(avatarId))).slice(0,limit);
    return {name:half===1?'前半':'後半',value:teams.map((team,index) =>
      `${index+1}. ${team.members.map(id=>names.get(id)).join('／')}　${percent(team.rate)}`).join('\n') || '掲載データなし'};
  });
}
function characterFields(data, row) {
  const byLevel = new Map(row.constellations.map(item=>[item.level,item.rate]));
  const distribution = Array.from({length:7},(_,level) =>
    `${level===0?'無凸':level+'凸'} ${byLevel.has(level)?percent(byLevel.get(level)):'—'}`);
  return [
    {name:'凸の分布',value:byLevel.size ? distribution.slice(0,4).join(' ｜ ')+'\n'+distribution.slice(4).join(' ｜ ') : '掲載データなし'},
    {name:'人気の武器（採用率）',value:(row.weapons || []).map(item =>
      `${weaponNames[item.id] || '武器 ID '+item.id}　${percent(item.rate)}`).join('\n') || '掲載データなし'},
    {name:'人気の聖遺物セット',value:row.artifacts.map(item =>
      Object.entries(item.sets).map(([id,count])=>`${artifactNames[id] || 'セット '+id} ${count}セット`).join(' ＋ ')+`　${percent(item.rate)}`).join('\n') || '掲載データなし'},
    ...teamSections(data,3,row.avatarId).map(field=>({...field,name:field.name+'の人気編成（採用率）'})),
    {name:'天賦レベル平均',value:'集計データなし'}
  ];
}
module.exports={label,characterGroups,characterMenus,characterIcon,teamSections,characterFields};
