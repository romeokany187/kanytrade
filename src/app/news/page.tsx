import { NewsFeed } from "@/components/news-feed";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function NewsPage() {
  return <WorkspaceShell section="news"><NewsFeed /></WorkspaceShell>;
}