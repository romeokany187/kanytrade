import { backtestHistory, parseHistory, type HistoricalMatch } from "./football-backtest";
import { listCompetitions, loadExternal, localCompetitionGroups } from "./football-competitions";
import { loadFixtures } from "./football-fixtures";
import { findTeamForm } from "./team-form";
import { findWinnerQuote } from "./winner-odds";
import {
  findInstrument,
  getMarketCandles,
  getMarketQuotes,
  getProviderCandles,
  instruments,
  parseChartPeriod,
  twelveDataKey,
} from "./market-data";

const SPORTS_DB = "https://www.thesportsdb.com/api/v1/json/3";

export async function handleDeviceRequest(input: string) {
  const url = new URL(input, "https://kanytrade.local");
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/api/football/competitions") {
    const groups = url.searchParams.get("scope") === "local" ? localCompetitionGroups() : await listCompetitions();
    return Response.json({ groups });
  }
  if (path.startsWith("/api/football/competitions/")) {
    const slug = decodeURIComponent(path.slice("/api/football/competitions/".length));
    const squad = await loadExternal(slug);
    if (!squad) return Response.json({ error: "Championnat introuvable." }, { status: 404 });
    return Response.json(squad);
  }
  if (path === "/api/football/winner") return winnerPayload(url);
  if (path === "/api/football/form") return formPayload(url);
  if (path === "/api/football/fixtures") {
    const slug = url.searchParams.get("slug")?.trim() ?? "";
    if (!slug) return Response.json({ error: "Championnat manquant." }, { status: 400 });
    return Response.json(await loadFixtures(slug, url.searchParams.get("date")?.trim() ?? "", url.searchParams.get("seek") === "1"));
  }
  if (path === "/api/football/team") return teamPayload(url.searchParams.get("name")?.trim() ?? "");
  if (path === "/api/football/suggest") return suggestPayload(url.searchParams.get("kind") === "player" ? "player" : "team", url.searchParams.get("q")?.trim() ?? "");
  if (path === "/api/football/backtest") return backtestPayload();
  if (path === "/api/market") return marketPayload(url.searchParams.get("symbols"));
  if (path === "/api/quote") return quotePayload(url.searchParams.get("symbol")?.trim() ?? "", url.searchParams.get("exchange")?.trim() ?? "");
  if (path === "/api/history") return historyPayload(url);
  if (path === "/api/catalog") return catalogPayload(url);
  if (path === "/api/news") return newsPayload(url.searchParams.get("topic") ?? "global");
  return Response.json({ error: "Adresse inconnue." }, { status: 404 });
}

async function formPayload(url: URL) {
  const team = url.searchParams.get("team")?.trim() ?? "";
  if (team.length < 2) return Response.json({ found: false, message: "Équipe manquante." }, { status: 400 });
  try {
    const form = await findTeamForm(team);
    if (!form) {
      return Response.json({
        found: false,
        message: `Pas assez de matchs récents trouvés pour ${team}. Tu peux taper les moyennes.`,
      });
    }
    return Response.json(form);
  } catch {
    return Response.json({
      found: false,
      message: `La recherche des matchs de ${team} n’a pas répondu. Tu peux taper les moyennes.`,
    }, { status: 502 });
  }
}

async function winnerPayload(url: URL) {
  const home = url.searchParams.get("home")?.trim() ?? "";
  const away = url.searchParams.get("away")?.trim() ?? "";
  const competition = url.searchParams.get("competition")?.trim() ?? "";
  if (!home || !away) return Response.json({ found: false, message: "Équipes manquantes." }, { status: 400 });
  try {
    const quote = await findWinnerQuote(home, away, competition);
    if (!quote) return Response.json({ found: false, message: "Ce match n’est pas dans les cotes Winner pour l’instant." });
    return Response.json(quote);
  } catch (error) {
    const blocked = error instanceof Error && error.message === "blocked";
    return Response.json({
      found: false,
      message: blocked
        ? "Winner bloque la lecture automatique. Les cotes restent à saisir à la main."
        : "Winner ne répond pas. Les cotes restent à saisir à la main.",
    }, { status: 502 });
  }
}

