import { parseHistory, type HistoricalMatch } from "./football-backtest";

export type SquadTeam = {
  name: string;
  query: string;
  aliases: string[];
  attack: number | null;
  defense: number | null;
  leagueGoals: number | null;
  firstHalfShare: number | null;
  played: number;
};

export type CompetitionItem = {
  slug: string;
  name: string;
  area: string;
  ready: boolean;
};

export type CompetitionGroup = {
  title: string;
  items: CompetitionItem[];
};

type CompetitionDef = {
  slug: string;
  name: string;
  group: string;
  area: string;
  csv?: string[];
  nations?: "all" | "uefa" | "conmebol" | "caf";
  remote?: boolean;
  code?: string;
};

const ALIASES: Record<string, string[]> = {
  "Man City": ["Manchester City", "Manchester"],
  "Man United": ["Manchester United", "Man Utd"],
  "Nott'm Forest": ["Nottingham Forest", "Nottingham"],
  "Paris SG": ["PSG", "Paris Saint-Germain", "Paris"],
  "Ath Madrid": ["Atletico Madrid", "Atlético Madrid", "Atletico"],
  "Ath Bilbao": ["Athletic Bilbao", "Athletic"],
  "Sociedad": ["Real Sociedad"],
  "Betis": ["Real Betis"],
  "Espanol": ["Espanyol"],
  "Bayern Munich": ["Bayern", "Bayern München"],
  "Dortmund": ["Borussia Dortmund"],
  "Leverkusen": ["Bayer Leverkusen"],
  "M'gladbach": ["Gladbach", "Borussia Mönchengladbach"],
  "Ein Frankfurt": ["Eintracht Francfort", "Eintracht Frankfurt"],
  "FC Koln": ["Cologne", "Köln"],
  "Inter": ["Inter Milan", "Internazionale"],
  "Milan": ["AC Milan"],
  "Spurs": ["Tottenham"],
};

const EUROPE = ["E0", "SP1", "I1", "D1", "F1", "N1", "P1", "B1", "T1", "G1", "SC0"];

const COMPETITIONS: CompetitionDef[] = [
  { slug: "premier-league", name: "Premier League", group: "Championnats", area: "Angleterre", csv: ["E0"], code: "PL" },
  { slug: "liga", name: "Liga", group: "Championnats", area: "Espagne", csv: ["SP1"], code: "PD" },
  { slug: "serie-a", name: "Serie A", group: "Championnats", area: "Italie", csv: ["I1"], code: "SA" },
  { slug: "bundesliga", name: "Bundesliga", group: "Championnats", area: "Allemagne", csv: ["D1"], code: "BL1" },
  { slug: "ligue-1", name: "Ligue 1", group: "Championnats", area: "France", csv: ["F1"], code: "FL1" },
  { slug: "championship", name: "Championship", group: "Championnats", area: "Angleterre", csv: ["E1"], code: "ELC" },
  { slug: "league-one", name: "League One", group: "Championnats", area: "Angleterre", csv: ["E2"], code: "EL1" },
  { slug: "league-two", name: "League Two", group: "Championnats", area: "Angleterre", csv: ["E3"], code: "EL2" },
  { slug: "ligue-2", name: "Ligue 2", group: "Championnats", area: "France", csv: ["F2"], code: "FL2" },
  { slug: "segunda", name: "Segunda División", group: "Championnats", area: "Espagne", csv: ["SP2"], code: "SD" },
  { slug: "serie-b", name: "Serie B", group: "Championnats", area: "Italie", csv: ["I2"], code: "SB" },
  { slug: "bundesliga-2", name: "2. Bundesliga", group: "Championnats", area: "Allemagne", csv: ["D2"], code: "BL2" },
  { slug: "eredivisie", name: "Eredivisie", group: "Championnats", area: "Pays-Bas", csv: ["N1"], code: "DED" },
  { slug: "primeira-liga", name: "Primeira Liga", group: "Championnats", area: "Portugal", csv: ["P1"], code: "PPL" },
  { slug: "super-lig", name: "Süper Lig", group: "Championnats", area: "Turquie", csv: ["T1"], code: "TSL" },
  { slug: "jupiler", name: "Jupiler Pro League", group: "Championnats", area: "Belgique", csv: ["B1"], code: "BJL" },
  { slug: "super-league", name: "Super League", group: "Championnats", area: "Grèce", csv: ["G1"], code: "GSL" },
  { slug: "premiership", name: "Premiership", group: "Championnats", area: "Écosse", csv: ["SC0"], code: "SPL" },
  { slug: "mls", name: "MLS", group: "Championnats", area: "États-Unis", remote: true, code: "MLS" },
  { slug: "brasileirao", name: "Brasileirão", group: "Championnats", area: "Brésil", remote: true, code: "BSA" },
  { slug: "liga-mx", name: "Liga MX", group: "Championnats", area: "Mexique", remote: true, code: "LMX" },
  { slug: "j-league", name: "J. League", group: "Championnats", area: "Japon", remote: true, code: "JJL" },
  { slug: "saudi", name: "Saudi Pro League", group: "Championnats", area: "Arabie saoudite", remote: true },
  { slug: "ligue-des-champions", name: "Ligue des champions", group: "Coupes d'Europe", area: "Europe", csv: EUROPE, code: "CL" },
  { slug: "europa-league", name: "Europa League", group: "Coupes d'Europe", area: "Europe", csv: EUROPE, code: "EL" },
  { slug: "conference-league", name: "Conference League", group: "Coupes d'Europe", area: "Europe", csv: EUROPE, code: "UCL" },
  { slug: "fa-cup", name: "FA Cup", group: "Coupes nationales", area: "Angleterre", csv: ["E0", "E1", "E2", "E3"], code: "FAC" },
  { slug: "coupe-de-france", name: "Coupe de France", group: "Coupes nationales", area: "France", csv: ["F1", "F2"], code: "CDF" },
  { slug: "copa-del-rey", name: "Copa del Rey", group: "Coupes nationales", area: "Espagne", csv: ["SP1", "SP2"], code: "CDR" },
  { slug: "coppa-italia", name: "Coppa Italia", group: "Coupes nationales", area: "Italie", csv: ["I1", "I2"], code: "CIT" },
  { slug: "dfb-pokal", name: "DFB-Pokal", group: "Coupes nationales", area: "Allemagne", csv: ["D1", "D2"], code: "DFB" },
  { slug: "coupe-du-monde", name: "Coupe du monde", group: "Sélections", area: "Monde", nations: "all", code: "WC" },
  { slug: "euro", name: "Euro", group: "Sélections", area: "Europe", nations: "uefa", code: "EC" },
  { slug: "copa-america", name: "Copa América", group: "Sélections", area: "Amérique du Sud", nations: "conmebol", code: "CA" },
  { slug: "can", name: "Coupe d'Afrique des nations", group: "Sélections", area: "Afrique", nations: "caf", code: "AC" },
  { slug: "ligue-des-nations", name: "Ligue des nations", group: "Sélections", area: "Europe", nations: "uefa", code: "UNL" },
];

