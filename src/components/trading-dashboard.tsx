"use client";

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Database,
  Gauge,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingDown,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import { appFetch } from "@/lib/app-fetch";
import { MarketChart } from "@/components/market-chart";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  type ChartPeriod,
  type Instrument,
  type MarketQuote,
  instruments,
} from "@/lib/market-data";

interface JournalEntry {
  id: string;
  date: string;
  symbol: string;
  side: "Achat" | "Vente";
  note: string;
}

interface DashboardSnapshot {
  journal: JournalEntry[];
}

interface QuoteResponse {
  quotes: MarketQuote[];
}

const cryptoSymbols = instruments
  .filter((instrument) => instrument.provider === "Kraken")
  .map((instrument) => instrument.symbol);
const initialSnapshot: DashboardSnapshot = { journal: [] };
const storageKey = "kanytrade-dashboard";
let dashboardSnapshot = initialSnapshot;
let lastStoredValue: string | null | undefined;
const dashboardSubscribers = new Set<() => void>();

function readStoredSnapshot(): DashboardSnapshot {
  let storedValue: string | null = null;
  try {
    storedValue = window.localStorage.getItem(storageKey);
  } catch {
    storedValue = null;
  }

  if (storedValue === lastStoredValue) return dashboardSnapshot;
  lastStoredValue = storedValue;
  if (!storedValue) {
    dashboardSnapshot = initialSnapshot;
    return dashboardSnapshot;
  }

  try {
    const parsed = JSON.parse(storedValue) as Partial<DashboardSnapshot>;
    dashboardSnapshot = {
      journal: Array.isArray(parsed.journal) ? parsed.journal : [],
    };
  } catch {
    dashboardSnapshot = initialSnapshot;
  }
  return dashboardSnapshot;
}

function notifyStorageChange() {
  lastStoredValue = undefined;
  readStoredSnapshot();
  dashboardSubscribers.forEach((callback) => callback());
}

function subscribeToDashboard(callback: () => void) {
  dashboardSubscribers.add(callback);
  window.addEventListener("storage", notifyStorageChange);
  return () => {
    dashboardSubscribers.delete(callback);
    window.removeEventListener("storage", notifyStorageChange);
  };
}

function saveDashboardSnapshot(snapshot: DashboardSnapshot) {
  dashboardSnapshot = snapshot;
  lastStoredValue = JSON.stringify(snapshot);
  try {
    window.localStorage.setItem(storageKey, lastStoredValue);
  } catch {
    // Keep the current session usable when browser storage is disabled.
  }
  dashboardSubscribers.forEach((callback) => callback());
}

function formatPrice(instrument: Instrument, quote: MarketQuote | undefined) {
  if (quote?.status !== "live" || quote.price === null) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: instrument.precision,
    maximumFractionDigits: instrument.precision,
  }).format(quote.price);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuoteTime(quote: MarketQuote | undefined) {
  if (!quote) return "En attente du fournisseur";
  if (quote.status !== "live") return quote.message ?? "Cotation indisponible";
  const timestamp = quote.providerTime ?? quote.fetchedAt;
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }).format(new Date(timestamp));
  return quote.providerTime ? `Heure fournisseur · ${formatted} UTC` : `Reçu à ${formatted} UTC`;
}

function InstrumentMark({ instrument }: { instrument: Instrument }) {
  const mark = instrument.assetClass === "metal"
    ? "AU"
    : instrument.assetClass === "forex"
      ? instrument.symbol.slice(0, 2)
      : instrument.symbol.split("/")[0].slice(0, 3);

  return (
    <span
      className="instrument-mark"
      style={{ "--instrument-accent": instrument.accent } as CSSProperties}
      aria-hidden="true"
    >
      {mark}
    </span>
  );
}

async function requestQuotes(symbols?: string[], signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (symbols?.length) params.set("symbols", symbols.join(","));
  const response = await appFetch(`/api/market?${params.toString()}`, { cache: "no-store", signal });
  const payload = (await response.json()) as QuoteResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Impossible de charger les cotations.");
  return payload.quotes;
}

