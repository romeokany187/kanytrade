"use client";

import { FootballBoard } from "@/components/football-board";
import { FootballMenu } from "@/components/football-menu";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CompetitionScreen() {
  const slug = useSearchParams().get("slug") ?? "";
  return (
    <WorkspaceShell section="football">
      <main className="dashboard football-page">
        <FootballMenu />
        <FootballBoard view="competition" focusSlug={slug} />
      </main>
    </WorkspaceShell>
  );
}

export default function CompetitionPage() {
  return (
    <Suspense fallback={<p className="risk-caption">Ouverture du championnat…</p>}>
      <CompetitionScreen />
    </Suspense>
  );
}
