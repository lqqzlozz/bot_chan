const path = require('node:path');
const {update} = require('../utils/azaStats');
update(path.join(__dirname, '..', 'data', 'genshinStats.json')).then(data => {
  console.log(JSON.stringify({source:data.source, updatedAt:data.updatedAt, scheduleId:data.scheduleId, sample:data.sample, fiveStars:data.ownership.length}));
}).catch(error => {console.error(error.message); process.exitCode = 1;});
