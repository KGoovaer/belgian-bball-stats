import type {
  Match,
  PlayerGame,
  PlayerTotals,
  RawDeel,
  RawEvents,
  RawMatch,
  RawParticipant,
  Side,
  StandingRow,
} from "./model.ts";

// Event codes in the match report (DwfVgng) log.
const EVT_SCORE = 10;
const EVT_FOUL = 30;
const EVT_SUB = 50;

// League points: win 3, draw 2, loss 1 (confirmed against the official table).
const POINTS = { win: 3, draw: 2, loss: 1 } as const;

export function parseScore(uitslag: string): [number, number] | null {
  const m = /(\d+)\s*-\s*(\d+)/.exec(uitslag ?? "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function normalizeMatch(
  raw: RawMatch,
  periods: Match["periods"] = null,
): Match {
  const score = parseScore(raw.uitslag);
  return {
    guid: raw.guid,
    date: raw.scheduledAt,
    homeGuid: raw.teamThuisGUID,
    homeName: raw.teamThuisNaam,
    awayGuid: raw.teamUitGUID,
    awayName: raw.teamUitNaam,
    pouleGuid: raw.pouleGUID,
    pouleName: raw.pouleNaam,
    // The "gespeeld" flag lags behind the recorded result; the official table goes by the score.
    played: score !== null,
    homeScore: score ? score[0] : null,
    awayScore: score ? score[1] : null,
    venue: raw.accommodatieDoc?.naam ?? null,
    city: raw.accommodatieDoc?.adres?.plaats?.trim() || null,
    officials: raw.wedOff ?? [],
    periods,
    hasReport: periods !== null,
  };
}

interface Acc {
  p: RawParticipant;
  side: Side;
  points: number;
  ft: number;
  fg2: number;
  fg3: number;
  fouls: number;
  tech: number;
  minutes: number;
  plusMinus: number;
  appeared: boolean;
  onSince: number | null;
}

export interface GameAnalysis {
  games: PlayerGame[];
  periods: { home: number; away: number }[];
  teamPoints: { home: number; away: number };
}

/**
 * Derives per-player box scores from a match report.
 *
 * The substitution log only has minute resolution, so minutes and plus/minus
 * are approximations (about +-1 minute per substitution).
 */
export function analyseGame(
  raw: RawMatch,
  deel: RawDeel,
  report: RawEvents,
): GameAnalysis {
  const match = normalizeMatch(raw);
  const periodLen = Math.round((raw.dwfI4Match?.duurPeriode ?? 600) / 60) || 10;
  const events = [...report.GebNis].sort((a, b) => a.Index - b.Index);
  const maxPeriod = events.reduce(
    (m, e) => (e.Periode < 90 && e.Periode > m ? e.Periode : m),
    1,
  );
  const gameEnd = maxPeriod * periodLen;

  const roster = new Map<string, Acc>();
  const addRoster = (list: RawParticipant[], side: Side) => {
    for (const p of list ?? []) {
      if (p.Functie !== "S") continue;
      roster.set(p.RelGUID, {
        p,
        side,
        points: 0,
        ft: 0,
        fg2: 0,
        fg3: 0,
        fouls: 0,
        tech: 0,
        minutes: 0,
        plusMinus: 0,
        appeared: false,
        onSince: null,
      });
    }
  };
  addRoster(deel.TtDeel, "H");
  addRoster(deel.TuDeel, "A");

  const periods: { home: number; away: number }[] = [];
  const closeStint = (acc: Acc, t: number) => {
    if (acc.onSince !== null) acc.minutes += Math.max(0, t - acc.onSince);
    acc.onSince = null;
  };

  for (const e of events) {
    const side: Side | null = e.TofU === "T" ? "H" : e.TofU === "U" ? "A" : null;
    const acc = roster.get(e.RelGUID);

    if (e.GebType === EVT_SUB && acc) {
      acc.appeared = true;
      const periodStart = (e.Periode - 1) * periodLen;
      if (e.Text === "in") {
        if (acc.onSince === null) acc.onSince = periodStart + (e.Minuut - 1);
      } else if (e.Text === "uit") {
        // "out" in the final minute means the end of the period.
        const t = e.Minuut >= periodLen ? e.Periode * periodLen : periodStart + (e.Minuut - 1);
        closeStint(acc, t);
      }
    } else if (e.GebType === EVT_SCORE && side) {
      const n = Number(/^(-?\d+)/.exec(e.Text)?.[1] ?? 0);
      if (n === 0) continue;
      const slot = (periods[e.Periode - 1] ??= { home: 0, away: 0 });
      slot[side === "H" ? "home" : "away"] += n;
      for (const a of roster.values()) {
        if (a.onSince === null) continue;
        a.plusMinus += a.side === side ? n : -n;
      }
      if (acc) {
        acc.appeared = true;
        acc.points += n;
        // Negative values are scorer's-table corrections of an earlier basket.
        const sign = Math.sign(n);
        if (Math.abs(n) === 1) acc.ft += sign;
        else if (Math.abs(n) === 2) acc.fg2 += sign;
        else if (Math.abs(n) === 3) acc.fg3 += sign;
      }
    } else if (e.GebType === EVT_FOUL && acc) {
      acc.appeared = true;
      if (e.Text.startsWith("T")) acc.tech += 1;
      else acc.fouls += 1;
    }
  }
  for (const a of roster.values()) closeStint(a, gameEnd);
  for (let i = 0; i < periods.length; i++) periods[i] ??= { home: 0, away: 0 };

  const teamPoints = { home: 0, away: 0 };
  for (const a of roster.values()) teamPoints[a.side === "H" ? "home" : "away"] += a.points;
  const homeScore = match.homeScore ?? teamPoints.home;
  const awayScore = match.awayScore ?? teamPoints.away;

  const games: PlayerGame[] = [];
  for (const a of roster.values()) {
    if (!a.appeared) continue;
    const home = a.side === "H";
    games.push({
      matchGuid: raw.guid,
      date: raw.scheduledAt,
      relGuid: a.p.RelGUID,
      name: a.p.Naam,
      number: a.p.RugNr,
      teamGuid: home ? raw.teamThuisGUID : raw.teamUitGUID,
      teamName: home ? raw.teamThuisNaam : raw.teamUitNaam,
      opponentName: home ? raw.teamUitNaam : raw.teamThuisNaam,
      home,
      starter: a.p.Rol1e5 === "Y",
      points: a.points,
      freeThrows: a.ft,
      twoPointers: a.fg2,
      threePointers: a.fg3,
      fouls: a.fouls,
      technicalFouls: a.tech,
      minutes: Math.round(a.minutes),
      plusMinus: a.plusMinus,
      teamScore: home ? homeScore : awayScore,
      opponentScore: home ? awayScore : homeScore,
      win: home ? homeScore > awayScore : awayScore > homeScore,
    });
  }
  return { games, periods, teamPoints };
}

export function aggregatePlayer(games: PlayerGame[]): PlayerTotals {
  const sum = (f: (g: PlayerGame) => number) => games.reduce((s, g) => s + f(g), 0);
  const n = games.length;
  const points = sum((g) => g.points);
  const minutes = sum((g) => g.minutes);
  return {
    games: n,
    starts: games.filter((g) => g.starter).length,
    points,
    freeThrows: sum((g) => g.freeThrows),
    twoPointers: sum((g) => g.twoPointers),
    threePointers: sum((g) => g.threePointers),
    fouls: sum((g) => g.fouls),
    technicalFouls: sum((g) => g.technicalFouls),
    minutes,
    plusMinus: sum((g) => g.plusMinus),
    wins: games.filter((g) => g.win).length,
    pointsPerGame: n ? points / n : 0,
    pointsPer40: minutes > 0 ? (points / minutes) * 40 : null,
    foulsPerGame: n ? sum((g) => g.fouls) / n : 0,
    highPoints: games.reduce((m, g) => Math.max(m, g.points), 0),
  };
}

export function computeStandings(matches: Match[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const row = (guid: string, name: string) => {
    let r = rows.get(guid);
    if (!r) {
      r = {
        teamGuid: guid,
        teamName: name,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        points: 0,
        homeRecord: { w: 0, l: 0 },
        awayRecord: { w: 0, l: 0 },
        form: [],
      };
      rows.set(guid, r);
    }
    return r;
  };

  const ordered = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  for (const m of ordered) {
    const home = row(m.homeGuid, m.homeName);
    const away = row(m.awayGuid, m.awayName);
    if (!m.played || m.homeScore === null || m.awayScore === null) continue;
    for (const [r, pf, pa, isHome] of [
      [home, m.homeScore, m.awayScore, true],
      [away, m.awayScore, m.homeScore, false],
    ] as const) {
      r.played++;
      r.pointsFor += pf;
      r.pointsAgainst += pa;
      const rec = isHome ? r.homeRecord : r.awayRecord;
      if (pf > pa) {
        r.wins++;
        rec.w++;
        r.points += POINTS.win;
        r.form.push("W");
      } else if (pf < pa) {
        r.losses++;
        rec.l++;
        r.points += POINTS.loss;
        r.form.push("L");
      } else {
        r.draws++;
        r.points += POINTS.draw;
        r.form.push("D");
      }
    }
  }
  for (const r of rows.values()) r.diff = r.pointsFor - r.pointsAgainst;
  return rankWithHeadToHead([...rows.values()], ordered);
}

/** Orders by points; teams level on points are separated by their mutual results first. */
function rankWithHeadToHead(rows: StandingRow[], matches: Match[]): StandingRow[] {
  const byPoints = new Map<number, StandingRow[]>();
  for (const r of rows) (byPoints.get(r.points) ?? byPoints.set(r.points, []).get(r.points)!).push(r);

  const ranked: StandingRow[] = [];
  for (const pts of [...byPoints.keys()].sort((a, b) => b - a)) {
    const group = byPoints.get(pts)!;
    const ids = new Set(group.map((r) => r.teamGuid));
    const h2h = new Map<string, { pts: number; diff: number }>(group.map((r) => [r.teamGuid, { pts: 0, diff: 0 }]));
    if (group.length > 1) {
      for (const m of matches) {
        if (!m.played || m.homeScore === null || m.awayScore === null) continue;
        if (!ids.has(m.homeGuid) || !ids.has(m.awayGuid)) continue;
        const home = h2h.get(m.homeGuid)!;
        const away = h2h.get(m.awayGuid)!;
        const [hp, ap] =
          m.homeScore > m.awayScore ? [POINTS.win, POINTS.loss] : m.homeScore < m.awayScore ? [POINTS.loss, POINTS.win] : [POINTS.draw, POINTS.draw];
        home.pts += hp;
        away.pts += ap;
        home.diff += m.homeScore - m.awayScore;
        away.diff += m.awayScore - m.homeScore;
      }
    }
    group.sort((a, b) => {
      const ha = h2h.get(a.teamGuid)!;
      const hb = h2h.get(b.teamGuid)!;
      return (
        hb.pts - ha.pts ||
        hb.diff - ha.diff ||
        b.diff - a.diff ||
        b.pointsFor - a.pointsFor ||
        a.teamName.localeCompare(b.teamName)
      );
    });
    ranked.push(...group);
  }
  return ranked;
}
