import { findInstrument, getMarketCandles, getProviderCandles, parseChartPeriod } from "@/lib/market-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim() ?? "";
  const exchange = url.searchParams.get("exchange")?.trim() ?? "";
  const instrument = findInstrument(symbol);
  const period = parseChartPeriod(url.searchParams.get("period"));

  if (!/^[A-Za-z0-9./:_-]{1,32}$/.test(symbol) || !/^[A-Za-z0-9 .&_-]{0,40}$/.test(exchange) || !period) {
    return Response.json(
      { error: "Symbole ou période non pris en charge." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const candles = instrument
      ? await getMarketCandles(instrument, period)
      : await getProviderCandles(symbol, exchange, period);
    return Response.json(
      { symbol, provider: instrument?.provider ?? "Twelve Data", candles, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return Response.json(
      { symbol, provider: instrument.provider, error: error instanceof Error ? error.message : "Historique indisponible." },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}