import { loadSquad, type SquadTeam } from "./football-competitions";

export type DayFixture = {
  id: string;
  kickoff: string;
  status: "scheduled" | "live" | "finished";
  label: string;
  home: string;
  away: string;
  homeScore: string | null;
  awayScore: string | null;
  homeAttack: string;
  homeDefense: string;
  awayAttack: string;
  awayDefense: string;
  leagueGoals: string;
  homeLeague: string;
  awayLeague: string;
  firstHalfShare: string;
  ready: boolean;
};

const ESPN: Record<string, string> = {
  "premier-league": "eng.1",
  liga: "esp.1",
  "serie-a": "ita.1",
  bundesliga: "ger.1",
  "ligue-1": "fra.1",
  championship: "eng.2",
  "league-one": "eng.3",
  "league-two": "eng.4",
  "ligue-2": "fra.2",
  segunda: "esp.2",
  "serie-b": "ita.2",
  "bundesliga-2": "ger.2",
  eredivisie: "ned.1",
  "primeira-liga": "por.1",
  "super-lig": "tur.1",
  jupiler: "bel.1",
  "super-league": "gre.1",
  premiership: "sco.1",
  mls: "usa.1",
  brasileirao: "bra.1",
  "liga-mx": "mex.1",
  "j-league": "jpn.1",
  saudi: "ksa.1",
  "ligue-des-champions": "uefa.champions",
  "europa-league": "uefa.europa",
  "conference-league": "uefa.europa.conf",
  "fa-cup": "eng.fa",
  "coupe-de-france": "fra.coupe_de_france",
  "coupe-du-monde": "fifa.world",
  "ligue-des-nations": "uefa.nations",
};

const memory = new Map<string, { at: number; available: boolean; fixtures: DayFixture[] }>();
const TTL = 15 * 60 * 1000;

function keyOf(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rate(value: number | null) {
  return value != null && value > 0 ? value.toFixed(2) : "";
}

function findTeam(label: string, teams: SquadTeam[]) {
  const needle = keyOf(label);
  if (!needle) return null;
  const exact = teams.find((team) => [team.name, team.query, ...team.aliases].some((alias) => keyOf(alias) === needle));
  if (exact) return exact;
  let best: { team: SquadTeam; length: number } | null = null;
  for (const team of teams) {
    for (const alias of [team.name, team.query, ...team.aliases]) {
      const folded = keyOf(alias);
      if (folded.length < 4) continue;
      if (needle.includes(folded) || folded.includes(needle)) {
        if (!best || folded.length > best.length) best = { team, length: folded.length };
      }
    }
  }
  return best?.team ?? null;
}

function attachRates(homeLabel: string, awayLabel: string, teams: SquadTeam[]) {
  const home = findTeam(homeLabel, teams);
  const away = findTeam(awayLabel, teams);
  const homeLeague = home?.leagueGoals ?? null;
  const awayLeague = away?.leagueGoals ?? null;
  const known = [homeLeague, awayLeague].filter((value): value is number => value != null && value > 0);
  return {
    homeAttack: rate(home?.attack ?? null),
    homeDefense: rate(home?.defense ?? null),
    awayAttack: rate(away?.attack ?? null),
    awayDefense: rate(away?.defense ?? null),
    homeLeague: rate(homeLeague),
    awayLeague: rate(awayLeague),
    leagueGoals: known.length ? (known.reduce((sum, value) => sum + value, 0) / known.length).toFixed(2) : "",
    firstHalfShare: home?.firstHalfShare != null
      ? String(home.firstHalfShare)
      : away?.firstHalfShare != null
        ? String(away.firstHalfShare)
        : "",
    ready: Boolean(home?.attack && away?.attack && known.length),
  };
}

type EspnBody = {
  events?: Array<{
    id?: string;
    date?: string;
    status?: { type?: { state?: string; description?: string } };
    competitions?: Array<{
      competitors?: Array<{
        homeAway?: string;
        score?: string;
        team?: { displayName?: string };
      }>;
    }>;
  }>;
};

async function fetchDay(slug: string, date: string): Promise<{ available: boolean; fixtures: DayFixture[] }> {
  const code = ESPN[slug];
  if (!code) return { available: false, fixtures: [] };
  const cacheKey = `${slug}:${date}`;
  const hit = memory.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return { available: hit.available, fixtures: hit.fixtures };

  const squad = await loadSquad(slug);
  const teams = squad?.teams ?? [];
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${date.replaceAll("-", "")}`,
    { headers: { "User-Agent": "kanytrade" }, next: { revalidate: 900 } },
  );
  if (!response.ok) {
    const missing = response.status === 400 || response.status === 404;
    const empty = { available: !missing, fixtures: [] as DayFixture[] };
    if (missing) memory.set(cacheKey, { at: Date.now(), ...empty });
    return empty;
  }
  const body = await response.json() as EspnBody;
  const fixtures: DayFixture[] = (body.events ?? []).flatMap((event) => {
    const competitors = event.competitions?.[0]?.competitors ?? [];
    const home = competitors.find((side) => side.homeAway === "home");
    const away = competitors.find((side) => side.homeAway === "away");
    const homeName = home?.team?.displayName?.trim() ?? "";
    const awayName = away?.team?.displayName?.trim() ?? "";
    if (!homeName || !awayName || !event.id || !event.date) return [];
    const state = event.status?.type?.state;
    const status: DayFixture["status"] = state === "in" ? "live" : state === "post" ? "finished" : "scheduled";
    const label = status === "live" ? "En cours" : status === "finished" ? "Terminé" : "Prévu";
    return [{
      id: event.id,
      kickoff: event.date,
      status,
      label,
      home: homeName,
      away: awayName,
      homeScore: status === "scheduled" ? null : home?.score ?? null,
      awayScore: status === "scheduled" ? null : away?.score ?? null,
      ...attachRates(homeName, awayName, teams),
    }];
  }).sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  memory.set(cacheKey, { at: Date.now(), available: true, fixtures });
  return { available: true, fixtures };
}

export async function loadFixtures(slug: string, date: string, seek: boolean) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  const limit = seek ? 8 : 1;
  let cursor = start;
  let last = { available: true, fixtures: [] as DayFixture[] };
  for (let step = 0; step < limit; step += 1) {
    last = await fetchDay(slug, cursor);
    if (!last.available || last.fixtures.length || !seek || step === limit - 1) break;
    cursor = addDays(cursor, 1);
  }
  return { date: cursor, available: last.available, fixtures: last.fixtures };
}
