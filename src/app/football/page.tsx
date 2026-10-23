import { FootballBoard } from "@/components/football-board";
import { FootballMenu } from "@/components/football-menu";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function FootballPage() {
  return (
    <WorkspaceShell section="football">
      <main className="dashboard football-page">
        <FootballMenu />
        <div className="page-heading">
          <div>
            <p className="eyebrow">Matchs enregistrés</p>
            <h1 className="page-title">Analyse</h1>
            <p className="page-subtitle">
              Chaque ligne est un match. Ouvre-en un pour le remplir. Le pari et les championnats sont sur leurs propres pages.
            </p>
          </div>
        </div>
        <FootballBoard view="list" />
      </main>
    </WorkspaceShell>
  );
}