export function TradingDashboard() {
  const savedDashboard = useSyncExternalStore(
    subscribeToDashboard,
    readStoredSnapshot,
    () => initialSnapshot,
  );
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USD");
  const [period, setPeriod] = useState<ChartPeriod>("1D");
  const [searchQuery, setSearchQuery] = useState("");
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [capital, setCapital] = useState("");
  const [riskPercent, setRiskPercent] = useState("1");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalNote, setJournalNote] = useState("");
  const [journalSide, setJournalSide] = useState<"Achat" | "Vente">("Achat");

  const journal = savedDashboard.journal;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadQuotes(symbols?: string[]) {
      try {
        const results = await requestQuotes(symbols, controller.signal);
        if (!active) return;
        setQuotes((current) => ({
          ...current,
          ...Object.fromEntries(results.map((quote) => [quote.symbol, quote])),
        }));
        setQuoteError(null);
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setQuoteError(error instanceof Error ? error.message : "Flux de données indisponible.");
        }
      } finally {
        if (active) setQuotesLoading(false);
      }
    }

    void loadQuotes();
    const refreshCrypto = window.setInterval(() => void loadQuotes(cryptoSymbols), 15_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(refreshCrypto);
    };
  }, []);

  const selectedInstrument = instruments.find((instrument) => instrument.symbol === selectedSymbol) ?? instruments[0];
  const selectedQuote = quotes[selectedInstrument.symbol];
  const filteredInstruments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return instruments;
    return instruments.filter((instrument) => {
      const aliases = instrument.symbol === "XAU/USD" ? "gold or" : "";
      return `${instrument.name} ${instrument.symbol} ${aliases}`.toLowerCase().includes(query);
    });
  }, [searchQuery]);

  const liveQuoteCount = instruments.filter((instrument) => quotes[instrument.symbol]?.status === "live").length;
  const capitalValue = Math.max(0, Number(capital) || 0);
  const riskValue = Math.min(100, Math.max(0, Number(riskPercent) || 0));
  const entryValue = Math.max(0, Number(entryPrice) || selectedQuote?.price || 0);
  const stopValue = Math.max(0, Number(stopPrice) || 0);
  const riskAmount = capitalValue * (riskValue / 100);
  const stopDistance = Math.abs(entryValue - stopValue);
  const positionSize = stopDistance > 0 ? riskAmount / stopDistance : 0;
  async function refreshAllQuotes() {
    setRefreshing(true);
    setQuoteError(null);
    try {
      const results = await requestQuotes();
      setQuotes((current) => ({
        ...current,
        ...Object.fromEntries(results.map((quote) => [quote.symbol, quote])),
      }));
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : "Flux de données indisponible.");
    } finally {
      setRefreshing(false);
      setQuotesLoading(false);
    }
  }

  function addJournalEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = journalNote.trim();
    if (!note) return;

    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      symbol: selectedInstrument.symbol,
      side: journalSide,
      note,
    };
    saveDashboardSnapshot({ ...savedDashboard, journal: [entry, ...journal] });
    setJournalNote("");
    setShowJournalForm(false);
  }

  return (
    <WorkspaceShell
      section="overview"
      rightContent={
        <>
          <span className="feed-pill"><span className="feed-dot" /> {liveQuoteCount} / {instruments.length} cotations reçues</span>
          <button className="icon-button refresh-button" type="button" aria-label="Actualiser les cotations" title="Actualiser les cotations" disabled={refreshing} onClick={() => void refreshAllQuotes()}>
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
          </button>
        </>
      }
    >
        <main className="dashboard" id="overview">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Données de marché · RDC</p>
              <h1 className="page-title">Les marchés, en direct.</h1>
              <p className="page-subtitle">Cours issus des fournisseurs sélectionnés. Les valeurs absentes restent vides, jamais estimées.</p>
            </div>
            <div className="date-chip"><CalendarClock size={14} /> {liveQuoteCount} flux actifs</div>
          </div>

          {quoteError && <div className="inline-error" role="status"><CircleHelp size={15} /> {quoteError}</div>}

          <section className="metrics-grid" aria-label="Dernières cotations reçues">
            {["BTC/USD", "EUR/USD", "XAU/USD", "ETH/USD"].map((symbol) => {
              const instrument = instruments.find((item) => item.symbol === symbol)!;
              const quote = quotes[symbol];
              return (
                <article className="metric-card" key={symbol}>
                  <div className="metric-label">{instrument.shortName} <InstrumentMark instrument={instrument} /></div>
                  <div className={`metric-value ${quote?.status === "live" && quote.changePercent !== null ? quote.changePercent >= 0 ? "positive" : "negative" : ""}`}>
                    {quote?.status === "live" ? formatPrice(instrument, quote) : "—"}
                  </div>
                  <div className="metric-foot">
                    {quote?.status === "live" ? (
                      <><span className="feed-dot" /> {quote.changePercent === null ? quote.provider : `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% · ${quote.provider}`}</>
                    ) : quote?.message ?? (quotesLoading ? "Chargement du fournisseur…" : "Aucune cotation reçue")}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="dashboard-grid" id="markets" aria-label="Graphique et liste de suivi">
            <article className="panel chart-panel">
              <div className="panel-header">
                <div><h2 className="panel-title">Analyse du marché</h2><p className="panel-kicker">Chandeliers OHLC issus du fournisseur · pas de série synthétique</p></div>
                {selectedQuote?.status === "live" && <span className="source-tag"><Wifi size={12} /> {selectedQuote.provider}</span>}
              </div>
              <div className="chart-toolbar">
                <div className="chart-instrument">
                  <InstrumentMark instrument={selectedInstrument} />
                  <div><p className="instrument-name">{selectedInstrument.name}</p><p className="instrument-symbol">{selectedInstrument.symbol} · {selectedInstrument.provider}</p></div>
                </div>
                <div className="chart-price">
                  <div className="chart-price-value">{formatPrice(selectedInstrument, selectedQuote)}</div>
                  <div className="chart-price-change">{formatQuoteTime(selectedQuote)}</div>
                </div>
                <div className="period-control" role="group" aria-label="Période du graphique">
                  {(["1D", "1W", "1M", "3M", "1Y"] as ChartPeriod[]).map((item) => (
                    <button key={item} type="button" className={`period-button ${period === item ? "selected" : ""}`} aria-pressed={period === item} onClick={() => setPeriod(item)}>{item}</button>
                  ))}
                </div>
              </div>
              <div className="chart-wrap">
                <MarketChart key={`${selectedInstrument.symbol}-${period}`} symbol={selectedInstrument.symbol} period={period} />
              </div>
              <div className="chart-foot"><span><span className="chart-legend-dot" /> {selectedInstrument.provider} · {selectedInstrument.symbol}</span><span>Cotation reçue du fournisseur</span></div>
            </article>

            <article className="panel watchlist-panel">
              <div className="panel-header">
                <div><h2 className="panel-title">Marchés suivis</h2><p className="panel-kicker">Cotation affichée seulement si reçue</p></div>
                <span className="watchlist-count">{filteredInstruments.length} / {instruments.length}</span>
              </div>
              <div className="watchlist-head"><span>ACTIF</span><span>DERNIER COURS</span></div>
              <div className="watchlist-rows">
                {filteredInstruments.map((instrument) => {
                  const quote = quotes[instrument.symbol];
                  return (
                    <button key={instrument.symbol} className={`watchlist-row ${instrument.symbol === selectedSymbol ? "active" : ""}`} type="button" aria-pressed={instrument.symbol === selectedSymbol} onClick={() => setSelectedSymbol(instrument.symbol)}>
                      <span className="watchlist-asset"><InstrumentMark instrument={instrument} /><span><span className="watchlist-name">{instrument.shortName}</span><span className="watchlist-symbol">{instrument.symbol}</span></span></span>
                      <span className="watchlist-quote"><span className="watchlist-price">{formatPrice(instrument, quote)}</span><span className={`watchlist-change ${quote?.status === "live" ? "" : "quote-missing"}`}>{quote?.status === "live" ? instrument.provider : quote?.status === "not_configured" ? "Clé requise" : quotesLoading ? "Chargement…" : "Indisponible"}</span></span>
                    </button>
                  );
                })}
                {filteredInstruments.length === 0 && <p className="empty-search">Aucun marché trouvé.</p>}
              </div>
              <div className="panel-body search-body">
                <label className="search-field"><Search size={13} /><input aria-label="Rechercher un marché" placeholder="Rechercher un marché" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
              </div>
            </article>
          </section>

          <section className="lower-grid" aria-label="Gestion du risque et connexions">
            <article className="panel" id="risk">
              <div className="panel-header"><div><h2 className="panel-title">Calculateur de risque</h2><p className="panel-kicker">Cours d’entrée repris du flux lorsqu’il est disponible</p></div><Gauge size={17} color="var(--mint)" /></div>
              <div className="panel-body">
                <div className="risk-fields">
                  <label><span className="form-label">Solde USD saisi par vous</span><span className="input-wrap"><input className="form-input" type="number" min="0" step="any" inputMode="decimal" placeholder="Saisir le solde" value={capital} onChange={(event) => setCapital(event.target.value)} /><span className="input-suffix">$</span></span></label>
                  <label><span className="form-label">Risque planifié</span><span className="input-wrap"><input className="form-input" type="number" min="0" max="100" step="0.1" inputMode="decimal" value={riskPercent} onChange={(event) => setRiskPercent(event.target.value)} /><span className="input-suffix">%</span></span></label>
                  <label><span className="form-label">Prix d’entrée</span><input className="form-input" type="number" min="0" step="any" inputMode="decimal" placeholder={selectedQuote?.status === "live" ? formatPrice(selectedInstrument, selectedQuote) : "Cours indisponible"} value={entryPrice} onChange={(event) => setEntryPrice(event.target.value)} /></label>
                  <label><span className="form-label">Stop-loss</span><input className="form-input" type="number" min="0" step="any" inputMode="decimal" placeholder="Saisir le stop" value={stopPrice} onChange={(event) => setStopPrice(event.target.value)} /></label>
                </div>
                <div className="risk-result">
                  <div><div className="risk-result-label">Risque calculé</div><div className="risk-result-value">{capitalValue > 0 ? formatUsd(riskAmount) : "—"}</div></div>
                  <div className="risk-result-side"><div className="risk-result-label">Quantité indicative</div><div className="risk-result-value">{capitalValue > 0 && stopDistance > 0 ? positionSize.toFixed(6) : "—"}</div></div>
                </div>
                <p className="risk-caption">Estimation arithmétique à partir du solde saisi et de la distance entrée/stop. Elle n’intègre ni levier, frais, spread, taille de contrat ni valeur du pip. Ce n’est pas un ordre.</p>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header"><div><h2 className="panel-title">Sources et exécution</h2><p className="panel-kicker">État réel des connexions</p></div><Database size={16} color="var(--mint)" /></div>
              <div className="panel-body">
                <div className="source-rows">
                  <div className="source-row"><span><span className="feed-dot" /> Kraken · crypto spot</span><span>Lecture seule</span></div>
                  <div className="source-row"><span><span className={`feed-dot ${Object.values(quotes).some((quote) => quote.provider === "Twelve Data" && quote.status === "live") ? "" : "feed-dot-off"}`} /> Twelve Data · FX / or</span><span>{Object.values(quotes).some((quote) => quote.provider === "Twelve Data" && quote.status === "live") ? "Cotation reçue" : Object.values(quotes).some((quote) => quote.provider === "Twelve Data" && quote.status === "not_configured") ? "Clé serveur requise" : "Indisponible"}</span></div>
                  <div className="source-row"><span><LockKeyhole size={13} /> Compte de courtage</span><span>Non connecté</span></div>
                </div>
                <div className="execution-notice"><ShieldCheck size={15} /><span>Les ordres réels ne sont pas activés. Aucun ordre n’est préparé ni envoyé par cette version.</span></div>
              </div>
            </article>
          </section>

          <section className="panel journal-panel" id="journal">
            <div className="panel-header">
              <div><h2 className="panel-title">Journal de trading</h2><p className="panel-kicker">Notes saisies par vous, conservées sur cet appareil</p></div>
              <button className="journal-add-button" type="button" onClick={() => setShowJournalForm((visible) => !visible)}><ClipboardList size={13} /> Ajouter une note</button>
            </div>
            {showJournalForm && (
              <form className="journal-form" onSubmit={addJournalEntry}>
                <label className="journal-field"><span className="form-label">Observation</span><input className="note-input" required maxLength={180} placeholder="Votre observation de marché" value={journalNote} onChange={(event) => setJournalNote(event.target.value)} /></label>
                <label><span className="form-label">Sens</span><select className="journal-select" value={journalSide} onChange={(event) => setJournalSide(event.target.value as "Achat" | "Vente")}><option>Achat</option><option>Vente</option></select></label>
                <button className="journal-save" type="submit" aria-label="Enregistrer la note"><ArrowRight size={16} /></button>
              </form>
            )}
            {journal.length > 0 ? (
              <div className="journal-overflow">
                <table className="journal-table">
                  <thead><tr><th>DATE SAISIE</th><th>ACTIF</th><th>SENS</th><th>NOTE PERSONNELLE</th></tr></thead>
                  <tbody>{journal.map((entry) => <tr key={entry.id}><td>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.date))}</td><td className="journal-instrument">{entry.symbol}</td><td><span className={`journal-tag ${entry.side === "Achat" ? "positive" : "negative"}`}>{entry.side}</span></td><td>{entry.note}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <div className="journal-empty">Le journal est vide. Vos notes apparaîtront ici après saisie.</div>}
          </section>

          <footer className="dashboard-footer"><span><CheckCircle2 size={12} /> Données de marché fournies par des services tiers, avec leurs délais et limites d’accès.</span><span><TrendingDown size={12} /> Toute opération de marché comporte un risque de perte.</span></footer>
        </main>
    </WorkspaceShell>
  );
}