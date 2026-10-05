import { barChart } from "./charts.js";

const app = document.getElementById("app");
const S1 = "var(--series-1)";
const S2 = "var(--series-2)";

let data;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const enc = encodeURIComponent;
const dateFmt = new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", month: "short" });
const shortFmt = new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "numeric" });
const d1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "–");
const signed = (n) => (n > 0 ? `+${n}` : String(n));

const teamName = (guid) => data.teamNames.get(guid) ?? guid;
const teamLink = (guid, name = teamName(guid)) => `<a href="#/team/${enc(guid)}">${esc(name)}</a>`;
const playerLink = (p) => `<a href="#/player/${enc(p.relGuid)}">${esc(p.name)}</a>`;
const chip = (r) => `<span class="chip ${r}" title="${{ W: "Win", L: "Loss", D: "Draw" }[r]}">${r}</span>`;

function tile(value, label, note = "") {
  return `<div class="tile"><div class="v">${value}</div><div class="l">${label}</div>${note ? `<div class="n">${note}</div>` : ""}</div>`;
}

function resultFor(m, guid) {
  const home = m.homeGuid === guid;
  const f = home ? m.homeScore : m.awayScore;
  const a = home ? m.awayScore : m.homeScore;
  return { home, f, a, r: f > a ? "W" : f < a ? "L" : "D", opp: home ? m.awayName : m.homeName, oppGuid: home ? m.awayGuid : m.homeGuid };
}

function scoreCell(m) {
  if (!m.played) return `<span class="muted">${new Date(m.date).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}</span>`;
  const hw = m.homeScore > m.awayScore;
  const txt = `<span class="${hw ? "w" : "lo"}">${m.homeScore}</span> – <span class="${!hw ? "w" : "lo"}">${m.awayScore}</span>`;
  return m.hasReport ? `<a class="score" href="#/match/${enc(m.guid)}">${txt}</a>` : `<span class="score">${txt}</span>`;
}

function formChips(form) {
  return `<span class="form">${form.slice(-5).map(chip).join("")}</span>`;
}

/* ---------- League ---------- */
function standingsTable(rows, highlight) {
  return `<div class="table-wrap"><table>
    <thead><tr><th class="pos">#</th><th class="l">Team</th><th>P</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>+/−</th><th>Pts</th><th>Form</th></tr></thead>
    <tbody>${rows
      .map(
        (r, i) => `<tr class="${r.teamGuid === highlight ? "focus" : ""}">
      <td class="pos">${i + 1}</td><td class="name">${teamLink(r.teamGuid, r.teamName)}</td>
      <td>${r.played}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.pointsFor}</td><td>${r.pointsAgainst}</td>
      <td>${signed(r.diff)}</td><td><b>${r.points}</b></td><td>${formChips(r.form)}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
}

function scorersTable(players, limit) {
  return `<div class="table-wrap"><table>
    <thead><tr><th class="l">Player</th><th class="l">Team</th><th>GP</th><th>Pts</th><th>PPG</th><th>3P</th></tr></thead>
    <tbody>${players
      .slice(0, limit)
      .map(
        (p) => `<tr class="${p.relGuid === data.focusPlayer ? "focus" : ""}"><td class="name">${playerLink(p)}</td>
      <td class="name l">${teamLink(p.teamGuid, p.teamName)}</td><td>${p.totals.games}</td><td><b>${p.totals.points}</b></td>
      <td>${d1(p.totals.pointsPerGame)}</td><td>${p.totals.threePointers}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
}

function leagueView() {
  const fp = data.players.find((p) => p.relGuid === data.focusPlayer);
  const html = [`<h1>League overview</h1><p class="sub">Season ${esc(data.season)} · computed from public match data</p>`];
  html.push(`<div class="cards">
    <a class="card" href="#/focus-team"><div class="t">${esc(teamName(data.focusTeam))}</div><div class="muted small">Team page: results, form, scorers</div></a>
    ${fp ? `<a class="card" href="#/focus-player"><div class="t">${esc(fp.name)}</div><div class="muted small">${fp.totals.games} games · ${fp.totals.points} pts · ${d1(fp.totals.pointsPerGame)} PPG</div></a>` : ""}
  </div>`);
  for (const p of data.poules) {
    const rows = data.standings[p.guid] ?? [];
    html.push(`<h2>${esc(p.name)}: standings</h2>${standingsTable(rows, data.focusTeam)}`);
    const inPoule = new Set(rows.map((r) => r.teamGuid));
    const top = data.players.filter((pl) => inPoule.has(pl.teamGuid));
    html.push(`<h2>Top scorers</h2>${scorersTable(top, 10)}<p class="small"><a href="#/players">All players →</a></p>`);
  }
  app.innerHTML = html.join("");
}

