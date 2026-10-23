"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/football/championnats", label: "Championnats" },
  { href: "/football", label: "Analyse" },
  { href: "/football/pari", label: "Pari" },
  { href: "/football/archives", label: "Archives" },
];

export function FootballMenu() {
  const pathname = usePathname();
  return (
    <nav className="football-menu" aria-label="Football">
      {links.map((link) => {
        const inChampionship = pathname.startsWith("/football/competition");
        const active = link.href === "/football"
          ? pathname === "/football" || pathname.startsWith("/football/match")
          : link.href === "/football/championnats"
            ? pathname.startsWith("/football/championnats") || inChampionship
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link className={active ? "active" : ""} href={link.href} key={link.href} aria-current={active ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
