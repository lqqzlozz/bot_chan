// Japan-time VC mention schedule. An empty role means no mention.
const minute=s=>{if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(s||''))return null;return Number(s.slice(0,2))*60+Number(s.slice(3));};
function selected(schedule,now=new Date()){
 if(!schedule)return null;
 const start=minute(schedule.start),end=minute(schedule.end);
 if(start===null||end===null||start===end)return null;
 const hhmm=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const current=minute(hhmm);
 const active=start<end?current>=start&&current<end:current>=start||current<end;
 return active?(schedule.primaryRole||null):(schedule.secondaryRole||null);
}
module.exports={selected,minute};
