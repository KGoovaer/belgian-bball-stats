import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { RawDeel, RawEvents, RawMatch } from "./model.ts";

const BASE = "https://vblCB.wisseq.eu/VBLCB_WebService/data";
const SITE = "https://www.basketbal.vlaanderen";
const CACHE_DIR = new URL("../.cache/", import.meta.url);

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw new Error(`${label} failed: ${last instanceof Error ? last.message : last}`);
}

async function http(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": "belgian-bball-stats/0.1" }, ...init });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

/** Match guids of a poule (competition), scraped from the public results page. */
export async function fetchPouleMatchGuids(pouleGuid: string): Promise<string[]> {
  const html = await withRetry("poule page", async () =>
    (await http(`${SITE}/resultaten/reeks/${pouleGuid}`)).text(),
  );
  const ids = new Set<string>();
  for (const m of html.matchAll(/wedguid=([A-Z0-9]+)/g)) ids.add(m[1]!);
  return [...ids].sort();
}

export async function fetchMatch(guid: string): Promise<RawMatch> {
  return withRetry(`match ${guid}`, async () => {
    const res = await http(`${BASE}/MatchByWedGuid?issguid=${encodeURIComponent(guid)}`);
    const body = (await res.json()) as RawMatch[];
    if (!body[0]) throw new Error("empty match response");
    return body[0];
  });
}

/** The match report endpoints are PUT calls that the public site makes anonymously ("na" auth). */
async function dwf<T>(endpoint: string, guid: string): Promise<T> {
  return withRetry(`${endpoint} ${guid}`, async () => {
    const res = await http(`${BASE}/${endpoint}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json; charset=utf-8", authorization: "na" },
      body: JSON.stringify({ AuthHeader: "na", WQVer: "sso:wqstat2.0", WedGUID: guid, CRUD: "R" }),
    });
    return (await res.json()) as T;
  });
}

export interface Report {
  deel: RawDeel;
  events: RawEvents;
}

/** Fetches (and caches) the public match report. Returns null when none is published. */
export async function fetchReport(match: RawMatch): Promise<Report | null> {
  const file = new URL(`${match.guid}.json`, CACHE_DIR);
  try {
    const cached = JSON.parse(await readFile(file, "utf8"));
    if (cached.lastUpdated === match.lastUpdated) return cached.report as Report | null;
  } catch {
    /* no usable cache */
  }
  let report: Report | null = null;
  try {
    const [deel, events] = await Promise.all([
      dwf<RawDeel>("DwfDeelByWedGuid", match.guid),
      dwf<RawEvents>("DwfVgngByWedGuid", match.guid),
    ]);
    if (Array.isArray(events?.GebNis) && events.GebNis.length > 0 && deel?.TtDeel) {
      // Strip personal data we do not need (scorer's e-mail address).
      for (const p of [...deel.TtDeel, ...(deel.TuDeel ?? [])]) delete (p as Partial<typeof p> & { AccountInfo?: string }).AccountInfo;
      delete (events as { userList?: string }).userList;
      report = { deel, events };
    }
  } catch {
    report = null; // report not public for this competition
  }
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, JSON.stringify({ lastUpdated: match.lastUpdated, report }));
  return report;
}

export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}
