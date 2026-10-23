"use client";

import { ArrowUpRight, Globe2, Search } from "lucide-react";
import { appFetch } from "@/lib/app-fetch";
import Link from "next/link";
import { useEffect, useState } from "react";

const categories = [
  { id: "stocks", label: "Actions" },
  { id: "forex", label: "Forex" },
  { id: "commodities", label: "Matières premières" },
  { id: "indices", label: "Indices" },
  { id: "crypto", label: "Crypto" },
  { id: "etfs", label: "ETF" },
  { id: "funds", label: "Fonds" },
] as const;

interface MarketInstrument {
  symbol: string;
  name: string;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  instrumentType: string;
  access: { global?: string; plan?: string } | null;
}

export function MarketExplorer() {
  const [category, setCategory] = useState<(typeof categories)[number]["id"]>("stocks");
  const [query, setQuery] = useState("");
  const [instruments, setInstruments] = useState<MarketInstrument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalizedQuery = query.trim();
    const hasDirectory = category === "forex" || category === "crypto" || category === "commodities" || category === "indices";
    if (normalizedQuery.length === 1 || (!hasDirectory && normalizedQuery.length < 2)) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ type: category, limit: "50" });
      if (normalizedQuery) params.set("q", normalizedQuery);
      try {
        const response = await appFetch(`/api/catalog?${params}`, { signal: controller.signal });
        const payload = (await response.json()) as { instruments?: MarketInstrument[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Le catalogue est indisponible.");
        setInstruments(payload.instruments ?? []);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setInstruments([]);
          setError(requestError instanceof Error ? requestError.message : "Le catalogue est indisponible.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, normalizedQuery ? 350 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [category, query]);
  const hasDirectory = category === "forex" || category === "crypto" || category === "commodities" || category === "indices";
  const lookupMessage = query.trim().length < 2 && !hasDirectory
    ? "Saisissez au moins deux caractères pour rechercher dans cette classe d’actifs."
    : "";
  const displayedInstruments = lookupMessage ? [] : instruments;

  return (
    <main className="dashboard market-explorer-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Univers multi-actifs</p>
          <h1 className="page-title">Explorer les marchés</h1>
          <p className="page-subtitle">Recherche mondiale par symbole, place boursière et classe d’actif.</p>
        </div>
        <span className="source-tag"><Globe2 size={13} /> Catalogue mondial</span>
      </div>

      <section className="panel market-browser" aria-label="Catalogue des instruments">
        <div className="market-browser-toolbar">
          <label className="search-field market-search">
            <Search size={15} />
            <input aria-label="Rechercher un symbole ou une société" placeholder="Symbole, société, fonds…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label className="market-category-label" htmlFor="market-category">Classe d’actif</label>
          <select id="market-category" className="market-category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>

        <div className="market-table-scroll">
          <table className="market-table">
            <thead><tr><th>INSTRUMENT</th><th>CLASSE</th><th>PLACE</th><th>PAYS</th><th>DEVISE</th><th>ACCÈS</th><th aria-label="Détail" /></tr></thead>
            <tbody>
              {displayedInstruments.map((instrument, index) => {
                const detail = new URLSearchParams({ symbol: instrument.symbol, name: instrument.name });
                if (instrument.exchange) detail.set("exchange", instrument.exchange);
                return (
                  <tr key={`${instrument.symbol}-${instrument.exchange}-${index}`}>
                    <td><Link className="market-instrument-link" href={`/markets/instrument?${detail}`}><strong>{instrument.symbol}</strong><span>{instrument.name}</span></Link></td>
                    <td>{instrument.instrumentType}</td>
                    <td>{instrument.exchange ?? "—"}</td>
                    <td>{instrument.country ?? "—"}</td>
                    <td>{instrument.currency ?? "—"}</td>
                    <td>{instrument.access?.global ?? instrument.access?.plan ?? "Selon le forfait"}</td>
                    <td><Link className="market-open-link" href={`/markets/instrument?${detail}`} aria-label={`Voir ${instrument.symbol}`}><ArrowUpRight size={15} /></Link></td>
                  </tr>
                );
              })}
              {!loading && displayedInstruments.length === 0 && <tr><td className="market-empty" colSpan={7}>{lookupMessage || error || "Aucun instrument correspondant dans le catalogue."}</td></tr>}
              {loading && !lookupMessage && <tr><td className="market-empty" colSpan={7}>Chargement du catalogue fournisseur…</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="market-browser-footer">
          <span>{loading ? "Recherche en cours" : `${displayedInstruments.length} résultats affichés`}</span>
          <span>Source : Twelve Data · catalogues, pas des cotations en temps réel</span>
        </footer>
      </section>

      <div className="market-data-note"><Globe2 size={15} /><p>La couverture et l’accès aux cotations dépendent de l’instrument, de la place et du forfait fournisseur. Le pays indiqué correspond à l’instrument, pas à votre résidence. Les catalogues gratuits ont des quotas limités.</p></div>
    </main>
  );
}