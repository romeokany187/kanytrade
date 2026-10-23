import { loadExternal } from "@/lib/football-competitions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const squad = await loadExternal(decodeURIComponent(slug));
  if (!squad) return Response.json({ error: "Championnat introuvable." }, { status: 404 });
  return Response.json(squad);
}
