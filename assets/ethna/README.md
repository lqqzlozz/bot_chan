# Timeline data

Source: [那由多 — 杖劍時間軸](https://qenu.github.io/ethna-timeline/)

`schedule.json` is a data snapshot retrieved on 2026-11-06 from
https://qenu.github.io/ethna-timeline/assets/data/schedule.json.
It is used when the live source is unavailable. The bot checks the live source
at most once per six hours, validates it, and retains the last good data.

The Entry guild's confirmed Ignis opening (2026-11-11, source day 316) anchors
calendar dates. Later kingdom openings define season boundaries; the preceding
day is the projected season end. Initial season boundaries and an unpublished
next season are not guessed. If server dates change, update the anchor in
`utils/seasonSchedule.js`. Source names are preserved; category names and
the supplied season names are displayed in Japanese.

Recurring events are generated independently using the site's day-8 start and
seven-day cadence, four reward slots, and three supplemental event rotations.
Reward slots are summaries rather than exact item lists. This is a community
schedule, not an official Japanese-server calendar; the result explains that.

Installation: on startup, the bot installs or updates the panel only in channel
`1568107786376847501` in the Entry guild. It recovers the existing panel from
saved metadata or recent history to avoid duplicates. The management panel
has no season-schedule controls. The ordinary persistent
message has a reusable date button. Results are ephemeral Embeds and span the
requested date through that season's projected last day. No slash command,
automatic notification, or sticky reposting is added.
