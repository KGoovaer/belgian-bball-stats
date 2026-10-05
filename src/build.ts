import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fetchMatch, fetchPouleMatchGuids, fetchReport, mapPool } from "./api.ts";
import type { Dataset, Match, Player, PlayerGame } from "./model.ts";
import { aggregatePlayer, analyseGame, computeStandings, normalizeMatch } from "./stats.ts";

interface Config {
  poules: string[];
  focusTeam: string;
  focusPlayer: string;
}

const OUT = new URL("../web/data/data.json", import.meta.url);

function seasonOf(date: string): string {
  const d = new Date(date);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${y + 1}`;
}

async function main() {
  const config: Config = JSON.parse(
    await readFile(new URL("../config.json", import.meta.url), "utf8"),
  );
  const pouleArgs = process.argv.slice(2);
  const poules = pouleArgs.length ? pouleArgs : config.poules;

  const matches: Match[] = [];
  const games: PlayerGame[] = [];
  const pouleMeta: Dataset["poules"] = [];

  for (const poule of poules) {
    const guids = await fetchPouleMatchGuids(poule);
    console.log(`${poule}: ${guids.length} matches`);
    const raws = await mapPool(guids, 12, fetchMatch);
    pouleMeta.push({ guid: poule, name: raws[0]?.pouleNaam ?? poule });

    let reports = 0;
    await mapPool(raws, 6, async (raw) => {
      const base = normalizeMatch(raw);
      if (!base.played) return void matches.push(base);
      const report = await fetchReport(raw);
      if (!report) return void matches.push(base);
      const analysis = analyseGame(raw, report.deel, report.events);
      reports++;
      games.push(...analysis.games);
      matches.push(normalizeMatch(raw, analysis.periods));
    });
    console.log(`  ${raws.filter((r) => r.gespeeld === "G").length} played, ${reports} with match report`);
  }
  matches.sort((a, b) => a.date.localeCompare(b.date));

  const byPlayer = new Map<string, PlayerGame[]>();
  for (const g of games) (byPlayer.get(g.relGuid) ?? byPlayer.set(g.relGuid, []).get(g.relGuid)!).push(g);
  const players: Player[] = [...byPlayer.entries()].map(([relGuid, list]) => {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const last = list[list.length - 1]!;
    return {
      relGuid,
      name: last.name,
      teamGuid: last.teamGuid,
      teamName: last.teamName,
      totals: aggregatePlayer(list),
      games: list,
    };
  });
  players.sort((a, b) => b.totals.points - a.totals.points || a.name.localeCompare(b.name));

  const standings: Dataset["standings"] = {};
  for (const p of pouleMeta) standings[p.guid] = computeStandings(matches.filter((m) => m.pouleGuid === p.guid));

  const dataset: Dataset = {
    generatedAt: new Date().toISOString(),
    season: seasonOf(matches[0]?.date ?? new Date().toISOString()),
    focusTeam: config.focusTeam,
    focusPlayer: config.focusPlayer,
    poules: pouleMeta,
    standings,
    matches,
    players,
  };
  await mkdir(new URL("../web/data/", import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(dataset));
  console.log(`wrote web/data/data.json: ${matches.length} matches, ${players.length} players`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
