const BASE = "https://www.thesportsdb.com/api/v1/json/3";

type SportsDbTeam = {
  idTeam: string;
  strTeam: string;
  strLeague: string;
  strCountry: string;
  strBadge: string;
};

type SportsDbEvent = {
  strEvent: string;
  dateEvent: string;
  strTime: string;
  strVenue: string;
};

type SportsDbPlayer = {
  strPlayer: string;
  strPosition: string;
};

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim();
  if (!name) return Response.json({ error: "Nom d'équipe manquant." }, { status: 400 });

  const teamResponse = await fetch(`${BASE}/searchteams.php?t=${encodeURIComponent(name)}`, {
    next: { revalidate: 60 * 30 },
  });
  if (!teamResponse.ok) return Response.json({ error: "La source d'équipes ne répond pas." }, { status: 502 });
  const teamPayload = await teamResponse.json() as { teams: SportsDbTeam[] | null };
  const team = teamPayload.teams?.find((item) => item.strTeam.toLowerCase() === name.toLowerCase()) ?? teamPayload.teams?.[0];
  if (!team) return Response.json({ error: "Équipe introuvable." }, { status: 404 });

  const [eventsResponse, playersResponse] = await Promise.all([
    fetch(`${BASE}/eventsnext.php?id=${team.idTeam}`, { next: { revalidate: 60 * 15 } }),
    fetch(`${BASE}/lookup_all_players.php?id=${team.idTeam}`, { next: { revalidate: 60 * 60 * 12 } }),
  ]);
  const eventsPayload = eventsResponse.ok
    ? await eventsResponse.json() as { events: SportsDbEvent[] | null }
    : { events: [] };
  const playersPayload = playersResponse.ok
    ? await playersResponse.json() as { player: SportsDbPlayer[] | null }
    : { player: [] };
  const nextEvent = eventsPayload.events?.[0] ?? null;

  return Response.json({
    source: "TheSportsDB",
    team: team.strTeam,
    league: team.strLeague,
    country: team.strCountry,
    badge: team.strBadge,
    nextMatch: nextEvent ? {
      name: nextEvent.strEvent,
      date: nextEvent.dateEvent,
      time: nextEvent.strTime,
      venue: nextEvent.strVenue,
    } : null,
    players: (playersPayload.player ?? [])
      .filter((player) => player.strPlayer && !/coach|manager|staff/i.test(player.strPosition ?? ""))
      .slice(0, 11)
      .map((player) => ({
        name: player.strPlayer,
        position: player.strPosition,
      })),
  });
}
