function details(data, catalog, percent) {
  const characters = [];
  for (const [id, entry] of catalog) {
    const stats = data.character?.[id];
    if (!stats) continue;
    const constellations = (stats.constellations || [])
      .filter(row => /^[0-6]$/.test(row.id) && typeof row.value === 'number')
      .map(row => ({level: Number(row.id), rate: percent(row.value)}))
      .sort((a,b) => a.level - b.level);
    const artifacts = (stats.artifacts || [])
      .filter(row => row.set && typeof row.value === 'number' &&
        Object.entries(row.set).length && Object.entries(row.set).every(([id,count]) => /^\d+$/.test(id) && [1,2,4].includes(count)))
      .map(row => ({sets: row.set, rate: percent(row.value)}))
      .sort((a,b) => b.rate - a.rate).slice(0,3);
    const weapons = (stats.weapons || [])
      .filter(row => /^\d{5}$/.test(row.id) && typeof row.value === 'number')
      .map(row => ({id: Number(row.id), rate: percent(row.value)}))
      .sort((a,b) => b.rate - a.rate).slice(0,3);
    characters.push({...entry, constellations, artifacts, weapons});
  }
  const known = new Set(characters.map(row => row.avatarId));
  const teams = [];
  for (const half of [1,2]) {
    const seen = new Set();
    const ranked = [...(data.party?.[half] || [])].sort((a,b) => b.use_rate - a.use_rate);
    for (const row of ranked) {
      const members = String(row.id).split(',').map(Number);
      if (members.length !== 4 || new Set(members).size !== 4 || !members.every(id => known.has(id))) continue;
      const key = [...members].sort().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      teams.push({half, members, rate: percent(row.use_rate)});
    }
  }
  teams.sort((a,b) => a.half - b.half || b.rate - a.rate);
  return {characters, teams};
}
module.exports = {details};
