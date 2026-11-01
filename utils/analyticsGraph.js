const {createCanvas}=require('@napi-rs/canvas');
function create(daily){
 const data=Object.entries(daily||{}).sort(([a],[b])=>a.localeCompare(b)).slice(-14);
 const canvas=createCanvas(1080,700),c=canvas.getContext('2d');
 c.fillStyle='#121826';c.fillRect(0,0,1080,700);
 c.fillStyle='#f8fafc';c.font='bold 38px sans-serif';c.fillText('SERVER ANALYTICS',48,64);
 c.font='21px sans-serif';c.fillStyle='#9ca3af';c.fillText('Last 14 recorded days / JST',48,99);
 const metrics=[{title:'MEMBERS',top:135,color:'#60a5fa',value:v=>v.members||0},{title:'VOICE HOURS',top:395,color:'#a78bfa',value:v=>(v.vcSeconds||0)/3600}];
 for(const m of metrics){
  c.fillStyle='#e5e7eb';c.font='bold 24px sans-serif';c.fillText(m.title,48,m.top);
  c.strokeStyle='#374151';c.beginPath();c.moveTo(48,m.top+195);c.lineTo(1030,m.top+195);c.stroke();
  if(!data.length){c.fillStyle='#9ca3af';c.font='22px sans-serif';c.fillText('No recorded data',48,m.top+110);continue;}
  const max=Math.max(1,...data.map(([,v])=>m.value(v)));
  const step=945/data.length;
  data.forEach(([date,v],n)=>{
   const x=63+n*step,y=m.top+188,h=Math.round(145*m.value(v)/max);
   c.fillStyle=m.color;c.fillRect(x,y-h,Math.max(8,step-12),h);
   if(n%Math.max(1,Math.ceil(data.length/7))===0){c.fillStyle='#9ca3af';c.font='14px sans-serif';c.fillText(date.slice(5),x,y+24);}
  });
 }
 c.fillStyle='#64748b';c.font='16px sans-serif';c.fillText('Only observed data is shown. Missing dates are not estimated.',48,672);
 return canvas.toBuffer('image/png');
}
module.exports={create};
