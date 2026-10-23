"use client";

import { appFetch } from "@/lib/app-fetch";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CompetitionItem = {
  slug: string;
  name: string;
  area: string;
  ready: boolean;
};

type CompetitionGroup = {
  title: string;
  items: CompetitionItem[];
};

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function FootballCatalog() {
  const [groups, setGroups] = useState<CompetitionGroup[]>([]);
  const [extras, setExtras] = useState<CompetitionGroup[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    appFetch("/api/football/competitions?scope=local")
      .then(async (response) => {
        if (!response.ok) throw new Error("liste indisponible");
        return response.json() as Promise<{ groups: CompetitionGroup[] }>;
      })
      .then((body) => {
        if (!cancelled) setGroups(body.groups);
      })
      .catch(() => {
        if (!cancelled) setError("La liste des championnats ne répond pas.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2 || extras) return;
    let cancelled = false;
    appFetch("/api/football/competitions")
      .then(async (response) => response.ok ? response.json() as Promise<{ groups: CompetitionGroup[] }> : { groups: [] })
      .then((body) => {
        if (!cancelled) setExtras(body.groups);
      })
      .catch(() => {
        if (!cancelled) setExtras([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query, extras]);

  const needle = fold(query.trim());
  const source = needle.length >= 2 && extras ? extras : groups;
  const visible = useMemo(() => {
    if (!needle) return source;
    return source
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => fold(`${item.name} ${item.area} ${group.title}`).includes(needle)),
      }))
      .filter((group) => group.items.length > 0);
  }, [source, needle]);

  return (
    <section className="football-catalog">
      <label className="form-label football-catalog-search">
        Championnat, coupe ou pays
        <input
          className="form-input football-text"
          value={query}
          placeholder="Premier League, Ligue 1, Euro…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {error ? <p className="football-error">{error}</p> : null}
      {!groups.length && !error ? <p className="risk-caption">Chargement des compétitions…</p> : null}
      {needle.length >= 2 && !extras ? <p className="risk-caption">Recherche dans les autres compétitions…</p> : null}
      {visible.map((group) => (
        <div key={group.title}>
          <h2 className="football-group-title">{group.title}</h2>
          <div className="football-cards">
            {group.items.map((item) => (
              <Link className="football-card" href={`/football/competition?slug=${encodeURIComponent(item.slug)}`} key={item.slug}>
                <strong>{item.name}</strong>
                <span>{item.area}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