async function teamPayload(name: string) {
  if (!name) return Response.json({ error: "Nom d'équipe manquant." }, { status: 400 });
  const teamResponse = await fetch(`${SPORTS_DB}/searchteams.php?t=${encodeURIComponent(name)}`);
  if (!teamResponse.ok) return Response.json({ error: "La source d'équipes ne répond pas." }, { status: 502 });
  const teamPayloadBody = await teamResponse.json() as { teams: Array<{ idTeam: string; strTeam: string; strLeague: string; strCountry: string; strBadge: string }> | null };
  const team = teamPayloadBody.teams?.find((item) => item.strTeam.toLowerCase() === name.toLowerCase()) ?? teamPayloadBody.teams?.[0];
  if (!team) return Response.json({ error: "Équipe introuvable." }, { status: 404 });
  const [eventsResponse, playersResponse] = await Promise.all([
    fetch(`${SPORTS_DB}/eventsnext.php?id=${team.idTeam}`),
    fetch(`${SPORTS_DB}/lookup_all_players.php?id=${team.idTeam}`),
  ]);
  const eventsPayload = eventsResponse.ok ? await eventsResponse.json() as { events: Array<{ strEvent: string; dateEvent: string; strTime: string; strVenue: string }> | null } : { events: [] };
  const playersPayload = playersResponse.ok ? await playersResponse.json() as { player: Array<{ strPlayer: string; strPosition: string }> | null } : { player: [] };
  const nextEvent = eventsPayload.events?.[0] ?? null;
  return Response.json({
    source: "TheSportsDB",
    team: team.strTeam,
    league: team.strLeague,
    country: team.strCountry,
    badge: team.strBadge,
    nextMatch: nextEvent ? { name: nextEvent.strEvent, date: nextEvent.dateEvent, time: nextEvent.strTime, venue: nextEvent.strVenue } : null,
    players: (playersPayload.player ?? []).filter((player) => player.strPlayer && !/coach|manager|staff/i.test(player.strPosition ?? "")).slice(0, 11).map((player) => ({ name: player.strPlayer, position: player.strPosition })),
  });
}

async function suggestPayload(kind: "team" | "player", query: string) {
  if (query.length < 2) return Response.json({ suggestions: [] });
  const endpoint = kind === "player" ? `${SPORTS_DB}/searchplayers.php?p=${encodeURIComponent(query)}` : `${SPORTS_DB}/searchteams.php?t=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint);
  if (!response.ok) return Response.json({ suggestions: [] });
  const body = await response.json() as {
    teams?: Array<{ strTeam: string; strLeague: string; strCountry: string }> | null;
    player?: Array<{ strPlayer: string; strTeam: string; strPosition: string }> | null;
  };
  const suggestions = kind === "player"
    ? (body.player ?? []).slice(0, 8).map((player) => ({ label: player.strPlayer, value: player.strPlayer, detail: [player.strPosition, player.strTeam].filter(Boolean).join(" · "), query: player.strTeam || player.strPlayer }))
    : (body.teams ?? []).slice(0, 8).map((team) => ({ label: team.strTeam, value: team.strTeam, detail: [team.strLeague, team.strCountry].filter(Boolean).join(" · "), query: team.strTeam }));
  return Response.json({ suggestions });
}

async function backtestPayload() {
  const leagues = [
    { code: "E0", name: "Premier League" },
    { code: "SP1", name: "La Liga" },
    { code: "I1", name: "Serie A" },
    { code: "D1", name: "Bundesliga" },
    { code: "F1", name: "Ligue 1" },
  ];
  const seasons = ["2324", "2425", "2526"];
  const batches = await Promise.all(seasons.flatMap((season) => leagues.map(async (league) => {
    const response = await fetch(`https://www.football-data.co.uk/mmz4281/${season}/${league.code}.csv`);
    if (!response.ok) return [];
    return parseHistory(await response.text(), `${league.code}-${season}`);
  })));
  const summary = backtestHistory(batches.flat() as HistoricalMatch[]);
  return Response.json({
    source: "football-data.co.uk",
    odds: "Cotes de clôture Pinnacle quand elles existent, sinon Bet365",
    seasons: ["2023-2024", "2024-2025", "2025-2026"],
    leagues: leagues.map((league) => league.name),
    ...summary,
  });
}

