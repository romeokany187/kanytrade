import { FootballArchives } from "@/components/football-desk";
import { FootballMenu } from "@/components/football-menu";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function ArchivesPage() {
  return (
    <WorkspaceShell section="football">
      <main className="dashboard football-page">
        <FootballMenu />
        <div className="page-heading">
          <div>
            <p className="eyebrow">Résultats déjà joués</p>
            <h1 className="page-title">Archives</h1>
            <p className="page-subtitle">
              Le test sur les anciennes saisons, séparé de l’analyse du prochain match.
            </p>
          </div>
        </div>
        <FootballArchives />
      </main>
    </WorkspaceShell>
  );
}
