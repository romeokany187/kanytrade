"use client";

import { appFetch } from "@/lib/app-fetch";
import { useEffect, useState } from "react";

export type DayFixture = {
  id: string;
  kickoff: string;
  status: "scheduled" | "live" | "finished";
  label: string;
  home: string;
  away: string;
  homeScore: string | null;
  awayScore: string | null;
  homeAttack: string;
  homeDefense: string;
  awayAttack: string;
  awayDefense: string;
  leagueGoals: string;
  homeLeague: string;
  awayLeague: string;
  firstHalfShare: string;
  ready: boolean;
};

function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shift(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

function dayLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function kickoffLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function FootballFixtures({
  slug,
  knownIds,
  onAnalyze,
}: {
  slug: string;
  knownIds: string[];
  onAnalyze: (fixture: DayFixture) => void;
}) {
  const [date, setDate] = useState(localDate());
  const [seek, setSeek] = useState(true);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [fixtures, setFixtures] = useState<DayFixture[]>([]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const params = new URLSearchParams({ slug, date, seek: seek ? "1" : "0" });
    appFetch(`/api/football/fixtures?${params}`)
      .then((response) => response.json() as Promise<{ date?: string; available?: boolean; fixtures?: DayFixture[] }>)
      .then((body) => {
        if (cancel) return;
        if (body.date && body.date !== date) setDate(body.date);
        setAvailable(body.available !== false);
        setFixtures(body.fixtures ?? []);
        setSeek(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancel) return;
        setFixtures([]);
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [slug, date, seek]);

  return (
    <section className="football-fixtures">
      <div className="football-day">
        <div>
          <p className="eyebrow">Calendrier</p>
          <h2>{dayLabel(date)}</h2>
        </div>
        <div className="football-day-controls">
          <button type="button" onClick={() => { setSeek(false); setDate(shift(date, -1)); }}>Jour précédent</button>
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setSeek(false);
              setDate(event.target.value);
            }}
          />
          <button type="button" onClick={() => { setSeek(false); setDate(shift(date, 1)); }}>Jour suivant</button>
        </div>
      </div>
      <p className="risk-caption">
        Un clic prépare l’analyse avec les équipes, les moyennes de buts et les cotes Winner. La phrase en bas dit le pari à prendre.
      </p>
      {loading ? <p className="risk-caption">Lecture des matchs…</p> : null}
      {!loading && !available ? (
        <p className="risk-caption">Le calendrier public de cette compétition n’est pas disponible.</p>
      ) : null}
      {!loading && available && fixtures.length === 0 ? (
        <p className="risk-caption">Aucun match publié pour cette date.</p>
      ) : null}
      {fixtures.length ? (
        <ul className="football-rows">
          {fixtures.map((fixture) => {
            const opened = knownIds.includes(fixture.id);
            const score = fixture.homeScore != null && fixture.awayScore != null
              ? `${fixture.homeScore} – ${fixture.awayScore}`
              : kickoffLabel(fixture.kickoff);
            return (
              <li key={fixture.id}>
                <div>
                  <strong>{fixture.home} – {fixture.away}</strong>
                  <span>
                    {fixture.label} · {score}
                    {fixture.ready ? ` · moyennes ${fixture.leagueGoals} buts / équipe` : " · moyennes à compléter"}
                  </span>
                </div>
                <button className="football-search" type="button" onClick={() => onAnalyze(fixture)}>
                  {opened ? "Ouvrir" : "Analyser"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
