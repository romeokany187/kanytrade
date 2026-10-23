export type AssetClass = "crypto" | "forex" | "metal";
export type QuoteStatus = "live" | "not_configured" | "unavailable";
export type ChartPeriod = "1D" | "1W" | "1M" | "3M" | "1Y";

export interface Instrument {
  symbol: string;
  name: string;
  shortName: string;
  assetClass: AssetClass;
  provider: "Kraken" | "Twelve Data";
  providerSymbol: string;
  krakenPair?: string;
  krakenResultKey?: string;
  accent: string;
  precision: number;
}

export interface MarketQuote {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  currency: string;
  provider: Instrument["provider"];
  status: QuoteStatus;
  message?: string;
  providerTime: string | null;
  fetchedAt: string;
}

export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const instruments: Instrument[] = [
  {
    symbol: "BTC/USD",
    name: "Bitcoin / US Dollar",
    shortName: "Bitcoin",
    assetClass: "crypto",
    provider: "Kraken",
    providerSymbol: "BTC/USD",
    krakenPair: "XBTUSD",
    krakenResultKey: "XXBTZUSD",
    accent: "#e8bc73",
    precision: 2,
  },
  {
    symbol: "ETH/USD",
    name: "Ether / US Dollar",
    shortName: "Ether",
    assetClass: "crypto",
    provider: "Kraken",
    providerSymbol: "ETH/USD",
    krakenPair: "ETHUSD",
    krakenResultKey: "XETHZUSD",
    accent: "#99a9f2",
    precision: 2,
  },
  {
    symbol: "SOL/USD",
    name: "Solana / US Dollar",
    shortName: "Solana",
    assetClass: "crypto",
    provider: "Kraken",
    providerSymbol: "SOL/USD",
    krakenPair: "SOLUSD",
    krakenResultKey: "SOLUSD",
    accent: "#b5d98d",
    precision: 3,
  },
  {
    symbol: "XRP/USD",
    name: "XRP / US Dollar",
    shortName: "XRP",
    assetClass: "crypto",
    provider: "Kraken",
    providerSymbol: "XRP/USD",
    krakenPair: "XRPUSD",
    krakenResultKey: "XXRPZUSD",
    accent: "#8fc8cf",
    precision: 4,
  },
  {
    symbol: "EUR/USD",
    name: "Euro / US Dollar",
    shortName: "Euro / Dollar",
    assetClass: "forex",
    provider: "Twelve Data",
    providerSymbol: "EUR/USD",
    accent: "#86c2df",
    precision: 5,
  },
  {
    symbol: "GBP/USD",
    name: "British Pound / US Dollar",
    shortName: "Livre / Dollar",
    assetClass: "forex",
    provider: "Twelve Data",
    providerSymbol: "GBP/USD",
    accent: "#c7a2d8",
    precision: 5,
  },
  {
    symbol: "XAU/USD",
    name: "Gold Spot / US Dollar",
    shortName: "Or / Dollar",
    assetClass: "metal",
    provider: "Twelve Data",
    providerSymbol: "XAU/USD",
    accent: "#e8bc73",
    precision: 2,
  },
];

const periodSettings: Record<ChartPeriod, { kraken: number; twelveData: string; outputsize: number }> = {
  "1D": { kraken: 5, twelveData: "5min", outputsize: 288 },
  "1W": { kraken: 60, twelveData: "1h", outputsize: 168 },
  "1M": { kraken: 240, twelveData: "4h", outputsize: 180 },
  "3M": { kraken: 1440, twelveData: "1day", outputsize: 90 },
  "1Y": { kraken: 10080, twelveData: "1week", outputsize: 52 },
};

export function findInstrument(symbol: string) {
  return instruments.find((instrument) => instrument.symbol === symbol);
}

function unavailableQuote(instrument: Instrument, status: QuoteStatus, message: string, fetchedAt: string): MarketQuote {
  return {
    symbol: instrument.symbol,
    price: null,
    changePercent: null,
    currency: "USD",
    provider: instrument.provider,
    status,
    message,
    providerTime: null,
    fetchedAt,
  };
}

