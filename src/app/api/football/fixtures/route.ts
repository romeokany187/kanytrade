import { loadFixtures } from "@/lib/football-fixtures";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() ?? "";
  const date = url.searchParams.get("date")?.trim() ?? "";
  const seek = url.searchParams.get("seek") === "1";
  if (!slug) return Response.json({ error: "Championnat manquant." }, { status: 400 });
  const body = await loadFixtures(slug, date, seek);
  return Response.json(body);
}