const UEFA: Array<[string, string]> = [
  ["Albanie", "Albania"], ["Allemagne", "Germany"], ["Andorre", "Andorra"], ["Angleterre", "England"],
  ["Arménie", "Armenia"], ["Autriche", "Austria"], ["Azerbaïdjan", "Azerbaijan"], ["Belgique", "Belgium"],
  ["Biélorussie", "Belarus"], ["Bosnie-Herzégovine", "Bosnia and Herzegovina"], ["Bulgarie", "Bulgaria"],
  ["Chypre", "Cyprus"], ["Croatie", "Croatia"], ["Danemark", "Denmark"], ["Écosse", "Scotland"],
  ["Espagne", "Spain"], ["Estonie", "Estonia"], ["Finlande", "Finland"], ["France", "France"],
  ["Géorgie", "Georgia"], ["Gibraltar", "Gibraltar"], ["Grèce", "Greece"], ["Hongrie", "Hungary"],
  ["Îles Féroé", "Faroe Islands"], ["Irlande", "Republic of Ireland"], ["Irlande du Nord", "Northern Ireland"],
  ["Islande", "Iceland"], ["Israël", "Israel"], ["Italie", "Italy"], ["Kazakhstan", "Kazakhstan"],
  ["Kosovo", "Kosovo"], ["Lettonie", "Latvia"], ["Liechtenstein", "Liechtenstein"], ["Lituanie", "Lithuania"],
  ["Luxembourg", "Luxembourg"], ["Macédoine du Nord", "North Macedonia"], ["Malte", "Malta"],
  ["Moldavie", "Moldova"], ["Monténégro", "Montenegro"], ["Norvège", "Norway"], ["Pays-Bas", "Netherlands"],
  ["Pays de Galles", "Wales"], ["Pologne", "Poland"], ["Portugal", "Portugal"], ["Roumanie", "Romania"],
  ["Saint-Marin", "San Marino"], ["Serbie", "Serbia"], ["Slovaquie", "Slovakia"], ["Slovénie", "Slovenia"],
  ["Suède", "Sweden"], ["Suisse", "Switzerland"], ["Tchéquie", "Czech Republic"], ["Turquie", "Turkey"],
  ["Ukraine", "Ukraine"],
];

