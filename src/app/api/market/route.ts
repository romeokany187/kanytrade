import { findInstrument, getMarketQuotes, instruments } from "@/lib/market-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedSymbols = url.searchParams.get("symbols");
  const symbols = requestedSymbols
    ? [...new Set(requestedSymbols.split(",").map((symbol) => symbol.trim()).filter(Boolean))].slice(0, 8)
    : instruments.map((instrument) => instrument.symbol);
  const selected = symbols.map(findInstrument).filter((instrument) => instrument !== undefined);

  if (!selected.length) {
    return Response.json(
      { error: "Aucun symbole pris en charge." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const quotes = await getMarketQuotes(selected);
  return Response.json(
    { quotes, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}