async function marketPayload(requested: string | null) {
  const symbols = requested
    ? [...new Set(requested.split(",").map((symbol) => symbol.trim()).filter(Boolean))].slice(0, 8)
    : instruments.map((instrument) => instrument.symbol);
  const selected = symbols.map(findInstrument).filter((instrument) => instrument !== undefined);
  if (!selected.length) return Response.json({ error: "Aucun symbole pris en charge." }, { status: 400 });
  return Response.json({ quotes: await getMarketQuotes(selected), fetchedAt: new Date().toISOString() });
}

async function quotePayload(symbol: string, exchange: string) {
  const apiKey = twelveDataKey();
  if (!/^[A-Za-z0-9./:_-]{1,32}$/.test(symbol) || exchange.length > 24) {
    return Response.json({ error: "Symbole ou place boursière invalide." }, { status: 400 });
  }
  if (!apiKey) return Response.json({ error: "Configurez TWELVE_DATA_API_KEY pour consulter les cotations." }, { status: 503 });
  const providerUrl = new URL("https://api.twelvedata.com/quote");
  providerUrl.searchParams.set("symbol", symbol);
  if (exchange) providerUrl.searchParams.set("exchange", exchange);
  try {
    const response = await fetch(providerUrl, { headers: { Authorization: `apikey ${apiKey}` } });
    const quote = await response.json() as { status?: string; message?: string; symbol?: string; name?: string; exchange?: string; currency?: string; close?: string; percent_change?: string; datetime?: string };
    const price = Number(quote.close);
    if (!response.ok || quote.status === "error" || !Number.isFinite(price) || price <= 0) {
      return Response.json({ error: quote.message || "Aucune cotation accessible pour ce symbole." }, { status: response.status >= 400 ? response.status : 404 });
    }
    return Response.json({
      symbol: quote.symbol ?? symbol,
      name: quote.name ?? symbol,
      exchange: (quote.exchange ?? exchange) || "Non précisée",
      currency: quote.currency ?? "",
      price,
      changePercent: Number.isFinite(Number(quote.percent_change)) ? Number(quote.percent_change) : null,
      providerTime: quote.datetime ?? null,
      fetchedAt: new Date().toISOString(),
      provider: "Twelve Data",
    });
  } catch {
    return Response.json({ error: "Connexion au fournisseur de cotations impossible." }, { status: 502 });
  }
}

async function historyPayload(url: URL) {
  const symbol = url.searchParams.get("symbol")?.trim() ?? "";
  const exchange = url.searchParams.get("exchange")?.trim() ?? "";
  const instrument = findInstrument(symbol);
  const period = parseChartPeriod(url.searchParams.get("period"));
  if (!/^[A-Za-z0-9./:_-]{1,32}$/.test(symbol) || !/^[A-Za-z0-9 .&_-]{0,40}$/.test(exchange) || !period) {
    return Response.json({ error: "Symbole ou période non pris en charge." }, { status: 400 });
  }
  try {
    const candles = instrument ? await getMarketCandles(instrument, period) : await getProviderCandles(symbol, exchange, period);
    return Response.json({ symbol, provider: instrument?.provider ?? "Twelve Data", candles, fetchedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ symbol, provider: instrument?.provider ?? "Twelve Data", error: error instanceof Error ? error.message : "Historique indisponible." }, { status: 503 });
  }
}

