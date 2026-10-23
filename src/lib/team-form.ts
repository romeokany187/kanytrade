import { teamScore } from "./winner-odds";

export type TeamForm = {
  found: true;
  team: string;
  attack: string;
  defense: string;
  played: number;
  message: string;
};

const REJECT = /\b(u\d{2}|youth|women|woman|reserve|reserves|ladies)\b|\b(ii|b|c)\b/i;
const cache = new Map<string, { at: number; form: TeamForm | null }>();

function seasonYear(now = new Date()) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function decode(value: string) {
  return value
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .trim();
}

export function pickTeamLink(html: string, team: string) {
  const hits = [...html.matchAll(/href='(\/team-preview,\d{4},[^']+)'\s*>([^<]+)/g)];
  let best: { href: string; name: string; score: number; words: number } | null = null;
  for (const hit of hits) {
    const name = decode(hit[2]);
    if (!name || REJECT.test(name) || name.includes("/") || name.includes(" - ")) continue;
    const score = teamScore(team, name);
    if (score < 70) continue;
    const words = name.split(/\s+/).length;
    if (!best || score > best.score || (score === best.score && words < best.words)) {
      best = { href: hit[1], name, score, words };
    }
  }
  return best;
}

export function recentRates(html: string) {
  const start = html.indexOf("PAST GAMES");
  const slice = start >= 0 ? html.slice(start, start + 120000) : "";
  const games: Array<{ scored: number; conceded: number }> = [];
  for (const chunk of slice.split('<div class="pointsdata">').slice(1)) {
    const score = chunk.match(/class="score">\s*([0-9]+)\s*-\s*([0-9]+)\s*</);
    if (!score) continue;
    const sides = [...chunk.matchAll(/class="homedata roundteam( bold)?\s*"><a [^>]*>([^<]+)/g)];
    if (sides.length < 2) continue;
    const homeGoals = Number(score[1]);
    const awayGoals = Number(score[2]);
    const home = Boolean(sides[0][1]);
    games.push(home
      ? { scored: homeGoals, conceded: awayGoals }
      : { scored: awayGoals, conceded: homeGoals });
    if (games.length === 8) break;
  }
  return games;
}

function average(games: Array<{ scored: number; conceded: number }>, key: "scored" | "conceded") {
  const total = games.reduce((sum, game) => sum + game[key], 0);
  return (total / games.length).toFixed(2);
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html, */*",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.btfstats.com/",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("down");
  return response.text();
}

export async function findTeamForm(team: string): Promise<TeamForm | null> {
  const key = team.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < (hit.form ? 6 * 60 * 60 * 1000 : 10 * 60 * 1000);
  if (hit && fresh) return hit.form;
  const year = seasonYear();
  const search = await fetchText(`https://www.btfstats.com/ajax/livesearch.php?q=${encodeURIComponent(team)}&year=${year}`);
  const link = pickTeamLink(search, team);
  if (!link) {
    cache.set(key, { at: Date.now(), form: null });
    return null;
  }
  const page = await fetchText(`https://www.btfstats.com${link.href}`);
  const games = recentRates(page);
  if (games.length < 4) {
    cache.set(key, { at: Date.now(), form: null });
    return null;
  }
  const form: TeamForm = {
    found: true,
    team: link.name,
    attack: average(games, "scored"),
    defense: average(games, "conceded"),
    played: games.length,
    message: `${link.name} : ${average(games, "scored")} buts marqués et ${average(games, "conceded")} encaissés sur les ${games.length} derniers matchs trouvés.`,
  };
  cache.set(key, { at: Date.now(), form });
  return form;
}
