export type WinnerOdds = {
  oddsHome: string;
  oddsDraw: string;
  oddsAway: string;
  oddsDouble1X: string;
  oddsDouble12: string;
  oddsDoubleX2: string;
  oddsBothScore: string;
  oddsNotBoth: string;
  oddsOver25: string;
  oddsUnder25: string;
  oddsHalfFirst: string;
  oddsHalfEqual: string;
  oddsHalfSecond: string;
  oddsHalf1X: string;
  oddsHalf12: string;
  oddsHalfX2: string;
};

export type WinnerQuote = {
  found: true;
  message: string;
  odds: WinnerOdds;
};

type WinnerSelection = {
  n?: string;
  p?: string | number;
  l?: string | number;
};

type WinnerMarket = {
  n?: string;
  odds?: WinnerSelection[];
};

type WinnerEvent = {
  h?: string;
  a?: string;
  ln?: string;
  bts?: WinnerMarket[];
};

const CLUB = new Set(["fc", "cf", "ac", "sc", "sk", "fk", "afc", "club", "the"]);
const PAGE = 40;
const PAGES = 8;

let cache: { at: number; events: WinnerEvent[] } | null = null;

function words(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !CLUB.has(word));
}

export function teamScore(left: string, right: string) {
  const leftWords = words(left);
  const rightWords = words(right);
  if (!leftWords.length || !rightWords.length) return 0;
  if (leftWords.join(" ") === rightWords.join(" ")) return 100;
  const [shorter, longer] = leftWords.length <= rightWords.length ? [leftWords, rightWords] : [rightWords, leftWords];
  const pool = new Set(longer);
  if (shorter.every((word) => pool.has(word)) && shorter.some((word) => word.length >= 5) && shorter.length < longer.length) return 70;
  return 0;
}

function price(raw: string | number | undefined) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 1) return "";
  return value.toFixed(2);
}

function selection(market: WinnerMarket | undefined, name: string, line?: string) {
  const row = market?.odds?.find((item) => {
    const label = (item.n ?? "").toLowerCase();
    const sameLine = line == null || String(item.l ?? "") === line;
    return label === name && sameLine;
  });
  return price(row?.p);
}

function marketNamed(event: WinnerEvent, name: string) {
  return event.bts?.find((item) => (item.n ?? "").toLowerCase() === name);
}

function halfSelection(market: WinnerMarket | undefined, names: string[]) {
  for (const name of names) {
    const value = selection(market, name);
    if (value) return value;
  }
  return "";
}

export function oddsFromEvent(event: WinnerEvent): WinnerOdds {
  const result = marketNamed(event, "ft 1x2");
  const doubles = marketNamed(event, "double chance");
  const goals = marketNamed(event, "gg/ng");
  const totals = marketNamed(event, "under/over");
  const halves = marketNamed(event, "highest scoring half");
  return {
    oddsHome: selection(result, "1"),
    oddsDraw: selection(result, "x"),
    oddsAway: selection(result, "2"),
    oddsDouble1X: selection(doubles, "1x"),
    oddsDouble12: selection(doubles, "12"),
    oddsDoubleX2: selection(doubles, "x2"),
    oddsBothScore: selection(goals, "yes"),
    oddsNotBoth: selection(goals, "no"),
    oddsOver25: selection(totals, "over", "2.5"),
    oddsUnder25: selection(totals, "under", "2.5"),
    oddsHalfFirst: halfSelection(halves, ["1st", "first half", "1re"]),
    oddsHalfEqual: halfSelection(halves, ["equal", "equals", "égal"]),
    oddsHalfSecond: halfSelection(halves, ["2nd", "second half", "2e"]),
    oddsHalf1X: halfSelection(halves, ["1st/equal", "1st/eq", "first/equal"]),
    oddsHalf12: halfSelection(halves, ["1st/2nd", "first/second"]),
    oddsHalfX2: halfSelection(halves, ["2nd/equal", "2nd/eq", "second/equal"]),
  };
}

export function pickWinnerEvent(events: WinnerEvent[], home: string, away: string, competition = "") {
  let best: { event: WinnerEvent; score: number } | null = null;
  for (const event of events) {
    const homeScore = teamScore(home, event.h ?? "");
    const awayScore = teamScore(away, event.a ?? "");
    if (homeScore < 70 || awayScore < 70) continue;
    const league = competition && event.ln && teamScore(competition, event.ln) >= 70 ? 10 : 0;
    const score = homeScore + awayScore + league;
    if (!best || score > best.score) best = { event, score };
  }
  return best?.event ?? null;
}

function quote(event: WinnerEvent): WinnerQuote {
  const odds = oddsFromEvent(event);
  const doubles = odds.oddsHalf1X || odds.oddsHalf12 || odds.oddsHalfX2;
  const message = doubles
    ? "Cotes lues sur Winner."
    : "Cotes lues sur Winner. Les doubles 1re/Égal, 1re/2e et 2e/Égal sont à saisir à la main si tu les vois sur le site.";
  return { found: true, message, odds };
}

async function loadEvents() {
  if (cache && Date.now() - cache.at < 120000) return cache.events;
  const events: WinnerEvent[] = [];
  for (let page = 0; page < PAGES; page += 1) {
    const url = `https://winner.bet/services/evapi/event/GetEvents?betTypeIds=-1&take=${PAGE}&skip=${page * PAGE}&statusId=0&eventTypeId=0&sportTypeIds=31`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    if (!response.ok || text.trim().startsWith("<")) {
      if (events.length) break;
      throw new Error(response.status === 403 || text.trim().startsWith("<") ? "blocked" : "down");
    }
    const body = JSON.parse(text) as { data?: WinnerEvent[] };
    const rows = body.data ?? [];
    events.push(...rows);
    if (rows.length < PAGE) break;
  }
  cache = { at: Date.now(), events };
  return events;
}

export async function findWinnerQuote(home: string, away: string, competition = ""): Promise<WinnerQuote | null> {
  const event = pickWinnerEvent(await loadEvents(), home, away, competition);
  return event ? quote(event) : null;
}
