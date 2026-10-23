import { FootballBoard } from "@/components/football-board";
import { FootballMenu } from "@/components/football-menu";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function TicketPage() {
  return (
    <WorkspaceShell section="football">
      <main className="dashboard football-page">
        <FootballMenu />
        <div className="page-heading">
          <div>
            <p className="eyebrow">Francs congolais</p>
            <h1 className="page-title">Pari</h1>
            <p className="page-subtitle">
              Une phrase par match. Tu choisis une analyse, puis la mise se calcule sur l’argent du compte.
            </p>
          </div>
        </div>
        <FootballBoard view="ticket" />
      </main>
    </WorkspaceShell>
  );
}