async function catalogPayload(url: URL) {
  const categories = {
    stocks: /stock|equity|share|reit|depositary receipt/i,
    forex: /forex|currency pair/i,
    crypto: /crypto|digital currency/i,
    commodities: /commodit|precious metal|energy|agricultur|future/i,
    indices: /index/i,
    etfs: /\betf\b|exchange.?traded fund/i,
    funds: /mutual fund|\bfund\b/i,
  };
  const directories = { forex: "forex_pairs", crypto: "cryptocurrencies", commodities: "commodities", indices: "indices" } as const;
  const category = url.searchParams.get("type") ?? "";
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const apiKey = twelveDataKey();
  if (!Object.hasOwn(categories, category)) return Response.json({ error: "Type de marché non pris en charge." }, { status: 400 });
  const isDirectory = Object.hasOwn(directories, category);
  if (query.length < 2 && !isDirectory) return Response.json({ error: "La recherche doit contenir au moins 2 caractères." }, { status: 400 });
  if (!apiKey) return Response.json({ error: "Configurez TWELVE_DATA_API_KEY pour accéder aux catalogues mondiaux." }, { status: 503 });
  const providerUrl = new URL(`https://api.twelvedata.com/${isDirectory ? directories[category as keyof typeof directories] : "symbol_search"}`);
  providerUrl.searchParams.set("show_plan", "true");
  if (!isDirectory) providerUrl.searchParams.set("symbol", query);
  try {
    const response = await fetch(providerUrl, { headers: { Authorization: `apikey ${apiKey}` } });
    const payload = await response.json() as { data?: Array<Record<string, unknown>>; status?: string; message?: string };
    if (!response.ok || payload.status === "error") {
      return Response.json({ error: payload.message || "Le catalogue du fournisseur est indisponible." }, { status: response.status >= 400 ? response.status : 502 });
    }
    const pattern = isDirectory ? undefined : categories[category as keyof typeof categories];
    const instrumentsFound = (payload.data ?? []).filter((item) => {
      const type = String(item.instrument_type ?? "");
      if (pattern && type && !pattern.test(type)) return false;
      if (!query) return true;
      return `${item.symbol ?? ""} ${item.name ?? ""} ${item.instrument_name ?? ""} ${item.exchange ?? ""} ${item.country ?? ""}`.toLowerCase().includes(query.toLowerCase());
    }).slice(0, limit).flatMap((item) => {
      if (!item.symbol) return [];
      const exchanges = item.available_exchanges as string[] | undefined;
      return [{
        symbol: String(item.symbol),
        name: String(item.name ?? item.instrument_name ?? item.symbol),
        exchange: (item.exchange as string | undefined) ?? exchanges?.[0] ?? null,
        country: (item.country as string | undefined) ?? null,
        currency: (item.currency as string | undefined) ?? (item.currency_quote as string | undefined) ?? null,
        instrumentType: String(item.instrument_type ?? item.category ?? category),
        access: item.access ?? null,
      }];
    });
    return Response.json({ instruments: instrumentsFound, provider: "Twelve Data", fetchedAt: new Date().toISOString() });
  } catch {
    return Response.json({ error: "Connexion au fournisseur de catalogues impossible." }, { status: 502 });
  }
}

async function newsPayload(topic: string) {
  const topics: Record<string, string> = {
    global: "financial markets OR economy OR stocks OR forex OR commodities OR cryptocurrency",
    forex: "foreign exchange OR forex OR currency markets",
    crypto: "cryptocurrency OR bitcoin OR ethereum",
    commodities: "gold OR oil OR commodities markets",
    equities: "global stocks OR equity markets OR stock exchange",
  };
  if (!topics[topic]) return Response.json({ error: "Thème d’actualité non pris en charge." }, { status: 400 });
  const feedUrl = new URL("https://news.google.com/rss/search");
  feedUrl.searchParams.set("q", topics[topic]);
  feedUrl.searchParams.set("hl", "en-US");
  feedUrl.searchParams.set("gl", "US");
  feedUrl.searchParams.set("ceid", "US:en");
  try {
    const { XMLParser } = await import("fast-xml-parser");
    const response = await fetch(feedUrl, { headers: { "User-Agent": "Kanytrade/1.0 (market research news feed)" } });
    if (!response.ok) return Response.json({ error: "Le flux d’actualités est temporairement indisponible." }, { status: 502 });
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
    const parsed = parser.parse(await response.text()) as { rss?: { channel?: { item?: unknown } } };
    const raw = parsed.rss?.channel?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const articles = items.flatMap((entry) => {
      const item = entry as { title?: string; link?: string; pubDate?: string; source?: string | { "#text"?: string } };
      if (!item.title || !item.link) return [];
      const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
      const source = typeof item.source === "string" ? item.source : item.source?.["#text"];
      return [{ title: item.title, url: item.link, source: source || "Google News · source éditeur", publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt.toISOString() : null }];
    }).slice(0, 30);
    return Response.json({ articles, topic, provider: "Google News RSS", fetchedAt: new Date().toISOString() });
  } catch {
    return Response.json({ error: "Impossible de charger le flux d’actualités." }, { status: 502 });
  }
}
