import { findWinnerQuote } from "@/lib/winner-odds";

export async function GET(request: Request) {
  const url = new URL(request.url);
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