/* ---------- Team ---------- */
function teamView(guid) {
  const matches = data.matches.filter((m) => m.homeGuid === guid || m.awayGuid === guid);
  if (!matches.length) return notFound("Team not found");
  const name = teamName(guid);
  const pouleGuid = matches[0].pouleGuid;
  const rows = data.standings[pouleGuid] ?? [];
  const idx = rows.findIndex((r) => r.teamGuid === guid);
  const row = rows[idx];
  const played = matches.filter((m) => m.played);
  const upcoming = matches.filter((m) => !m.played);

  const html = [`<h1>${esc(name)}</h1><p class="sub">${esc(matches[0].pouleName)} · season ${esc(data.season)}</p>`];
  if (row) {
    const n = row.played || 1;
    html.push(`<div class="tiles">
      ${tile(`${idx + 1}<small class="muted">/${rows.length}</small>`, "Position", `${row.points} league points`)}
      ${tile(`${row.wins}–${row.losses}`, "Record", `H ${row.homeRecord.w}–${row.homeRecord.l} · A ${row.awayRecord.w}–${row.awayRecord.l}`)}
      ${tile(d1(row.pointsFor / n), "Points scored / game")}
      ${tile(d1(row.pointsAgainst / n), "Points allowed / game")}
      ${tile(signed(Math.round((row.diff / n) * 10) / 10), "Avg. margin")}
    </div>`);
  }

  if (played.length) {
    html.push(`<h2>Points scored vs. allowed per game</h2><div id="ch-team"></div>`);
  }

  html.push(`<h2>Results &amp; schedule</h2><div class="table-wrap"><table>
    <thead><tr><th class="l">Date</th><th class="l">Match</th><th>Score</th><th></th></tr></thead><tbody>
    ${matches
      .map((m) => {
        const r = m.played ? resultFor(m, guid) : null;
        return `<tr><td class="l">${dateFmt.format(new Date(m.date))}</td>
          <td class="name l">${teamLink(m.homeGuid, m.homeName)} – ${teamLink(m.awayGuid, m.awayName)}</td>
          <td>${scoreCell(m)}</td><td>${r ? chip(r.r) : ""}</td></tr>`;
      })
      .join("")}</tbody></table></div>`);

  const squad = data.players.filter((p) => p.teamGuid === guid);
  if (squad.length) {
    html.push(`<h2>Players</h2><div class="table-wrap"><table>
      <thead><tr><th class="l">Player</th><th>GP</th><th>Pts</th><th>PPG</th><th>3P</th><th>PF</th><th>Min≈</th><th>+/−</th></tr></thead><tbody>
      ${squad
        .map(
          (p) => `<tr class="${p.relGuid === data.focusPlayer ? "focus" : ""}"><td class="name">${playerLink(p)}</td><td>${p.totals.games}</td>
        <td><b>${p.totals.points}</b></td><td>${d1(p.totals.pointsPerGame)}</td><td>${p.totals.threePointers}</td>
        <td>${d1(p.totals.foulsPerGame)}</td><td>${d1(p.totals.minutes / p.totals.games)}</td><td>${signed(p.totals.plusMinus)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`);
  }
  app.innerHTML = html.join("");

  if (played.length) {
    barChart(document.getElementById("ch-team"), {
      ariaLabel: `Points scored and allowed by ${name} in each played game`,
      series: [{ name: "Scored", color: S1 }, { name: "Allowed", color: S2 }],
      groups: played.map((m) => {
        const r = resultFor(m, guid);
        return {
          label: shortFmt.format(new Date(m.date)),
          values: [r.f, r.a],
          tip: `<b>${r.home ? "vs" : "@"} ${esc(r.opp)}</b><br>${r.f}–${r.a} (${r.r})<br>${dateFmt.format(new Date(m.date))}`,
        };
      }),
      ref: { value: Math.round((row.pointsFor / row.played) * 10) / 10, label: `avg scored ${d1(row.pointsFor / row.played)}` },
    });
  }
  void upcoming;
}

/* ---------- Players ---------- */
const COLS = [
  ["name", "Player", (p) => p.name, true],
  ["team", "Team", (p) => p.teamName, true],
  ["gp", "GP", (p) => p.totals.games],
  ["pts", "Pts", (p) => p.totals.points],
  ["ppg", "PPG", (p) => p.totals.pointsPerGame, false, (v) => d1(v)],
  ["ft", "FT", (p) => p.totals.freeThrows],
  ["fg2", "2P", (p) => p.totals.twoPointers],
  ["fg3", "3P", (p) => p.totals.threePointers],
  ["pf", "PF/g", (p) => p.totals.foulsPerGame, false, (v) => d1(v)],
  ["min", "Min≈/g", (p) => (p.totals.games ? p.totals.minutes / p.totals.games : 0), false, (v) => d1(v)],
  ["pm", "+/−", (p) => p.totals.plusMinus, false, (v) => signed(v)],
  ["hi", "High", (p) => p.totals.highPoints],
  ["p40", "Pts/40", (p) => p.totals.pointsPer40 ?? -1, false, (v) => (v < 0 ? "–" : d1(v))],
];

const playersState = { sort: "pts", dir: -1, team: "", q: "", min: 1 };

function playersView() {
  const teams = [...new Set(data.players.map((p) => p.teamName))].sort();
  app.innerHTML = `<h1>Players</h1><p class="sub">Season ${esc(data.season)} · derived from match reports (only games with a published report)</p>
    <div class="filters">
      <label>Team <select id="f-team"><option value="">All teams</option>${teams.map((t) => `<option ${t === playersState.team ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      <label>Search <input id="f-q" type="search" placeholder="Name" value="${esc(playersState.q)}"></label>
      <label>Min. games <input id="f-min" type="number" min="1" max="50" value="${playersState.min}" style="width:64px"></label>
    </div><div id="ptable"></div>`;
  const draw = () => {
    const s = playersState;
    const col = COLS.find((c) => c[0] === s.sort) ?? COLS[3];
    let list = data.players.filter(
      (p) =>
        (!s.team || p.teamName === s.team) &&
        p.totals.games >= s.min &&
        (!s.q || p.name.toLowerCase().includes(s.q.toLowerCase())),
    );
    list = list.sort((a, b) => {
      const x = col[2](a), y = col[2](b);
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * s.dir || a.name.localeCompare(b.name);
    });
    const shown = list.slice(0, 250);
    document.getElementById("ptable").innerHTML = `<div class="table-wrap"><table><thead><tr>
      ${COLS.map(
        (c) =>
          `<th class="${c[3] ? "l" : ""}" ${s.sort === c[0] ? `aria-sort="${s.dir < 0 ? "descending" : "ascending"}"` : ""}><button data-sort="${c[0]}">${c[1]}${s.sort === c[0] ? (s.dir < 0 ? " ↓" : " ↑") : ""}</button></th>`,
      ).join("")}</tr></thead><tbody>
      ${shown
        .map(
          (p) => `<tr class="${p.relGuid === data.focusPlayer ? "focus" : ""}"><td class="name">${playerLink(p)}</td>
        <td class="name l">${teamLink(p.teamGuid, p.teamName)}</td>
        ${COLS.slice(2).map((c) => `<td>${c[4] ? c[4](c[2](p)) : c[2](p)}</td>`).join("")}</tr>`,
        )
        .join("")}</tbody></table></div>
      <p class="small muted">${list.length} player${list.length === 1 ? "" : "s"}${list.length > shown.length ? ` (showing ${shown.length})` : ""}</p>`;
  };
  draw();
  document.getElementById("f-team").onchange = (e) => ((playersState.team = e.target.value), draw());
  document.getElementById("f-q").oninput = (e) => ((playersState.q = e.target.value), draw());
  document.getElementById("f-min").oninput = (e) => ((playersState.min = Math.max(1, Number(e.target.value) || 1)), draw());
  document.getElementById("ptable").onclick = (e) => {
    const k = e.target.closest("button[data-sort]")?.dataset.sort;
    if (!k) return;
    if (playersState.sort === k) playersState.dir *= -1;
    else {
      playersState.sort = k;
      playersState.dir = COLS.find((c) => c[0] === k)[3] ? 1 : -1;
    }
    draw();
  };
}

/* ---------- Player ---------- */
function playerView(id) {
  const p = data.players.find((x) => x.relGuid === id);
  if (!p) {
    return notFound(
      id === data.focusPlayer
        ? "No match reports with this player yet."
        : "Player not found (only players with at least one published match report are listed).",
    );
  }
  const t = p.totals;
  const rank = data.players.findIndex((x) => x.relGuid === id) + 1;
  const teamPts = p.games.reduce((s, g) => s + g.teamScore, 0);
  const html = [
    `<h1>${esc(p.name)}</h1><p class="sub">${teamLink(p.teamGuid, p.teamName)} · season ${esc(data.season)}</p>`,
    `<div class="tiles">
      ${tile(t.games, "Games", `${t.starts} start${t.starts === 1 ? "" : "s"} · ${t.wins} win${t.wins === 1 ? "" : "s"}`)}
      ${tile(t.points, "Points", `#${rank} of ${data.players.length} in the data`)}
      ${tile(d1(t.pointsPerGame), "Points / game", `high ${t.highPoints}`)}
      ${tile(`${t.threePointers}`, "Three-pointers", `${t.twoPointers} twos · ${t.freeThrows} FT`)}
      ${tile(d1(t.foulsPerGame), "Fouls / game", `${t.fouls} total`)}
      ${tile(d1(t.minutes / t.games), "Minutes / game ≈", t.pointsPer40 === null ? "" : `${d1(t.pointsPer40)} pts per 40`)}
      ${tile(signed(t.plusMinus), "Plus / minus ≈", `${Math.round((t.points / teamPts) * 100)}% of team points`)}
    </div>`,
    `<div class="grid2"><div><h2>Points per game</h2><div id="ch-pts"></div></div>
      <div><h2>Minutes per game (approx.)</h2><div id="ch-min"></div></div></div>`,
    `<h2>Game log</h2><div class="table-wrap"><table>
      <thead><tr><th class="l">Date</th><th class="l">Opponent</th><th>Result</th><th>Min≈</th><th>Pts</th><th>FT</th><th>2P</th><th>3P</th><th>PF</th><th>+/−</th></tr></thead><tbody>
      ${[...p.games]
        .reverse()
        .map(
          (g) => `<tr><td class="l">${dateFmt.format(new Date(g.date))}</td><td class="name l">${g.home ? "vs" : "@"} ${esc(g.opponentName)}</td>
        <td><a class="score" href="#/match/${enc(g.matchGuid)}">${g.teamScore}–${g.opponentScore}</a> ${chip(g.win ? "W" : "L")}</td>
        <td>${g.minutes}</td><td><b>${g.points}</b></td><td>${g.freeThrows}</td><td>${g.twoPointers}</td><td>${g.threePointers}</td>
        <td>${g.fouls + g.technicalFouls}</td><td>${signed(g.plusMinus)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`,
  ];
  app.innerHTML = html.join("");

  const groups = (key, unit) =>
    p.games.map((g) => ({
      label: shortFmt.format(new Date(g.date)),
      values: [g[key]],
      tip: `<b>${g.home ? "vs" : "@"} ${esc(g.opponentName)}</b><br>${g[key]} ${unit}<br>${g.teamScore}–${g.opponentScore} (${g.win ? "W" : "L"})<br>${dateFmt.format(new Date(g.date))}`,
    }));
  barChart(document.getElementById("ch-pts"), {
    ariaLabel: `Points scored by ${p.name} in each game`,
    series: [{ name: "Points", color: S1 }],
    groups: groups("points", "points"),
    ref: { value: Math.round(t.pointsPerGame * 10) / 10, label: `avg ${d1(t.pointsPerGame)}` },
    height: 210,
  });
  barChart(document.getElementById("ch-min"), {
    ariaLabel: `Approximate minutes played by ${p.name} in each game`,
    series: [{ name: "Minutes", color: S1 }],
    groups: groups("minutes", "min (approx.)"),
    ref: { value: Math.round((t.minutes / t.games) * 10) / 10, label: `avg ${d1(t.minutes / t.games)}` },
    height: 210,
  });
}

/* ---------- Match ---------- */
function boxTable(games, guid) {
  const list = games.filter((g) => g.teamGuid === guid).sort((a, b) => Number(a.number) - Number(b.number));
  return `<div class="table-wrap"><table><thead><tr><th class="l">#</th><th class="l">Player</th><th>Min≈</th><th>Pts</th><th>FT</th><th>2P</th><th>3P</th><th>PF</th><th>+/−</th></tr></thead><tbody>
    ${list
      .map(
        (g) => `<tr class="${g.relGuid === data.focusPlayer ? "focus" : ""}"><td class="l">${esc(g.number)}</td>
      <td class="name l"><a href="#/player/${enc(g.relGuid)}">${esc(g.name)}</a>${g.starter ? ' <span class="muted small" title="Starter">●</span>' : ""}</td>
      <td>${g.minutes}</td><td><b>${g.points}</b></td><td>${g.freeThrows}</td><td>${g.twoPointers}</td><td>${g.threePointers}</td>
      <td>${g.fouls + g.technicalFouls}</td><td>${signed(g.plusMinus)}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
}

function matchView(guid) {
  const m = data.matches.find((x) => x.guid === guid);
  if (!m) return notFound("Match not found");
  const games = data.players.flatMap((p) => p.games.filter((g) => g.matchGuid === guid));
  const html = [
    `<a class="back" href="javascript:history.back()">← Back</a>
    <h1>${teamLink(m.homeGuid, m.homeName)} <span class="muted">vs</span> ${teamLink(m.awayGuid, m.awayName)}</h1>
    <p class="sub">${dateFmt.format(new Date(m.date))} · ${esc(m.pouleName)}${m.venue ? ` · ${esc(m.venue)}${m.city ? `, ${esc(m.city)}` : ""}` : ""}${m.officials.length ? ` · Referees: ${esc(m.officials.join(", "))}` : ""}</p>`,
  ];
  if (!m.played) {
    html.push(`<div class="empty">Not played yet.</div>`);
    app.innerHTML = html.join("");
    return;
  }
  const per = m.periods ?? [];
  html.push(`<div class="table-wrap"><table><thead><tr><th class="l">Team</th>${per.map((_, i) => `<th>${i < 4 ? `Q${i + 1}` : `OT${i - 3}`}</th>`).join("")}<th>Final</th></tr></thead><tbody>
    <tr><td class="name l">${esc(m.homeName)}</td>${per.map((p) => `<td>${p.home}</td>`).join("")}<td><b>${m.homeScore}</b></td></tr>
    <tr><td class="name l">${esc(m.awayName)}</td>${per.map((p) => `<td>${p.away}</td>`).join("")}<td><b>${m.awayScore}</b></td></tr></tbody></table></div>`);
  if (games.length) {
    html.push(`<div class="grid2"><div><h2>${esc(m.homeName)}</h2>${boxTable(games, m.homeGuid)}</div><div><h2>${esc(m.awayName)}</h2>${boxTable(games, m.awayGuid)}</div></div>
      <p class="small muted">● starter. Minutes and +/− are approximate (substitutions are logged per minute).</p>`);
  } else {
    html.push(`<p class="empty" style="margin-top:16px">No box score published for this match.</p>`);
  }
  app.innerHTML = html.join("");
}

function notFound(msg) {
  app.innerHTML = `<h1>Nothing here</h1><div class="empty">${esc(msg)}</div><p><a href="#/">← League overview</a></p>`;
}

/* ---------- Router ---------- */
function route() {
  hideTip();
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean).map(decodeURIComponent);
  const [a, b] = parts;
  let nav = "home";
  if (!a) leagueView();
  else if (a === "focus-team") ((nav = "team"), teamView(data.focusTeam));
  else if (a === "team") ((nav = "team"), teamView(b));
  else if (a === "players") ((nav = "players"), playersView());
  else if (a === "focus-player") ((nav = "player"), playerView(data.focusPlayer));
  else if (a === "player") ((nav = b === data.focusPlayer ? "player" : "players"), playerView(b));
  else if (a === "match") ((nav = "home"), matchView(b));
  else notFound("Unknown page");
  document.querySelectorAll("header nav a").forEach((l) => {
    if (l.dataset.nav === nav) l.setAttribute("aria-current", "page");
    else l.removeAttribute("aria-current");
  });
  scrollTo(0, 0);
}
function hideTip() {
  document.getElementById("tip").hidden = true;
}

async function main() {
  try {
    data = await (await fetch("data/data.json")).json();
  } catch (err) {
    app.innerHTML = `<h1>No data yet</h1><div class="empty">Run <code>npm run fetch</code> to generate <code>web/data/data.json</code>.</div>`;
    return;
  }
  data.teamNames = new Map();
  for (const m of data.matches) {
    data.teamNames.set(m.homeGuid, m.homeName);
    data.teamNames.set(m.awayGuid, m.awayName);
  }
  document.getElementById("meta").textContent = `Updated ${new Date(data.generatedAt).toLocaleString("nl-BE", { dateStyle: "medium", timeStyle: "short" })}`;
  addEventListener("hashchange", route);
  route();
}
main();
