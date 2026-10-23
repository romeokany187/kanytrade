import { backtestHistory, parseHistory, type HistoricalMatch } from "@/lib/football-backtest";

const LEAGUES = [
  { code: "E0", name: "Premier League" },
  { code: "SP1", name: "La Liga" },
  { code: "I1", name: "Serie A" },
  { code: "D1", name: "Bundesliga" },
  { code: "F1", name: "Ligue 1" },
];
const SEASONS = ["2324", "2425", "2526"];

let cached: { at: number; body: unknown } | null = null;

async function loadSeason(season: string, league: string) {
  const response = await fetch(`https://www.football-data.co.uk/mmz4281/${season}/${league}.csv`, {
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!response.ok) return [];
  return parseHistory(await response.text(), `${league}-${season}`);
}

export async function GET() {
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) {
    return Response.json(cached.body);
  }

  const batches = await Promise.all(
    SEASONS.flatMap((season) => LEAGUES.map((league) => loadSeason(season, league.code))),
  );
  const matches = batches.flat();
  const summary = backtestHistory(matches as HistoricalMatch[]);
  const body = {
    source: "football-data.co.uk",
    odds: "Cotes de clôture Pinnacle quand elles existent, sinon Bet365",
    seasons: ["2023-2024", "2024-2025", "2025-2026"],
    leagues: LEAGUES.map((league) => league.name),
    ...summary,
  };
  cached = { at: Date.now(), body };
  return Response.json(body);
}
