const categories = {
  stocks: /stock|equity|share|reit|depositary receipt/i,
  forex: /forex|currency pair/i,
  crypto: /crypto|digital currency/i,
  commodities: /commodit|precious metal|energy|agricultur|future/i,
  indices: /index/i,
  etfs: /\betf\b|exchange.?traded fund/i,
  funds: /mutual fund|\bfund\b/i,
} as const;

const directoryEndpoints = {
  forex: "forex_pairs",
  crypto: "cryptocurrencies",
  commodities: "commodities",
  indices: "indices",
} as const;

type CatalogType = keyof typeof categories;

interface ProviderInstrument {
  symbol?: string;
  name?: string;
  instrument_name?: string;
  exchange?: string;
  country?: string;
  currency?: string;
  currency_quote?: string;
  instrument_type?: string;
  category?: string;
  available_exchanges?: string[];
  access?: { global?: string; plan?: string };
}

function isCatalogType(value: string): value is CatalogType {
  return Object.hasOwn(categories, value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("type") ?? "";
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  const isDirectory = isCatalogType(category) && Object.hasOwn(directoryEndpoints, category);

  if (!isCatalogType(category) || (query.length < 2 && !isDirectory)) {
    return Response.json(
      { error: !isCatalogType(category) ? "Type de marché non pris en charge." : "La recherche doit contenir au moins 2 caractères." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!apiKey) {
    return Response.json(
      { error: "Configurez TWELVE_DATA_API_KEY pour accéder aux catalogues mondiaux." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const providerUrl = new URL(
    `https://api.twelvedata.com/${isDirectory ? directoryEndpoints[category as keyof typeof directoryEndpoints] : "symbol_search"}`,
  );
  if (isDirectory) providerUrl.searchParams.set("show_plan", "true");
  else {
    providerUrl.searchParams.set("symbol", query);
    providerUrl.searchParams.set("show_plan", "true");
  }
  try {
    const response = await fetch(providerUrl, {
      headers: { Authorization: `apikey ${apiKey}` },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10000),
    });
    const payload = (await response.json()) as {
      data?: ProviderInstrument[];
      status?: string;
      message?: string;
    };

    if (!response.ok || payload.status === "error") {
      return Response.json(
        { error: payload.message || "Le catalogue du fournisseur est indisponible." },
        { status: response.status >= 400 ? response.status : 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const categoryPattern = isDirectory ? undefined : categories[category as CatalogType];
    const normalizedQuery = query.toLowerCase();
    const instruments = (payload.data ?? []).filter((item) => {
      if (categoryPattern && item.instrument_type && !categoryPattern.test(item.instrument_type)) return false;
      if (!normalizedQuery) return true;
      return `${item.symbol ?? ""} ${item.name ?? ""} ${item.instrument_name ?? ""} ${item.exchange ?? ""} ${item.country ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    }).slice(0, limit).flatMap((item) => {
      if (!item.symbol) return [];
      return [{
        symbol: item.symbol,
        name: item.name ?? item.instrument_name ?? item.symbol,
        exchange: item.exchange ?? item.available_exchanges?.[0] ?? null,
        country: item.country ?? null,
        currency: item.currency ?? item.currency_quote ?? null,
        instrumentType: item.instrument_type ?? item.category ?? category,
        access: item.access ?? null,
      }];
    });

    return Response.json(
      { instruments, provider: "Twelve Data", fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return Response.json(
      { error: "Connexion au fournisseur de catalogues impossible." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}