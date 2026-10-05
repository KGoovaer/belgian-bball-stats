# Belgian Basketball Stats

Dashboard for Basketbal Vlaanderen competitions: standings, team form, results, league-wide player leaderboards and per-player game logs. Built for Telstar B.B.C. Mechelen HSE A (3e Prov. Heren Antwerpen A) and player Koen Goovaerts, but driven by `config.json` so other competitions work too.

## Run

```sh
npm install
npm run fetch     # pulls public data -> web/data/data.json (a few seconds; cached in .cache/)
npm run serve     # http://localhost:8080
npm test          # unit tests (node:test, Node >= 22.18)
npm run typecheck
```

`npm run fetch <pouleGuid> [<pouleGuid> ...]` overrides the competitions in `config.json`. A poule guid is the last segment of a `basketbal.vlaanderen/resultaten/reeks/<guid>` URL.

## Where the data comes from (no login needed)

- **Matches**: `vblCB.wisseq.eu/VBLCB_WebService/data/MatchByWedGuid` (public JSON). The list of match ids per competition is scraped from the public results page.
- **Match reports (Verslag)**: `DwfDeelByWedGuid` (roster) and `DwfVgngByWedGuid` (play-by-play) — the same anonymous calls the public site makes. The report is public for senior (HSE/DSE) teams; for other categories it is skipped.
- Player stats (points, FT/2P/3P, fouls, minutes, +/-) are derived from the play-by-play. Minutes and +/- are approximate because substitutions are logged per minute.
- Standings are computed from results (3 pts win, 1 pt loss, head-to-head tie-break) and match the official table.
- Scorer e-mail addresses in the raw reports are stripped and never stored.

## Layout

```
src/api.ts     fetch + cache
src/stats.ts   pure logic: box scores, aggregates, standings (unit-tested)
src/build.ts   pipeline -> web/data/data.json
web/           static dashboard (vanilla JS + SVG charts)
test/          tests + real match fixtures
```

Config for the focus team/player lives in `config.json` (`focusTeam` = team guid, `focusPlayer` = relation guid, as in the portal's `/speler/<guid>` URL).