const CONMEBOL: Array<[string, string]> = [
  ["Argentine", "Argentina"], ["Bolivie", "Bolivia"], ["Brésil", "Brazil"], ["Chili", "Chile"],
  ["Colombie", "Colombia"], ["Équateur", "Ecuador"], ["Paraguay", "Paraguay"], ["Pérou", "Peru"],
  ["Uruguay", "Uruguay"], ["Venezuela", "Venezuela"],
];

const CAF: Array<[string, string]> = [
  ["Afrique du Sud", "South Africa"], ["Algérie", "Algeria"], ["Angola", "Angola"],
  ["Burkina Faso", "Burkina Faso"], ["Cameroun", "Cameroon"], ["Cap-Vert", "Cape Verde"],
  ["Comores", "Comoros"], ["Congo", "Congo"], ["Côte d'Ivoire", "Ivory Coast"],
  ["Égypte", "Egypt"], ["Gabon", "Gabon"], ["Gambie", "Gambia"], ["Ghana", "Ghana"],
  ["Guinée", "Guinea"], ["Guinée équatoriale", "Equatorial Guinea"], ["Mali", "Mali"],
  ["Maroc", "Morocco"], ["Mauritanie", "Mauritania"], ["Nigeria", "Nigeria"],
  ["RD Congo", "DR Congo"], ["Sénégal", "Senegal"], ["Tunisie", "Tunisia"], ["Zambie", "Zambia"],
];

const AFC: Array<[string, string]> = [
  ["Arabie saoudite", "Saudi Arabia"], ["Australie", "Australia"], ["Bahreïn", "Bahrain"],
  ["Chine", "China"], ["Corée du Sud", "South Korea"], ["Émirats arabes unis", "United Arab Emirates"],
  ["Inde", "India"], ["Indonésie", "Indonesia"], ["Irak", "Iraq"], ["Iran", "Iran"],
  ["Japon", "Japan"], ["Jordanie", "Jordan"], ["Liban", "Lebanon"], ["Oman", "Oman"],
  ["Ouzbékistan", "Uzbekistan"], ["Palestine", "Palestine"], ["Qatar", "Qatar"],
  ["Syrie", "Syria"], ["Thaïlande", "Thailand"], ["Vietnam", "Vietnam"],
];

const CONCACAF: Array<[string, string]> = [
  ["Canada", "Canada"], ["Costa Rica", "Costa Rica"], ["Curaçao", "Curacao"],
  ["États-Unis", "USA"], ["Guatemala", "Guatemala"], ["Haïti", "Haiti"],
  ["Honduras", "Honduras"], ["Jamaïque", "Jamaica"], ["Mexique", "Mexico"],
  ["Panama", "Panama"], ["Salvador", "El Salvador"], ["Trinité-et-Tobago", "Trinidad and Tobago"],
];

const OFC: Array<[string, string]> = [
  ["Fidji", "Fiji"], ["Nouvelle-Zélande", "New Zealand"], ["Papouasie-Nouvelle-Guinée", "Papua New Guinea"],
];

const csvCache = new Map<string, Promise<HistoricalMatch[]>>();
let groupCache: { at: number; groups: CompetitionGroup[] } | null = null;

