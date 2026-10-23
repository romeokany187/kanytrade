const BASE = "https://www.thesportsdb.com/api/v1/json/3";

type Suggestion = {
  label: string;
  value: string;
  detail: string;
  query: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "player" ? "player" : "team";
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ suggestions: [] });

  const endpoint = kind === "player"
    ? `${BASE}/searchplayers.php?p=${encodeURIComponent(query)}`
    : `${BASE}/searchteams.php?t=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, { next: { revalidate: 60 * 30 } });
  if (!response.ok) return Response.json({ suggestions: [] });
  const body = await response.json() as {
    teams?: Array<{ strTeam: string; strLeague: string; strCountry: string }> | null;
    player?: Array<{ strPlayer: string; strTeam: string; strPosition: string }> | null;
  };

  const suggestions: Suggestion[] = kind === "player"
    ? (body.player ?? []).slice(0, 8).map((player) => ({
      label: player.strPlayer,
      value: player.strPlayer,
      detail: [player.strPosition, player.strTeam].filter(Boolean).join(" · "),
      query: player.strTeam || player.strPlayer,
    }))
    : (body.teams ?? []).slice(0, 8).map((team) => ({
      label: team.strTeam,
      value: team.strTeam,
      detail: [team.strLeague, team.strCountry].filter(Boolean).join(" · "),
      query: team.strTeam,
    }));

  return Response.json({ suggestions });
}
