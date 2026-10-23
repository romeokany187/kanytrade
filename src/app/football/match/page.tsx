"use client";

import { FootballBoard } from "@/components/football-board";
import { FootballMenu } from "@/components/football-menu";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function MatchScreen() {
  const id = useSearchParams().get("id") ?? "";
  return (
    <WorkspaceShell section="football">
      <main className="dashboard football-page">
        <FootballMenu />
        <div className="page-heading">
          <div>
            <p className="eyebrow">Un match à la fois</p>
            <h1 className="page-title">Match</h1>
          </div>
        </div>
        <FootballBoard view="editor" matchId={id} />
      </main>
    </WorkspaceShell>
  );
}

export default function MatchPage() {
  return (
    <Suspense fallback={<p className="risk-caption">Ouverture du match…</p>}>
      <MatchScreen />
    </Suspense>
  );
}
