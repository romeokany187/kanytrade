import { ArrowUpRight, CircleHelp, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";

type ModuleSection = "analysis" | "strategies" | "indicators" | "journal" | "settings";

const content: Record<ModuleSection, {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  items: Array<{ title: string; detail: string; href?: string; label?: string }>;
}> = {
  analysis: {
    eyebrow: "Analyse fondée sur les données reçues",
    title: "Analyse de marché",
    description: "Les graphiques affichent les bougies historiques renvoyées par le fournisseur sélectionné. Une donnée absente n’est jamais remplacée par une estimation.",
    status: "Lecture seule · portée selon le fournisseur",
    items: [
      { title: "Graphiques et séries OHLC", detail: "Consultez les chandeliers disponibles et le relevé factuel des bougies récentes.", href: "/", label: "Ouvrir le tableau de bord" },
      { title: "Univers d’instruments", detail: "La disponibilité des historiques varie selon la place, le symbole et le forfait.", href: "/markets", label: "Explorer les marchés" },
    ],
  },
  strategies: {
    eyebrow: "Recherche systématique",
    title: "Stratégies",
    description: "Les stratégies et leurs résultats ne sont pas encore implémentés. Cette page ne présente aucune performance simulée ni promesse de rendement.",
    status: "Non activé · aucun ordre connecté",
    items: [
      { title: "Règles et paramètres", detail: "Aucun moteur de stratégie ou de backtest n’est configuré." },
      { title: "Validation", detail: "Une future simulation devra inclure frais, glissement, couverture historique et biais de survivance avant toute interprétation." },
      { title: "Exécution", detail: "L’envoi d’ordres reste désactivé et nécessitera une confirmation humaine explicite." },
    ],
  },
  indicators: {
    eyebrow: "Outils techniques",
    title: "Indicateurs",
    description: "Le relevé actuel décrit les bougies reçues. RSI, moyennes mobiles et autres indicateurs ne sont pas encore calculés dans cette version.",
    status: "Indicateurs techniques · à construire",
    items: [
      { title: "Données de base", detail: "Les séries OHLC sont disponibles depuis la fiche et le graphique des instruments pris en charge.", href: "/markets", label: "Choisir un instrument" },
      { title: "Fiabilité", detail: "Un indicateur sera affiché seulement lorsque la série d’entrée et la période de calcul sont disponibles." },
    ],
  },
  journal: {
    eyebrow: "Notes personnelles",
    title: "Journal de marché",
    description: "Les notes saisies dans le tableau de bord sont conservées dans le stockage local de cet appareil. Elles ne sont pas synchronisées vers un compte distant.",
    status: "Stockage local · non synchronisé",
    items: [
      { title: "Journal du tableau de bord", detail: "Ajoutez des notes et retrouvez-les dans la section Journal de la vue d’ensemble.", href: "/#journal", label: "Ouvrir le journal" },
      { title: "Confidentialité", detail: "Effacer les données du navigateur supprimera les notes locales enregistrées." },
    ],
  },
  settings: {
    eyebrow: "Connexions et préférences",
    title: "Paramètres des données",
    description: "Les identifiants restent côté serveur. Aucun paramètre ne dépend du pays de résidence de l’utilisateur.",
    status: "Configuration serveur · lecture seule",
    items: [
      { title: "Twelve Data", detail: "Configurez TWELVE_DATA_API_KEY dans l’environnement serveur pour les catalogues et les données soumises à quota." },
      { title: "Kraken Public API", detail: "Données publiques spot et historiques pour les paires prises en charge, sans connexion de compte." },
      { title: "Comptes de courtage", detail: "Aucun courtier connecté. Aucun ordre n’est préparé ni transmis." },
    ],
  },
};

export function WorkspaceModule({ section }: { section: ModuleSection }) {
  const page = content[section];

  return (
    <WorkspaceShell section={section}>
      <main className="dashboard module-page">
        <div className="page-heading"><div><p className="eyebrow">{page.eyebrow}</p><h1 className="page-title">{page.title}</h1><p className="page-subtitle">{page.description}</p></div></div>
        <div className="module-status"><CircleHelp size={15} /><span>{page.status}</span></div>
        <section className="module-list" aria-label={page.title}>
          {page.items.map((item) => <article className="module-row" key={item.title}>
            <div><h2>{item.title}</h2><p>{item.detail}</p></div>
            {item.href && item.label && <Link className="module-link" href={item.href}>{item.label}<ArrowUpRight size={14} /></Link>}
          </article>)}
        </section>
        <footer className="module-footer"><ShieldCheck size={14} /><span>Les fonctionnalités indisponibles sont signalées comme telles. Les flux ne déclenchent aucun ordre.</span></footer>
      </main>
    </WorkspaceShell>
  );
}

export function modulePage(section: ModuleSection): ReactNode {
  return <WorkspaceModule section={section} />;
}