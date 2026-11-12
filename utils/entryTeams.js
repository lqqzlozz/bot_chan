function parsePower(input) {
  const value = input.normalize('NFKC').trim();
  const match = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d+))?([万億MB]?)$/i.exec(value);
  if (!match) return null;
  const fraction = match[2] || '';
  const divisor = 10n ** BigInt(fraction.length);
  const multiplier = { '万': 10000n, '億': 100000000n, M: 1000000n, B: 1000000000n }[match[3].toUpperCase()] || 1n;
  const scaled = BigInt(match[1].replaceAll(',', '') + fraction) * multiplier;
  if (scaled % divisor !== 0n) return null;
  const power = Number(scaled / divisor);
  return Number.isSafeInteger(power) && power > 0 && power <= Number.MAX_SAFE_INTEGER / 4 ? power : null;
}

const strategies = {
  close: '戦力が近い者同士',
  balanced: 'チームの合計戦力を均等に',
  random: '完全ランダム',
  job: '職業で固める'
};

function splitTeams(participants, size, strategy = 'balanced', random = Math.random) {
  if (![2, 4].includes(size)) throw new RangeError('Unsupported team size');
  const sorted = [...participants].sort((a, b) => (b.power || 0) - (a.power || 0) || a.id.localeCompare(b.id));
  if (!Object.hasOwn(strategies, strategy)) throw new RangeError('Unsupported team strategy');
  if (strategy === 'random' || strategy === 'job') {
    if (strategy === 'job') sorted.sort((a,b) => (a.job || '未登録').localeCompare(b.job || '未登録', 'ja'));
    else for (let index = sorted.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [sorted[index], sorted[other]] = [sorted[other], sorted[index]];
    }
    const result = [];
    for (let index = 0; index < sorted.length; index += size) {
      const members = sorted.slice(index, index + size);
      result.push({ members, total: members.reduce((sum, player) => sum + (player.power || 0), 0) });
    }
    return result;
  }
  const teams = Array.from({ length: Math.ceil(sorted.length / size) }, (_, index) => ({
    capacity: Math.min(size, sorted.length - index * size),
    members: [],
    total: 0,
    jobs: new Map()
  }));
  for (const player of sorted) {
    const job = (player.job || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
    const candidates = teams.filter(team => team.members.length < team.capacity);
    candidates.sort((a, b) =>
      (job ? (a.jobs.get(job) || 0) - (b.jobs.get(job) || 0) : 0) ||
      (strategy === 'balanced' ? a.total / a.capacity - b.total / b.capacity : 0) ||
      b.capacity - a.capacity
    );
    const team = candidates[0];
    team.members.push(player);
    team.total += player.power || 0;
    team.jobs.set(job, (team.jobs.get(job) || 0) + 1);
  }
  return teams.map(({ members, total }) => ({ members, total }));
}

module.exports = { parsePower, splitTeams, strategies };
