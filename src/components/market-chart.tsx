"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import { appFetch } from "@/lib/app-fetch";
import type { ChartPeriod, MarketCandle } from "@/lib/market-data";

interface MarketChartProps {
  symbol: string;
  exchange?: string;
  period: ChartPeriod;
}

interface HistoryResponse {
  provider: string;
  candles: MarketCandle[];
  fetchedAt: string;
  error?: string;
}

function summarizeRecentCandles(candles: MarketCandle[]) {
  const recent = candles.slice(-24);
  if (recent.length < 2) return null;

  const firstClose = recent[0].close;
  const lastClose = recent[recent.length - 1].close;
  if (firstClose <= 0) return null;

  const change = ((lastClose - firstClose) / firstClose) * 100;
  const highest = Math.max(...recent.map((candle) => candle.high));
  const lowest = Math.min(...recent.map((candle) => candle.low));

  return {
    candleCount: recent.length,
    direction: change > 0 ? "Hausse" : change < 0 ? "Baisse" : "Stable",
    change,
    range: ((highest - lowest) / firstClose) * 100,
  };
}

function formatPercentage(value: number) {
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted} %`;
}

export function MarketChart({ symbol, exchange = "", period }: MarketChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const recentReadout = history ? summarizeRecentCandles(history.candles) : null;

  useEffect(() => {
    const controller = new AbortController();

    async function loadHistory() {
      try {
        const query = new URLSearchParams({ symbol, period });
        if (exchange) query.set("exchange", exchange);
        const response = await appFetch(`/api/history?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as HistoryResponse;
        if (!response.ok || payload.error || !payload.candles?.length) {
          throw new Error(payload.error || "Aucun historique reçu pour ce marché.");
        }
        setHistory(payload);
        setHistoryError(null);
      } catch (error) {
        if (!controller.signal.aborted) {
          setHistoryError(error instanceof Error ? error.message : "Historique indisponible.");
          setHistory(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadHistory();
    return () => controller.abort();
  }, [exchange, period, symbol]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !history?.candles.length) return;

    const instrument = instruments.find((item) => item.symbol === symbol);
    const accent = instrument?.accent ?? "#b9ed8b";
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#151e18" },
        textColor: "#829186",
        fontFamily: "Montserrat, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#202d24" },
        horzLines: { color: "#202d24" },
      },
      crosshair: {
        vertLine: { color: "#536b54", labelBackgroundColor: "#344737" },
        horzLine: { color: "#536b54", labelBackgroundColor: "#344737" },
      },
      rightPriceScale: { borderColor: "#2a382f" },
      timeScale: {
        borderColor: "#2a382f",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: (value: number) =>
          value.toLocaleString("en-US", {
            minimumFractionDigits: instrument?.precision ?? 2,
            maximumFractionDigits: instrument?.precision ?? 2,
          }),
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#87d4a4",
      downColor: "#ed927e",
      borderVisible: false,
      wickUpColor: "#87d4a4",
      wickDownColor: "#ed927e",
      priceLineColor: `${accent}88`,
    });
    candles.setData(history.candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [history, symbol]);

  return (
    <div className="market-chart-shell">
      {historyError ? (
        <div className="chart-state" role="status"><span className="chart-state-icon"><CircleHelpIcon /></span><span>{historyError}</span></div>
      ) : loading ? (
        <div className="chart-state" role="status"><span className="loading-mark" /><span>Chargement de l’historique fournisseur…</span></div>
      ) : (
        <div ref={chartContainerRef} className="market-chart" aria-label={`Chandeliers OHLC ${symbol}`} />
      )}
      {recentReadout && (
        <section className="market-readout" aria-label="Lecture automatique des dernières bougies">
          <div className="market-readout-heading"><strong>Lecture automatique</strong><span>{recentReadout.candleCount} dernières bougies · {history?.provider ?? "Fournisseur"}</span></div>
          <div className="market-readout-item"><span>Variation observée</span><strong className={recentReadout.change > 0 ? "positive" : recentReadout.change < 0 ? "negative" : ""}>{formatPercentage(recentReadout.change)}</strong></div>
          <div className="market-readout-item"><span>Amplitude haute/basse</span><strong>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(recentReadout.range)} %</strong></div>
          <p className="market-readout-foot">{recentReadout.direction} sur la fenêtre affichée. Observation calculée sur les cours reçus, pas un signal ni un conseil.</p>
        </section>
      )}
    </div>
  );
}

function CircleHelpIcon() {
  return <span aria-hidden="true">i</span>;
}

const instruments = [
  { symbol: "BTC/USD", accent: "#e8bc73", precision: 2 },
  { symbol: "ETH/USD", accent: "#99a9f2", precision: 2 },
  { symbol: "SOL/USD", accent: "#b5d98d", precision: 3 },
  { symbol: "XRP/USD", accent: "#8fc8cf", precision: 4 },
  { symbol: "EUR/USD", accent: "#86c2df", precision: 5 },
  { symbol: "GBP/USD", accent: "#c7a2d8", precision: 5 },
  { symbol: "XAU/USD", accent: "#e8bc73", precision: 2 },
] as const;