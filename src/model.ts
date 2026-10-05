export type Side = "H" | "A";

/** Raw payloads as returned by the Basketbal Vlaanderen (wisseq) API. */
export interface RawMatch {
  guid: string;
  teamThuisGUID: string;
  teamThuisNaam: string;
  teamUitGUID: string;
  teamUitNaam: string;
  scheduledAt: string;
  pouleGUID: string;
  pouleNaam: string;
  gespeeld: string;
  uitslag: string;
  lastUpdated: string;
  wedOff: string[] | null;
  accommodatieDoc?: { naam: string; adres?: { plaats?: string } } | null;
  dwfI4Match?: { aantPeriodes: number; duurPeriode: number } | null;
}

export interface RawParticipant {
  RelGUID: string;
  Naam: string;
  RugNr: string;
  Rol1e5: string;
  Functie: string;
  GebDat: string;
}

export interface RawDeel {
  TtDeel: RawParticipant[];
  TuDeel: RawParticipant[];
}

export interface RawEvent {
  GebType: number;
  Index: number;
  Periode: number;
  Minuut: number;
  TofU: string;
  RelGUID: string;
  RugNr: string;
  Text: string;
}

export interface RawEvents {
  GebNis: RawEvent[];
}

/** Normalised domain model written to web/data/data.json. */
export interface Match {
  guid: string;
  date: string;
  homeGuid: string;
  homeName: string;
  awayGuid: string;
  awayName: string;
  pouleGuid: string;
  pouleName: string;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  city: string | null;
  officials: string[];
  /** Points per period, only when a match report (verslag) is available. */
  periods: { home: number; away: number }[] | null;
  hasReport: boolean;
}

export interface PlayerGame {
  matchGuid: string;
  date: string;
  relGuid: string;
  name: string;
  number: string;
  teamGuid: string;
  teamName: string;
  opponentName: string;
  home: boolean;
  starter: boolean;
  points: number;
  freeThrows: number;
  twoPointers: number;
  threePointers: number;
  fouls: number;
  technicalFouls: number;
  /** Approximate minutes on court (substitution log has minute resolution). */
  minutes: number;
  plusMinus: number;
  teamScore: number;
  opponentScore: number;
  win: boolean;
}

export interface PlayerTotals {
  games: number;
  starts: number;
  points: number;
  freeThrows: number;
  twoPointers: number;
  threePointers: number;
  fouls: number;
  technicalFouls: number;
  minutes: number;
  plusMinus: number;
  wins: number;
  pointsPerGame: number;
  pointsPer40: number | null;
  foulsPerGame: number;
  highPoints: number;
}

export interface Player {
  relGuid: string;
  name: string;
  teamGuid: string;
  teamName: string;
  totals: PlayerTotals;
  games: PlayerGame[];
}

export interface StandingRow {
  teamGuid: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  points: number;
  homeRecord: { w: number; l: number };
  awayRecord: { w: number; l: number };
  /** Most recent first-to-last results, "W"/"L"/"D". */
  form: string[];
}

export interface Dataset {
  generatedAt: string;
  season: string;
  focusTeam: string;
  focusPlayer: string;
  poules: { guid: string; name: string }[];
  standings: Record<string, StandingRow[]>;
  matches: Match[];
  players: Player[];
}
