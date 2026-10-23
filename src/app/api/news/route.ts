import { XMLParser } from "fast-xml-parser";

const topics = {
  global: "financial markets OR economy OR stocks OR forex OR commodities OR cryptocurrency",
  forex: "foreign exchange OR forex OR currency markets",
  crypto: "cryptocurrency OR bitcoin OR ethereum",
  commodities: "gold OR oil OR commodities markets",
  equities: "global stocks OR equity markets OR stock exchange",
} as const;

type NewsTopic = keyof typeof topics;

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  source?: string | { "#text"?: string };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

export async function GET(request: Request) {
  const requestedTopic = new URL(request.url).searchParams.get("topic") ?? "global";
  if (!Object.hasOwn(topics, requestedTopic)) {
    return Response.json({ error: "Thème d’actualité non pris en charge." }, { status: 400 });
  }

  const feedUrl = new URL("https://news.google.com/rss/search");
  feedUrl.searchParams.set("q", topics[requestedTopic as NewsTopic]);
  feedUrl.searchParams.set("hl", "en-US");
  feedUrl.searchParams.set("gl", "US");
  feedUrl.searchParams.set("ceid", "US:en");

  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "Kanytrade/1.0 (market research news feed)" },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      return Response.json({ error: "Le flux d’actualités est temporairement indisponible." }, { status: 502 });
    }

    const parsed = parser.parse(await response.text()) as {
      rss?: { channel?: { item?: RssItem | RssItem[] } };
    };
    const items = parsed.rss?.channel?.item;
    const articles = (Array.isArray(items) ? items : items ? [items] : []).flatMap((item) => {
      if (!item.title || !item.link) return [];
      const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
      const source = typeof item.source === "string" ? item.source : item.source?.["#text"];
      return [{
        title: item.title,
        url: item.link,
        source: source || "Google News · source éditeur",
        publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt.toISOString() : null,
      }];
    }).slice(0, 30);

    return Response.json(
      { articles, topic: requestedTopic, provider: "Google News RSS", fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=900" } },
    );
  } catch {
    return Response.json({ error: "Impossible de charger le flux d’actualités." }, { status: 502 });
  }
}