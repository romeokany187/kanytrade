import type { MarketId } from "./football-model";

export type AnalysisMatch = {
  id: string;
  competitionSlug: string;
  competitionName: string;
  homeName: string;
  awayName: string;
  homePlayer: string;
  awayPlayer: string;
  homeAttack: string;
  homeDefense: string;
  awayAttack: string;
  awayDefense: string;
  leagueGoals: string;
  firstHalfShare: string;
  homeLeague: string;
  awayLeague: string;
  oddsHome: string;
  oddsDraw: string;
  oddsAway: string;
  oddsHalfFirst: string;
  oddsHalfEqual: string;
  oddsHalfSecond: string;
  oddsHalf1X: string;
  oddsHalf12: string;
  oddsHalfX2: string;
  oddsOver25: string;
  oddsUnder25: string;
  oddsDouble1X: string;
  oddsDouble12: string;
  oddsDoubleX2: string;
  oddsBothScore: string;
  oddsNotBoth: string;
  pick: MarketId | "";
  included: boolean;
  fixtureId: string;
};

export type AnalysisState = {
  bankroll: string;
  matches: AnalysisMatch[];
};

const STORAGE_KEY = "kanytrade.football.analysis";

export function blankMatch(competitionSlug = ""): AnalysisMatch {
  return {
    id: crypto.randomUUID(),
    competitionSlug,
    competitionName: "",
    homeName: "",
    awayName: "",
    homePlayer: "",
    awayPlayer: "",
    homeAttack: "",
    homeDefense: "",
    awayAttack: "",
    awayDefense: "",
    leagueGoals: "",
    firstHalfShare: "",
    homeLeague: "",
    awayLeague: "",
    oddsHome: "",
    oddsDraw: "",
    oddsAway: "",
    oddsHalfFirst: "",
    oddsHalfEqual: "",
    oddsHalfSecond: "",
    oddsHalf1X: "",
    oddsHalf12: "",
    oddsHalfX2: "",
    oddsOver25: "",
    oddsUnder25: "",
    oddsDouble1X: "",
    oddsDouble12: "",
    oddsDoubleX2: "",
    oddsBothScore: "",
    oddsNotBoth: "",
    pick: "",
    included: true,
    fixtureId: "",
  };
}

export function emptyAnalysis(): AnalysisState {
  return { bankroll: "100000", matches: [] };
}

export function loadAnalysis(): AnalysisState {
  if (typeof window === "undefined") return emptyAnalysis();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAnalysis();
    const parsed = JSON.parse(raw) as AnalysisState;
    if (!parsed || !Array.isArray(parsed.matches)) return emptyAnalysis();
    return {
      bankroll: parsed.bankroll || "100000",
      matches: parsed.matches.filter((match) => match && typeof match.id === "string"),
    };
  } catch {
    return emptyAnalysis();
  }
}

export function saveAnalysis(state: AnalysisState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
