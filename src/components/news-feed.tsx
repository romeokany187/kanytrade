"use client";

import { ExternalLink, Newspaper, RefreshCw } from "lucide-react";
import { appFetch } from "@/lib/app-fetch";
import { useEffect, useState } from "react";

const topics = [
  { id: "global", label: "Monde" },
  { id: "equities", label: "Actions" },
  { id: "forex", label: "Forex" },
  { id: "commodities", label: "Matières premières" },
  { id: "crypto", label: "Crypto" },
] as const;

interface Article {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
}

export function NewsFeed() {
  const [topic, setTopic] = useState<(typeof topics)[number]["id"]>("global");
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function loadNews() {
      setLoading(true);
      setError("");
      try {
        const response = await appFetch(`/api/news?topic=${topic}`, { signal: controller.signal });
        const payload = await response.json() as { articles?: Article[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Le flux d’actualités est indisponible.");
        setArticles(payload.articles ?? []);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setArticles([]);
          setError(requestError instanceof Error ? requestError.message : "Le flux d’actualités est indisponible.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadNews();
    return () => controller.abort();
  }, [topic]);

  return (
    <main className="dashboard news-page">
      <div className="page-heading">
        <div><p className="eyebrow">Presse financière internationale</p><h1 className="page-title">Actualités des marchés</h1><p className="page-subtitle">Titres agrégés avec éditeur et lien vers la publication d’origine.</p></div>
        <span className="source-tag"><Newspaper size={13} /> Flux RSS</span>
      </div>
      <section className="news-section" aria-label="Articles d’actualité">
        <div className="news-toolbar">
          <div className="news-tabs" role="group" aria-label="Filtrer les actualités">
            {topics.map((item) => <button aria-pressed={topic === item.id} className={`news-tab ${topic === item.id ? "selected" : ""}`} key={item.id} onClick={() => setTopic(item.id)} type="button">{item.label}</button>)}
          </div>
          <span className="news-provider">Google News · actualisé avec cache de 10 min</span>
        </div>
        {error && <p className="inline-error" role="status">{error}</p>}
        {loading ? <p className="news-empty">Chargement des derniers titres…</p> : articles.length ? (
          <ol className="news-list">
            {articles.map((article, index) => <li className="news-item" key={`${article.url}-${index}`}>
              <div className="news-item-main"><span className="news-source">{article.source}</span><h2><a href={article.url} target="_blank" rel="noreferrer">{article.title}</a></h2><div className="news-meta">{article.publishedAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(article.publishedAt)) + " UTC" : "Date non fournie"}</div></div>
              <a aria-label={`Ouvrir l’article : ${article.title}`} className="market-open-link" href={article.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a>
            </li>)}
          </ol>
        ) : !error ? <p className="news-empty">Aucun titre fourni pour ce thème pour le moment.</p> : null}
        <footer className="news-footer"><RefreshCw size={13} /><span>Les articles restent la propriété de leurs éditeurs. Kanytrade affiche uniquement les titres et liens attribués.</span></footer>
      </section>
    </main>
  );
}