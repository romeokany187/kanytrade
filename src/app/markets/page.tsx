import { MarketExplorer } from "@/components/market-explorer";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function MarketsPage() {
  return <WorkspaceShell section="markets"><MarketExplorer /></WorkspaceShell>;
}