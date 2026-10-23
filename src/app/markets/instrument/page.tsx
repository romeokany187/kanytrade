"use client";

import { MarketInstrumentDetail } from "@/components/market-instrument-detail";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function InstrumentScreen() {
  const params = useSearchParams();
  const symbol = params.get("symbol") ?? "";
  const name = params.get("name") || symbol;
  const exchange = params.get("exchange") ?? "";
  return (
    <WorkspaceShell section="markets">
      <MarketInstrumentDetail symbol={symbol} name={name} exchange={exchange} />
    </WorkspaceShell>
  );
}

export default function MarketInstrumentPage() {
  return (
    <Suspense fallback={<p className="risk-caption">Ouverture du marché…</p>}>
      <InstrumentScreen />
    </Suspense>
  );
}