function nationTeams(kind: "all" | "uefa" | "conmebol" | "caf"): SquadTeam[] {
  const rows = kind === "uefa"
    ? UEFA
    : kind === "conmebol"
      ? CONMEBOL
      : kind === "caf"
        ? CAF
        : [...UEFA, ...CONMEBOL, ...CAF, ...AFC, ...CONCACAF, ...OFC];
  return rows
    .map(([name, query]) => ({
      name,
      query,
      aliases: name === query ? [] : [query],
      attack: null,
      defense: null,
      leagueGoals: null,
      firstHalfShare: null,
      played: 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function average(values: number[]) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function teamsFromMatches(matches: HistoricalMatch[]): SquadTeam[] {
  const ordered = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const rows = new Map<string, { scored: number[]; conceded: number[]; goals: number; matches: number }>();
  let goals = 0;
  for (const match of ordered) {
    goals += match.homeGoals + match.awayGoals;
    const home = rows.get(match.home) ?? { scored: [], conceded: [], goals: 0, matches: 0 };
    home.scored.push(match.homeGoals);
    home.conceded.push(match.awayGoals);
    rows.set(match.home, home);
    const away = rows.get(match.away) ?? { scored: [], conceded: [], goals: 0, matches: 0 };
    away.scored.push(match.awayGoals);
    away.conceded.push(match.homeGoals);
    rows.set(match.away, away);
  }
  const leagueGoals = ordered.length ? Number((goals / (ordered.length * 2)).toFixed(2)) : null;
  let firstHalfGoals = 0;
  let fullTimeGoals = 0;
  for (const match of ordered) {
    if (match.homeHt == null || match.awayHt == null) continue;
    const first = match.homeHt + match.awayHt;
    const total = match.homeGoals + match.awayGoals;
    if (first > total) continue;
    firstHalfGoals += first;
    fullTimeGoals += total;
  }
  const firstHalfShare = fullTimeGoals > 0 ? Number((firstHalfGoals / fullTimeGoals).toFixed(3)) : null;
  return [...rows.entries()].map(([name, row]) => ({
    name,
    query: name,
    aliases: ALIASES[name] ?? [],
    attack: average(row.scored.slice(-8)),
    defense: average(row.conceded.slice(-8)),
    leagueGoals,
    firstHalfShare,
    played: row.scored.length,
  }));
}

async function loadCsv(code: string) {
  const cached = csvCache.get(code);
  if (cached) return cached;
  const job = (async () => {
    for (const season of ["2627", "2526", "2425"]) {
      const response = await fetch(`https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`, {
        next: { revalidate: 60 * 60 * 12 },
      });
      if (!response.ok) continue;
      const matches = parseHistory(await response.text(), code);
      if (matches.length) return matches;
    }
    return [];
  })();
  csvCache.set(code, job);
  return job;
}

function findDef(slug: string) {
  return COMPETITIONS.find((item) => item.slug === slug) ?? null;
}

export function competitionName(slug: string) {
  return findDef(slug)?.name ?? null;
}

export async function loadSquad(slug: string) {
  const def = findDef(slug);
  if (!def) return null;
  if (def.nations) {
    return {
      slug: def.slug,
      name: def.name,
      area: def.area,
      group: def.group,
      remoteSearch: false,
      teams: nationTeams(def.nations),
    };
  }
  if (!def.csv) {
    return {
      slug: def.slug,
      name: def.name,
      area: def.area,
      group: def.group,
      remoteSearch: true,
      teams: [],
    };
  }
  const batches = await Promise.all(def.csv.map((code) => loadCsv(code)));
  const merged = new Map<string, SquadTeam>();
  for (const matches of batches) {
    for (const team of teamsFromMatches(matches)) {
      const current = merged.get(team.name);
      if (!current || team.played > current.played) merged.set(team.name, team);
    }
  }
  return {
    slug: def.slug,
    name: def.name,
    area: def.area,
    group: def.group,
    remoteSearch: merged.size === 0,
    teams: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")),
  };
}

type RemoteCompetition = {
  id: number;
  code: string | null;
  name: string;
  area: string;
};

async function remoteCompetitions(): Promise<RemoteCompetition[]> {
  const response = await fetch("https://api.football-data.org/v4/competitions", {
    headers: { "User-Agent": "kanytrade" },
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!response.ok) return [];
  const body = await response.json() as {
    competitions?: Array<{ id: number; code: string | null; name: string; area?: { name?: string } }>;
  };
  return (body.competitions ?? []).map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    area: item.area?.name || "Monde",
  }));
}

export function localCompetitionGroups(): CompetitionGroup[] {
  const groups = new Map<string, CompetitionItem[]>();
  for (const item of COMPETITIONS) {
    const list = groups.get(item.group) ?? [];
    list.push({ slug: item.slug, name: item.name, area: item.area, ready: !item.remote });
    groups.set(item.group, list);
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

export async function listCompetitions(): Promise<CompetitionGroup[]> {
  if (groupCache && Date.now() - groupCache.at < 60 * 60 * 1000) return groupCache.groups;
  const claimed = new Set(COMPETITIONS.map((item) => item.code).filter(Boolean));
  let extras: RemoteCompetition[] = [];
  try {
    extras = await remoteCompetitions();
  } catch {
    extras = [];
  }
  const groups = new Map<string, CompetitionItem[]>();
  for (const group of localCompetitionGroups()) groups.set(group.title, [...group.items]);
  const more = new Map<string, CompetitionItem[]>();
  for (const item of extras) {
    if (item.code && claimed.has(item.code)) continue;
    const slug = item.code ? `c-${item.code}` : `n-${item.id}`;
    const list = more.get(item.area) ?? [];
    list.push({ slug, name: item.name, area: item.area, ready: false });
    more.set(item.area, list);
  }
  const featured = [...groups.entries()].map(([title, items]) => ({ title, items }));
  const rest = [...more.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "fr"))
    .map(([title, items]) => ({
      title,
      items: items.sort((a, b) => a.name.localeCompare(b.name, "fr")),
    }));
  const result = [...featured, ...rest];
  groupCache = { at: Date.now(), groups: result };
  return result;
}

export async function loadExternal(slug: string) {
  const squad = await loadSquad(slug);
  if (squad) return squad;
  const groups = await listCompetitions();
  const item = groups.flatMap((group) => group.items).find((entry) => entry.slug === slug);
  if (!item) return null;
  return {
    slug: item.slug,
    name: item.name,
    area: item.area,
    group: item.area,
    remoteSearch: true,
    teams: [] as SquadTeam[],
  };
}
