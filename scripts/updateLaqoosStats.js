// Fetch publicly displayed LaQoos character statistics without relying on private APIs.
// Run via GitHub Actions; keep the previous snapshot on partial failures.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const BASE = 'https://www.laqoos.com/ja-JP/genshin';
const OUT = path.join(__dirname, '..', 'data', 'genshinStats.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({locale:'en-US'});
    await page.goto(BASE+'/characters/active',{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('a[href*="/genshin/characters/"]').first().waitFor({timeout:30000});
    const all = await page.locator('a[href*="/genshin/characters/"]').evaluateAll(nodes =>
      nodes.map(node => ({href:node.getAttribute('href'),text:(node.innerText||'').trim()})));
    const found = new Map();
    for (const item of all) {
      const match = item.href?.match(/\/genshin\/characters\/(\d+)\/active/);
      const rate = item.text.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      if (!match || !rate) continue;
      const name = item.text.replace(/\bC\d+\b/g,'').replace(/#\d+/g,'').replace(/\d{1,3}(?:\.\d+)?\s*%/g,'').replace(/In Progress/gi,'').trim();
      if (name && !found.has(match[1])) found.set(match[1],{avatarId:Number(match[1]),name,rate:Number(rate[1])});
    }
    console.log('Listing characters:',found.size);
    if(found.size<65) throw new Error('Listing incomplete: '+found.size);
    const rows=[...found.values()];
    const previous=JSON.parse(fs.readFileSync(OUT,'utf8'));
    const usage=[];
    let index=0;
    async function worker() {
      const p=await browser.newPage({locale:'ja-JP'});
      try {
        while(index<rows.length) {
          const item=rows[index++];
          try {
            await p.goto(BASE+'/characters/'+item.avatarId+'/active',{waitUntil:'domcontentloaded',timeout:45000});
            const text=await p.locator('body').innerText({timeout:15000});
            const heading=await p.locator('h1').first().innerText().catch(()=>null);
            if(heading) item.name=heading.trim();
            const rarity=text.match(/Rank\s+\d+\s+of\s+\d+\s+(4|5)★\s+characters/);
            item.rarity=rarity?Number(rarity[1]):null;
            const rate=text.match(/Spiral Abyss Usage Rate\s+(\d{1,3}(?:\.\d+)?)\s*%/);
            if(rate && item.rarity===5) usage.push({name:item.name,avatarId:item.avatarId,rarity:5,rate:Number(rate[1])});
          } catch(error) { console.warn('Character failed',item.avatarId,error.message); }
          await sleep(200);
        }
      } finally {await p.close();}
    }
    await Promise.all(Array.from({length:4},worker));
    const five=rows.filter(x=>x.rarity===5 && Number.isFinite(x.rate));
    console.log('Five-stars:',five.length,'usage:',usage.length);
    if(five.length<65 || usage.length<60) throw new Error('Insufficient verified five-star data; preserving previous snapshot');
    const sort = a => a.sort((x,y)=>y.rate-x.rate);
    const data={source:'LaQoos 公開統計',updatedAt:new Date().toISOString(),partial:five.length!==usage.length,
      ownership:sort(five.map(({name,avatarId,rarity,rate})=>({name,avatarId,rarity,rate}))),
      usage:sort(usage),teams:previous.teams||[]};
    fs.writeFileSync(OUT,JSON.stringify(data,null,2)+'\n');
    console.log('Saved',data.ownership.length,'ownership and',data.usage.length,'usage records');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});    // The listing's anchors contain IDs but percentages are displayed outside the anchor.
    const hrefs=await page.locator('a[href*="/genshin/characters/"]').evaluateAll(nodes =>
      nodes.map(node=>node.getAttribute('href')).filter(Boolean));
    const found=new Map();
    for(const href of hrefs){
      const match=href.match(/\/genshin\/characters\/(\d+)\/active/);
      if(match)found.set(match[1],{avatarId:Number(match[1])});
    }
    console.log('Listing characters:',found.size);
    if(found.size<100) throw new Error('Listing incomplete: '+found.size);
    const rows=[...found.values()];
    const previous=JSON.parse(fs.readFileSync(OUT,'utf8'));
    const usage=[];
    let index=0;
    async function worker() {
      const p=await browser.newPage({locale:'en-US'});
      try {
        while(index<rows.length) {
          const item=rows[index++];
          try {
            await p.goto(BASE+'/characters/'+item.avatarId+'/active',{waitUntil:'domcontentloaded',timeout:45000});
            const text=await p.locator('body').innerText({timeout:15000});
            const heading=await p.locator('h1').first().innerText().catch(()=>null);
            if(heading) item.name=heading.trim();
            const rarity=text.match(/Rank\s+\d+\s+of\s+\d+\s+(4|5)★\s+characters/);
            item.rarity=rarity?Number(rarity[1]):null;
            const rate=text.match(/Spiral Abyss Usage Rate\s+(\d{1,3}(?:\.\d+)?)\s*%/);
            if(rate && item.rarity===5) usage.push({name:item.name,avatarId:item.avatarId,rarity:5,rate:Number(rate[1])});
          } catch(error) { console.warn('Character failed',item.avatarId,error.message); }
          await sleep(200);
        }
      } finally {await p.close();}
    }
    await Promise.all(Array.from({length:4},worker));
    const five=rows.filter(x=>x.rarity===5);
    console.log('Five-stars:',five.length,'usage:',usage.length);
    if(five.length<65 || usage.length<60) throw new Error('Insufficient verified five-star data; preserving previous snapshot');
    const sort = a => a.sort((x,y)=>y.rate-x.rate);
    const data={source:'LaQoos 公開統計',updatedAt:new Date().toISOString(),partial:five.length!==usage.length,
      ownership:sort(five.map(({name,avatarId,rarity,rate})=>({name,avatarId,rarity,rate}))),
      usage:sort(usage),teams:previous.teams||[]};
    fs.writeFileSync(OUT,JSON.stringify(data,null,2)+'\n');
    console.log('Saved',data.ownership.length,'ownership and',data.usage.length,'usage records');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
