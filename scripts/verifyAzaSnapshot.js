// Independent smoke check against downloaded responses, without any network calls.
const fs = require('node:fs');
const {normalize} = require('../utils/azaStats');
const {valid, description} = require('../utils/genshinStatsView');
const [apiFile, pageFile] = process.argv.slice(2);
if (!apiFile || !pageFile) throw new Error('Usage: node scripts/verifyAzaSnapshot.js API.json PAGE.html');
const payload=JSON.parse(fs.readFileSync(apiFile,'utf8').replace(/^\uFEFF/,''));
const data=normalize(payload,fs.readFileSync(pageFile,'utf8'));
if (!valid(data)) throw new Error('Snapshot invalid');
fs.mkdirSync('data',{recursive:true});
fs.writeFileSync('data/genshinStats.json',JSON.stringify(data,null,2)+'\n');
for(const key of ['ownership','usage']) {
  const texts=description(data,key);
  if(texts.some(t=>t.length>4096)||texts.join('').length>5500) throw new Error('Discord embed limit');
}
const row=data.usage.find(x=>x.avatarId===10000002);
console.log(JSON.stringify({fiveStars:data.ownership.length,updatedAt:data.updatedAt,sample:data.sample,ayaka:row},null,2));
