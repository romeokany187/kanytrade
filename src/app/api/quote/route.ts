export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim() ?? "";
  const exchange = url.searchParams.get("exchange")?.trim() ?? "";
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();

  if (!/^[A-Za-z0-9./:_-]{1,32}$/.test(symbol) || exchange.length > 24) {
    return Response.json({ error: "Symbole ou place boursière invalide." }, { status: 400 });
  }
  if (!apiKey) {
    return Response.json({ error: "Configurez TWELVE_DATA_API_KEY pour consulter les cotations." }, { status: 503 });
  }

  const providerUrl = new URL("https://api.twelvedata.com/quote");
  providerUrl.searchParams.set("symbol", symbol);
  if (exchange) providerUrl.searchParams.set("exchange", exchange);

  try {
    const response = await fetch(providerUrl, {
      headers: { Authorization: `apikey ${apiKey}` },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(10000),
    });
    const quote = (await response.json()) as {
      status?: string;
      message?: string;
      symbol?: string;
      name?: string;
      exchange?: string;
      currency?: string;
      close?: string;
      percent_change?: string;
      datetime?: string;
    };

    const price = Number(quote.close);
    if (!response.ok || quote.status === "error" || !Number.isFinite(price) || price <= 0) {
      return Response.json(
        { error: quote.message || "Aucune cotation accessible pour ce symbole." },
        { status: response.status >= 400 ? response.status : 404 },
      );
    }

    return Response.json(
      {
        symbol: quote.symbol ?? symbol,
        name: quote.name ?? symbol,
        exchange: (quote.exchange ?? exchange) || "Non précisée",
        currency: quote.currency ?? "",
        price,
        changePercent: Number.isFinite(Number(quote.percent_change)) ? Number(quote.percent_change) : null,
        providerTime: quote.datetime ?? null,
        fetchedAt: new Date().toISOString(),
        provider: "Twelve Data",
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch {
    return Response.json({ error: "Connexion au fournisseur de cotations impossible." }, { status: 502 });
  }
}