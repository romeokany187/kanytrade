"use client";

import { ArrowLeft, Clock3, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { appFetch } from "@/lib/app-fetch";
import { MarketChart } from "@/components/market-chart";
import type { ChartPeriod } from "@/lib/market-data";

interface InstrumentQuote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  changePercent: number | null;
  providerTime: string | null;
  fetchedAt: string;
  provider: string;
}

export function MarketInstrumentDetail({ symbol, name, exchange }: { symbol: string; name: string; exchange: string }) {
  const [quote, setQuote] = useState<InstrumentQuote | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<ChartPeriod>("1D");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ symbol });
    if (exchange) params.set("exchange", exchange);
    async function loadQuote() {
      try {
        const response = await appFetch(`/api/quote?${params}`, { signal: controller.signal });
        const payload = await response.json() as InstrumentQuote & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Cotation indisponible.");
        setQuote(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "Cotation indisponible.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    if (symbol) void loadQuote();
    return () => controller.abort();
  }, [exchange, symbol]);
  const missingSymbol = !symbol;
  const visibleError = missingSymbol ? "Symbole absent. Revenez au catalogue et choisissez un instrument." : error;
  const isLoading = !missingSymbol && loading;

  return (
    <main className="dashboard instrument-detail-page">
      <Link className="back-link" href="/markets"><ArrowLeft size={14} /> Tous les marchés</Link>
      <div className="page-heading">
        <div><p className="eyebrow">Fiche instrument · {exchange || "Place non précisée"}</p><h1 className="page-title">{name || symbol}</h1><p className="page-subtitle">{symbol} · Cotation consultée à la demande auprès de Twelve Data.</p></div>
      </div>
      <section className="instrument-quote-panel" aria-live="polite">
        <div><span className="instrument-detail-label">Dernier cours reçu</span><strong className="instrument-detail-price">{isLoading ? "…" : quote ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(quote.price) : "—"} {quote?.currency}</strong></div>
        <div className="instrument-detail-change">{quote?.changePercent === null || quote?.changePercent === undefined ? "Variation non fournie" : `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)} %`}</div>
        <div className="instrument-detail-meta"><span><Clock3 size={13} /> {quote?.providerTime ? `Horodatage fournisseur : ${quote.providerTime}` : quote ? `Reçu : ${new Date(quote.fetchedAt).toLocaleString("fr-FR")}` : "Horodatage indisponible"}</span><span>Place : {(quote?.exchange ?? exchange) || "Non précisée"}</span></div>
        {visibleError && <p className="inline-error instrument-detail-error">{visibleError}</p>}
      </section>
      {symbol && <section className="panel detail-chart-panel" aria-label={`Graphique historique de ${symbol}`}>
        <div className="panel-header"><div><h2 className="panel-title">Graphique OHLC</h2><p className="panel-kicker">Historique fourni pour le symbole et la place sélectionnés</p></div><span className="source-tag">Twelve Data</span></div>
        <div className="chart-toolbar detail-chart-toolbar">
          <div className="chart-instrument"><div><p className="instrument-name">{name || symbol}</p><p className="instrument-symbol">{symbol} · {exchange || "Place automatique"}</p></div></div>
          <div className="period-control" role="group" aria-label="Période du graphique">
            {(["1D", "1W", "1M", "3M", "1Y"] as ChartPeriod[]).map((item) => <button aria-pressed={period === item} className={`period-button ${period === item ? "selected" : ""}`} key={item} onClick={() => setPeriod(item)} type="button">{item}</button>)}
          </div>
        </div>
        <div className="chart-wrap"><MarketChart key={`${symbol}-${exchange}-${period}`} symbol={symbol} exchange={exchange} period={period} /></div>
      </section>}
      <div className="market-data-note"><ShieldCheck size={15} /><p>Cette cotation peut être retardée ou inaccessible selon le forfait et la place. Un cours absent n’est pas estimé. Aucun ordre ne peut être envoyé depuis cette fiche.</p></div>
      <a className="provider-link" href="https://twelvedata.com/" target="_blank" rel="noreferrer">Documentation fournisseur <ExternalLink size={13} /></a>
    </main>
  );
}