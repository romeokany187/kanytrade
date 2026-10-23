import { FootballCatalog } from "@/components/football-catalog";
import { FootballMenu } from "@/components/football-menu";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function ChampionshipsPage() {
  return (
    <WorkspaceShell section="football">
      <main className="dashboard football-page">
        <FootballMenu />
        <div className="page-heading">
          <div>
            <p className="eyebrow">Où se joue le match</p>
            <h1 className="page-title">Championnats</h1>
            <p className="page-subtitle">
              Choisis une compétition. Tu prépares ensuite un match à la fois, sans revoir toute l’analyse sur cette page.
            </p>
          </div>
        </div>
        <FootballCatalog />
      </main>
    </WorkspaceShell>
  );
}