function providerErrorMessage(status: number) {
  if (status === 401 || status === 403) return "La clé ou le forfait ne donne pas accès à ce marché.";
  if (status === 429) return "Limite de requêtes atteinte chez le fournisseur.";
  return "Le fournisseur de données ne répond pas pour le moment.";
}

async function getKrakenQuotes(selected: Instrument[], fetchedAt: string): Promise<MarketQuote[]> {
  const krakenInstruments = selected.filter((instrument) => instrument.provider === "Kraken");
  if (!krakenInstruments.length) return [];

  try {
    const pairs = krakenInstruments.map((instrument) => instrument.krakenPair).join(",");
    const response = await fetch(
      `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pairs)}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) {
      return krakenInstruments.map((instrument) =>
        unavailableQuote(instrument, "unavailable", providerErrorMessage(response.status), fetchedAt),
      );
    }

    const payload = (await response.json()) as {
      error?: string[];
      result?: Record<string, { c?: string[]; o?: string }>;
    };
    return krakenInstruments.map((instrument) => {
      const ticker = payload.result?.[instrument.krakenResultKey ?? ""];
      const price = Number(ticker?.c?.[0]);
      const open = Number(ticker?.o);
      if ((payload.error?.length ?? 0) > 0 || !Number.isFinite(price) || price <= 0) {
        return unavailableQuote(instrument, "unavailable", "Paire indisponible sur Kraken.", fetchedAt);
      }

      return {
        symbol: instrument.symbol,
        price,
        changePercent: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null,
        currency: "USD",
        provider: instrument.provider,
        status: "live",
        providerTime: null,
        fetchedAt,
      } satisfies MarketQuote;
    });
  } catch {
    return krakenInstruments.map((instrument) =>
      unavailableQuote(instrument, "unavailable", "Connexion à Kraken impossible.", fetchedAt),
    );
  }
}

async function getTwelveDataQuote(instrument: Instrument, apiKey: string, fetchedAt: string): Promise<MarketQuote> {
  try {
    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", instrument.providerSymbol);
    const response = await fetch(url, {
      headers: { Authorization: `apikey ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return unavailableQuote(instrument, "unavailable", providerErrorMessage(response.status), fetchedAt);
    }

    const payload = (await response.json()) as {
      status?: string;
      message?: string;
      close?: string;
      percent_change?: string;
      datetime?: string;
      timestamp?: number;
      last_quote_at?: number;
    };
    const price = Number(payload.close);
    if (payload.status === "error" || !Number.isFinite(price) || price <= 0) {
      return unavailableQuote(
        instrument,
        "unavailable",
        payload.message || "Aucune cotation disponible pour ce symbole.",
        fetchedAt,
      );
    }

    const quoteTimestamp = payload.last_quote_at ?? payload.timestamp;
    const providerTime = quoteTimestamp
      ? new Date(quoteTimestamp * 1000).toISOString()
      : payload.datetime
        ? new Date(`${payload.datetime.replace(" ", "T")}Z`).toISOString()
        : null;

    return {
      symbol: instrument.symbol,
      price,
      changePercent: Number.isFinite(Number(payload.percent_change)) ? Number(payload.percent_change) : null,
      currency: "USD",
      provider: instrument.provider,
      status: "live",
      providerTime,
      fetchedAt,
    };
  } catch {
    return unavailableQuote(instrument, "unavailable", "Connexion à Twelve Data impossible.", fetchedAt);
  }
}

export function twelveDataKey() {
  return process.env.TWELVE_DATA_API_KEY?.trim() || process.env.NEXT_PUBLIC_TWELVE_DATA_API_KEY?.trim() || "";
}

