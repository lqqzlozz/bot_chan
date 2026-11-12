function parsePower(input) {
  const value = input.normalize('NFKC').trim();
  const match = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d+))?([万億]?)$/.exec(value);
  if (!match) return null;
  const fraction = match[2] || '';
  const divisor = 10n ** BigInt(fraction.length);
  const multiplier = { '万': 10000n, '億': 100000000n }[match[3]] || 1n;
  const scaled = BigInt(match[1].replaceAll(',', '') + fraction) * multiplier;
  if (scaled % divisor !== 0n) return null;
  const power = Number(scaled / divisor);
  return Number.isSafeInteger(power) && power > 0 && power <= Number.MAX_SAFE_INTEGER / 4 ? power : null;
}

function splitTeams(participants, size) {
  if (![2, 4].includes(size)) throw new RangeError('Unsupported team size');
  const sorted = [...participants].sort((a, b) => b.power - a.power || a.id.localeCompare(b.id));
  const teams = Array.from({ length: Math.ceil(sorted.length / size) }, (_, index) => ({
    capacity: Math.min(size, sorted.length - index * size),
    members: [],
    total: 0,
    jobs: new Map()
  }));
  for (const player of sorted) {
    const job = player.job.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
    const candidates = teams.filter(team => team.members.length < team.capacity);
    candidates.sort((a, b) =>
      (a.jobs.get(job) || 0) - (b.jobs.get(job) || 0) ||
      a.total / a.capacity - b.total / b.capacity ||
      b.capacity - a.capacity
    );
    const team = candidates[0];
    team.members.push(player);
    team.total += player.power;
    team.jobs.set(job, (team.jobs.get(job) || 0) + 1);
  }
  return teams.map(({ members, total }) => ({ members, total }));
}

module.exports = { parsePower, splitTeams };
