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
`utils/seasonSchedule.js`. `utils/seasonText.js` applies the user's explicit
substitutions and Japanese character forms rather than official localization.
Numerical magnitudes are preserved: 820萬 becomes 8.2M, 18億 becomes 1.8B.
Every date and reminder includes the requested localization notice.

Recurring events are generated independently using the site's day-8 start and
seven-day cadence, four reward slots, and three supplemental event rotations.
Reward slots are summaries rather than exact item lists. This is a community
schedule, not an official Japanese-server calendar; the result explains that.

Installation: on startup, the bot installs or updates the panel only in channel
`1568107786376847501` in the Entry guild. It recovers the existing panel from
saved metadata or recent history to avoid duplicates. The management panel
has no season-schedule controls. The ordinary persistent
message has a reusable date button. Results are public Embeds grouped by date
and span the requested date through that season's projected last day. Repeated
requests update the same dated posts. The last-day post also identifies the
next season's opening; it does not list the next season's other events.
No slash command or sticky reposting is added.

Reminders reply to the dated posts at 08:00 JST, the game's daily reset.
Dungeon unlocks: 7 and 2 days before; relics: 10 and 3 days before;
next season: one calendar month (clamped at month end), 7 days, and 1 day before.
Other events do not generate reminders. The next-season reminder replies to
the last-day post that carries its opening notice. Posts and reminder IDs are
persisted through the existing Discord-backed configuration store. Interrupted
sends are recovered by their footer markers before any retry sends a message.
A failed configuration write prevents a new send. The game day ends at the
following calendar day's 07:59 JST, allowing recovery within that game day;
older missed reminders are not sent in a burst after an extended outage.
