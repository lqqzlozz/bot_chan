const fs=require('node:fs');
const path=require('node:path');
const {createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas');
const ROOT=path.join(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(ROOT,'data/genshinStats.json'),'utf8'));
const font=path.join(ROOT,'node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff2');
if(fs.existsSync(font)) try {GlobalFonts.registerFromPath(font,'NotoJP');}catch(e){console.warn(e.message);}
const fallback='sans-serif';
async function main(){
 for(const [key,file] of [['ownership','stats-pull.png'],['usage','stats-usage.png']]){
  const rows=(data[key]||[]).filter(x=>x.rarity===5 && Number.isFinite(x.rate));
  if(rows.length<60) throw new Error('Refusing incomplete '+key+' image: '+rows.length);
  const width=960,cw=240,ch=184;
  const canvas=createCanvas(width,Math.ceil(rows.length/4)*ch+28);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#20242c';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.textAlign='center';
  for(let n=0;n<rows.length;n++){
   const x=n%4*cw,y=Math.floor(n/4)*ch;
   ctx.fillStyle='#303746';ctx.fillRect(x+5,y+5,cw-10,ch-10);
   const id=rows[n].avatarId;
   if(id)try{
    const url='https://enka.network/ui/UI_AvatarIcon_'+id+'.png';
    const response=await fetch(url,{signal:AbortSignal.timeout(4500)});
    if(response.ok){const img=await loadImage(Buffer.from(await response.arrayBuffer()));const scale=Math.min(116/img.width,116/img.height);ctx.drawImage(img,x+(cw-img.width*scale)/2,y+6,img.width*scale,img.height*scale);}
   }catch(error){console.warn('Icon unavailable:',id,error.message);}
   ctx.fillStyle='#fff';ctx.font='bold 26px '+fallback;ctx.fillText(rows[n].rate.toFixed(1)+'%',x+cw/2,y+139);
   ctx.font='17px NotoJP, sans-serif';ctx.fillText(rows[n].name.slice(0,17),x+cw/2,y+166);
  }
  const output=path.join(ROOT,'data',file);
  fs.writeFileSync(output,canvas.toBuffer('image/png'));
  console.log('Saved',output,rows.length);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
