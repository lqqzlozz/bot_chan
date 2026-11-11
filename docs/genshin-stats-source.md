# Genshin stats data adapter

The commands `/stats-pull`, `/stats-usage`, and `/stats-team` are registered only in Genshin-enabled guilds.

## Source status (2026-11-11)
LaQoos publicly displays ownership percentages at https://www.laqoos.com/en-US/genshin/characters/active and has an Abyss party page at https://www.laqoos.com/en-US/genshin/abyss/party . Its page does **not** document a stable public JSON API. A direct HTTP probe from the development environment failed due to DNS/network restrictions, so neither a LaQoos endpoint nor permission to automate extraction has been verified. Do not point the JSON feed at the LaQoos HTML page.

## JSON feed contract
After verifying a legitimate source, set Render environment variable `GENSHIN_STATS_JSON_URL` to an HTTPS endpoint returning JSON like:

```json
{
  "source": "Verified source name",
  "period": "Season identifier",
  "updatedAt": "2026-11-11T00:00:00Z",
  "sampleSize": 100,
  "ownership": [{"name": "Character", "rate": 75.5}],
  "usage": [{"name": "Character", "rate": 30.2}],
  "teams": [{"name": "Character A / Character B / Character C / Character D", "rate": 8.4}]
}
```

These example values are **illustrative only**, not actual LaQoos statistics. Rates are percentages from 0 to 100. The server validates the payload, caches a valid feed for six hours, and falls back to the local `data/genshinStats.json` snapshot on failures. Without a verified feed, commands clearly report that statistics are being prepared. The denominator for usage and teams must be defined by the source before publication.
