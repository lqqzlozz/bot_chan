const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const BASE='https://www.laqoos.com/ja-JP/genshin';
const OUT=path.join(__dirname,'..','data','genshinStats.json');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const browser=await chromium.launch({headless:true});
 try{
  // Derive playable five-star avatar IDs independently of LaQoos listing markup.
  const catalogUrl='https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/avatars.json';
  const response=await fetch(catalogUrl,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Enka avatar catalog HTTP '+response.status);
  const catalog=await response.json();
  const ids=[...new Set(Object.entries(catalog).filter(([id,v])=>
    /^1000\d{4}$/.test(id) &&
    (v.QualityType==='QUALITY_ORANGE'||Number(v.Rarity)===5)
  ).map(([id])=>id))];
  console.log('Enka five-star IDs:',ids.length,'includes 10000136:',ids.includes('10000136'));
  if(ids.length<65)throw new Error('Enka catalog incomplete: '+ids.length);
  let cursor=0;const ownership=[],usage=[];
  async function worker(){
   const p=await browser.newPage({locale:'ja-JP'});
   try{
    while(cursor<ids.length){
     const avatarId=Number(ids[cursor++]);
     try{
      await p.goto(BASE+'/characters/'+avatarId+'/active',{waitUntil:'domcontentloaded',timeout:45000});
      await p.getByText('所持率',{exact:true}).first().waitFor({timeout:12000});
      const text=await p.locator('body').innerText();
      if(!/★5キャラクター\s*\d+人中\s*\d+位/.test(text))continue;
      const name=await p.locator('h1').first().innerText().catch(()=>null);
      const own=text.match(/所持率\s*(\d{1,3}(?:\.\d+)?)\s*%/);
      const abyss=text.match(/深境螺旋の使用率\s*(\d{1,3}(?:\.\d+)?)\s*%/);
      if(!name||!own||!abyss){console.warn('Missing fields for',avatarId);continue;}
      const common={name:name.trim(),avatarId,rarity:5};
      ownership.push({...common,rate:Number(own[1])});
      usage.push({...common,rate:Number(abyss[1])});
     }catch(e){console.warn('Character failed:',avatarId,e.message);}
     await wait(150);
    }
   }finally{await p.close();}
  }
  await Promise.all(Array.from({length:4},worker));
  console.log('Verified five-star records:',ownership.length,usage.length);
  if(ownership.length<65||usage.length<65)throw new Error('Incomplete five-star data; retaining prior snapshot');
  const previous=JSON.parse(fs.readFileSync(OUT,'utf8'));
  const sort=a=>a.sort((x,y)=>y.rate-x.rate);
  const result={source:'LaQoos 公開統計',updatedAt:new Date().toISOString(),partial:false,ownership:sort(ownership),usage:sort(usage),teams:previous.teams||[]};
  fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
