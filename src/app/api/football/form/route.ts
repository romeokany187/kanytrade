import { findTeamForm } from "@/lib/team-form";

export async function GET(request: Request) {
  const team = new URL(request.url).searchParams.get("team")?.trim() ?? "";
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
