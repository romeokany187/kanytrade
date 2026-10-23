import {
  Activity,
  BarChart3,
  BookOpenText,
  CandlestickChart,
  ChartNoAxesCombined,
  Compass,
  FileChartColumnIncreasing,
  Newspaper,
  Settings2,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const sections = [
  { id: "overview", label: "Vue d’ensemble", href: "/", icon: Compass },
  { id: "markets", label: "Marchés", href: "/markets", icon: CandlestickChart },
  { id: "news", label: "Actualités", href: "/news", icon: Newspaper },
  { id: "analysis", label: "Analyse", href: "/analysis", icon: ChartNoAxesCombined },
  { id: "strategies", label: "Stratégies", href: "/strategies", icon: FileChartColumnIncreasing },
  { id: "football", label: "Football", href: "/football", icon: Trophy },
  { id: "indicators", label: "Indicateurs", href: "/indicators", icon: BarChart3 },
  { id: "journal", label: "Journal", href: "/journal", icon: BookOpenText },
  { id: "settings", label: "Paramètres", href: "/settings", icon: Settings2 },
] as const;

interface WorkspaceShellProps {
  section: (typeof sections)[number]["id"];
  children: ReactNode;
  rightContent?: ReactNode;
}

export function WorkspaceShell({ section, children, rightContent }: WorkspaceShellProps) {
  const currentSection = sections.find((item) => item.id === section) ?? sections[0];

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navigation principale">
        <Link className="brand" href="/" aria-label="Kanytrade, accueil">
          <span className="brand-mark"><Activity size={18} strokeWidth={2.3} /></span>
          <span className="brand-name">KANY<span>TRADE</span></span>
        </Link>
        <p className="sidebar-label">Terminal de marché</p>
        <nav className="sidebar-links">
          {sections.map(({ id, label, href, icon: Icon }) => (
            <Link
              aria-current={section === id ? "page" : undefined}
              className={`sidebar-link ${section === id ? "active" : ""}`}
              href={href}
              key={id}
              title={label}
            >
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="access-note">
            <div className="access-note-title"><ShieldCheck size={14} /> Mode recherche</div>
            <p>Les données dépendent des accès de chaque fournisseur. Aucun ordre n’est envoyé.</p>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><Compass size={14} /><span>Marchés</span><span aria-hidden="true">/</span><span>{currentSection.label}</span></div>
          <div className="topbar-actions">
            {rightContent ?? <span className="source-tag"><ShieldCheck size={12} /> Lecture seule</span>}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
