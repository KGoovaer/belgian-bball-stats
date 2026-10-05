import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aggregatePlayer, analyseGame, computeStandings, normalizeMatch, parseScore } from "../src/stats.ts";
import type { Match } from "../src/model.ts";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

test("parseScore handles the padded API format", () => {
  assert.deepEqual(parseScore(" 99- 19"), [99, 19]);
  assert.deepEqual(parseScore("118- 50"), [118, 50]);
  assert.equal(parseScore(""), null);
});

for (const name of ["AIB", "ALI"]) {
  test(`player points add up to the final score (${name})`, () => {
    const { match, deel, vgng } = fixture(name);
    const raw = match[0] ?? match;
    const [home, away] = parseScore(raw.uitslag)!;
    const res = analyseGame(raw, deel, vgng);
    assert.equal(res.teamPoints.home, home);
    assert.equal(res.teamPoints.away, away);
    const periodSum = res.periods.reduce((s, p) => s + p.home, 0);
    assert.equal(periodSum, home);
    assert.equal(res.periods.reduce((s, p) => s + p.away, 0), away);
    for (const g of res.games) {
      assert.equal(g.points, g.freeThrows + 2 * g.twoPointers + 3 * g.threePointers);
      assert.ok(g.minutes >= 0 && g.minutes <= 40, `${g.name} minutes ${g.minutes}`);
    }
  });
}

test("Koen Goovaerts box score in Telstar - Duffel", () => {
  const { match, deel, vgng } = fixture("AIB");
  const res = analyseGame(match[0], deel, vgng);
  const koen = res.games.find((g) => g.relGuid === "BVBL35770");
  assert.ok(koen, "Koen should be in the box score");
  assert.equal(koen.number, "16");
  assert.equal(koen.home, true);
  assert.equal(koen.win, true);
  assert.equal(koen.teamScore, 99);
  assert.equal(koen.opponentScore, 19);
  assert.ok(koen.points >= 4, "scored the first two baskets at least");
  assert.ok(koen.plusMinus > 0);
  const totals = aggregatePlayer([koen]);
  assert.equal(totals.games, 1);
  assert.equal(totals.pointsPerGame, koen.points);
});

const m = (
  guid: string, date: string, h: string, a: string, hs: number, as: number,
): Match => ({
  guid, date, homeGuid: h, homeName: h, awayGuid: a, awayName: a, pouleGuid: "P", pouleName: "P",
  played: true, homeScore: hs, awayScore: as, venue: null, city: null, officials: [], periods: null, hasReport: false,
});

test("standings: 3 points a win, 1 a loss, ordered by points then difference", () => {
  const rows = computeStandings([
    m("1", "2026-09-01", "A", "B", 80, 60),
    m("2", "2026-09-08", "B", "C", 70, 50),
    m("3", "2026-09-15", "C", "A", 60, 61),
    { ...m("4", "2026-09-22", "A", "C", 0, 0), played: false, homeScore: null, awayScore: null },
  ]);
  assert.deepEqual(rows.map((r) => r.teamName), ["A", "B", "C"]);
  const a = rows[0]!;
  assert.equal(a.points, 6);
  assert.equal(a.played, 2);
  assert.equal(a.diff, 21);
  assert.deepEqual(a.form, ["W", "W"]);
  assert.equal(rows[1]!.points, 4);
  assert.equal(rows[2]!.points, 2);
  assert.deepEqual(a.awayRecord, { w: 1, l: 0 });
});

test("normalizeMatch only counts finished matches with a score as played", () => {
  const { match } = fixture("AIB");
  const n = normalizeMatch(match[0]);
  assert.equal(n.played, true);
  assert.equal(n.homeScore, 99);
  assert.equal(n.awayScore, 19);
});

test("standings: head-to-head beats overall point difference when level on points", () => {
  // X and Y both end on 4 points; Y has the far better overall difference but lost to X.
  const rows = computeStandings([
    m("1", "2026-09-01", "X", "Y", 61, 60),
    m("2", "2026-09-08", "Y", "W", 100, 40),
    m("3", "2026-09-15", "V", "X", 80, 50),
  ]);
  assert.deepEqual(rows.map((r) => [r.teamName, r.points]), [["X", 4], ["Y", 4], ["V", 3], ["W", 1]]);
  assert.ok(rows[1]!.diff > rows[0]!.diff);
});

test("a recorded score counts as played even before the site flips its flag", () => {
  const { match } = fixture("AIB");
  assert.equal(normalizeMatch({ ...match[0], gespeeld: "N" }).played, true);
  assert.equal(normalizeMatch({ ...match[0], gespeeld: "N", uitslag: "" }).played, false);
});
