import { listCompetitions, localCompetitionGroups } from "@/lib/football-competitions";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope === "local") return Response.json({ groups: localCompetitionGroups() });
  const groups = await listCompetitions();
  return Response.json({ groups });
}