export async function getMarketQuotes(selected: Instrument[]) {
  const fetchedAt = new Date().toISOString();
  const twelveDataInstruments = selected.filter((instrument) => instrument.provider === "Twelve Data");
  const apiKey = twelveDataKey();

  const [krakenQuotes, twelveDataQuotes] = await Promise.all([
    getKrakenQuotes(selected, fetchedAt),
    Promise.all(
      twelveDataInstruments.map((instrument) =>
        apiKey
          ? getTwelveDataQuote(instrument, apiKey, fetchedAt)
          : Promise.resolve(
              unavailableQuote(instrument, "not_configured", "Ajoutez TWELVE_DATA_API_KEY pour activer ce flux.", fetchedAt),
            ),
      ),
    ),
  ]);

  const quoteMap = new Map([...krakenQuotes, ...twelveDataQuotes].map((quote) => [quote.symbol, quote]));
  return selected.flatMap((instrument) => {
    const quote = quoteMap.get(instrument.symbol);
    return quote ? [quote] : [];
  });
}

async function getTwelveDataCandles(symbol: string, exchange: string, period: ChartPeriod): Promise<MarketCandle[]> {
  const apiKey = twelveDataKey();
  if (!apiKey) throw new Error("Ajoutez TWELVE_DATA_API_KEY pour charger l’historique de ce marché.");

  const settings = periodSettings[period];
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  if (exchange) url.searchParams.set("exchange", exchange);
  url.searchParams.set("interval", settings.twelveData);
  url.searchParams.set("outputsize", String(settings.outputsize));
  url.searchParams.set("order", "ASC");
  const response = await fetch(url, {
    headers: { Authorization: `apikey ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(providerErrorMessage(response.status));

  const payload = (await response.json()) as {
    status?: string;
    message?: string;
    values?: Array<{ datetime: string; open: string; high: string; low: string; close: string }>;
  };
  if (payload.status === "error" || !payload.values?.length) {
    throw new Error(payload.message || "Historique Twelve Data indisponible pour ce symbole.");
  }

  return payload.values.flatMap((value) => {
    const candle = {
      time: Math.floor(new Date(`${value.datetime.replace(" ", "T")}Z`).getTime() / 1000),
      open: Number(value.open),
      high: Number(value.high),
      low: Number(value.low),
      close: Number(value.close),
    };
    return Object.values(candle).every(Number.isFinite) ? [candle] : [];
  });
}

export async function getProviderCandles(symbol: string, exchange: string, period: ChartPeriod) {
  return getTwelveDataCandles(symbol, exchange, period);
}

export async function getMarketCandles(instrument: Instrument, period: ChartPeriod): Promise<MarketCandle[]> {
  const settings = periodSettings[period];
  if (instrument.provider === "Kraken" && instrument.krakenPair) {
    const url = new URL("https://api.kraken.com/0/public/OHLC");
    url.searchParams.set("pair", instrument.krakenPair);
    url.searchParams.set("interval", String(settings.kraken));
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(providerErrorMessage(response.status));

    const payload = (await response.json()) as {
      error?: string[];
      result?: Record<string, unknown>;
    };
    if (payload.error?.length) throw new Error("Kraken n’a pas renvoyé de bougies pour cette paire.");

    const pairKey = Object.keys(payload.result ?? {}).find((key) => key !== "last");
    const rows = pairKey ? payload.result?.[pairKey] : undefined;
    if (!Array.isArray(rows)) throw new Error("Historique Kraken indisponible pour cette paire.");

    return rows.flatMap((row) => {
      if (!Array.isArray(row) || row.length < 5) return [];
      const [time, open, high, low, close] = row;
      const candle = {
        time: Number(time),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
      };
      return Object.values(candle).every(Number.isFinite) ? [candle] : [];
    }).slice(-settings.outputsize);
  }

  return getTwelveDataCandles(instrument.providerSymbol, "", period);
}

export function parseChartPeriod(value: string | null): ChartPeriod | undefined {
  if (value === "1D" || value === "1W" || value === "1M" || value === "3M" || value === "1Y") return value;
  return undefined;
}