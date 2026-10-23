"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { appFetch } from "@/lib/app-fetch";
import { readMatch } from "@/lib/football-model";

type FormState = {
  homeName: string;
  awayName: string;
  homePlayer: string;
  awayPlayer: string;
  homeAttack: string;
  homeDefense: string;
  awayAttack: string;
  awayDefense: string;
  leagueGoals: string;
  oddsHome: string;
  oddsDraw: string;
  oddsAway: string;
  oddsOver25: string;
  bankroll: string;
};

type SquadTeam = {
  name: string;
  query: string;
  aliases: string[];
  attack: number | null;
  defense: number | null;
  leagueGoals: number | null;
  played: number;
};

type SquadBody = {
  slug: string;
  name: string;
  area: string;
  group: string;
  remoteSearch: boolean;
  teams: SquadTeam[];
  error?: string;
};

type Suggestion = {
  label: string;
  value: string;
  detail: string;
  query: string;
  team?: SquadTeam;
};

type Player = { name: string; position: string };

const blank: FormState = {
  homeName: "",
  awayName: "",
  homePlayer: "",
  awayPlayer: "",
  homeAttack: "",
  homeDefense: "",
  awayAttack: "",
  awayDefense: "",
  leagueGoals: "",
  oddsHome: "",
  oddsDraw: "",
  oddsAway: "",
  oddsOver25: "",
  bankroll: "100",
};

function parseNumber(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)} %`;
}

function money(value: number) {
  return `${value.toFixed(2)} €`;
}

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function teamSuggestions(teams: SquadTeam[], query: string): Suggestion[] {
  const needle = fold(query.trim());
  const ranked = teams
    .map((team) => {
      const haystack = [team.name, team.query, ...team.aliases].map(fold);
      const index = needle ? haystack.map((value) => value.indexOf(needle)).filter((value) => value >= 0) : [0];
      return { team, rank: index.length ? Math.min(...index) : -1 };
    })
    .filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.team.name.localeCompare(b.team.name, "fr"))
    .slice(0, 8);
  return ranked.map(({ team }) => ({
    label: team.name,
    value: team.name,
    query: team.query,
    detail: team.played
      ? `${team.attack?.toFixed(2) ?? "–"} buts, ${team.defense?.toFixed(2) ?? "–"} encaissés`
      : "",
    team,
  }));
}

export function FootballDesk({ slug }: { slug: string }) {
  const [form, setForm] = useState<FormState>(blank);
  const [squad, setSquad] = useState<SquadBody | null>(null);
  const [squadError, setSquadError] = useState("");
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [leagueRates, setLeagueRates] = useState<{ home: number | null; away: number | null }>({ home: null, away: null });

  useEffect(() => {
    let cancelled = false;
    appFetch(`/api/football/competitions/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const body = await response.json() as SquadBody;
        if (!response.ok) throw new Error(body.error || "introuvable");
        return body;
      })
      .then((body) => {
        if (!cancelled) setSquad(body);
      })
      .catch(() => {
        if (!cancelled) setSquadError("Ce championnat ne répond pas.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const reading = useMemo(() => {
    const required = [
      form.homeAttack,
      form.homeDefense,
      form.awayAttack,
      form.awayDefense,
      form.leagueGoals,
      form.oddsHome,
      form.oddsDraw,
      form.oddsAway,
      form.bankroll,
    ];
    if (required.some((value) => !value.trim())) return { error: "", read: null };
    const homeAttack = parseNumber(form.homeAttack);
    const homeDefense = parseNumber(form.homeDefense);
    const awayAttack = parseNumber(form.awayAttack);
    const awayDefense = parseNumber(form.awayDefense);
    const leagueGoals = parseNumber(form.leagueGoals);
    const oddsHome = parseNumber(form.oddsHome);
    const oddsDraw = parseNumber(form.oddsDraw);
    const oddsAway = parseNumber(form.oddsAway);
    const overRaw = form.oddsOver25.trim();
    const oddsOver25 = overRaw ? parseNumber(overRaw) : null;
    const bankroll = parseNumber(form.bankroll);
    const numbers = [homeAttack, homeDefense, awayAttack, awayDefense, leagueGoals, oddsHome, oddsDraw, oddsAway, bankroll];
    if (numbers.some((value) => Number.isNaN(value) || value < 0)) return { error: "Remplis les cases avec des nombres.", read: null };
    if (oddsHome <= 1 || oddsDraw <= 1 || oddsAway <= 1 || (oddsOver25 !== null && oddsOver25 <= 1)) {
      return { error: "Une cote décimale doit être supérieure à 1.", read: null };
    }
    if (bankroll <= 0) return { error: "La bankroll doit être supérieure à 0.", read: null };
    return {
      error: "",
      read: readMatch({
        homeAttack,
        homeDefense,
        awayAttack,
        awayDefense,
        leagueGoals,
        oddsHome,
        oddsDraw,
        oddsAway,
        oddsOver25,
        bankroll,
      }),
    };
  }, [form]);

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function loadPlayers(side: "home" | "away", query: string) {
    const response = await appFetch(`/api/football/team?name=${encodeURIComponent(query)}`);
    if (!response.ok) {
      if (side === "home") setHomePlayers([]);
      else setAwayPlayers([]);
      return;
    }
    const body = await response.json() as { players?: Player[] };
    if (side === "home") setHomePlayers(body.players ?? []);
    else setAwayPlayers(body.players ?? []);
  }

  function chooseTeam(side: "home" | "away", suggestion: Suggestion) {
    const attack = suggestion.team?.attack;
    const defense = suggestion.team?.defense;
    const league = suggestion.team?.leagueGoals ?? null;
    const nextRates = { ...leagueRates, [side]: league };
    const knownRates = [nextRates.home, nextRates.away].filter((value): value is number => value != null);
    const leagueGoals = knownRates.length
      ? (knownRates.reduce((sum, value) => sum + value, 0) / knownRates.length).toFixed(2)
      : null;
    setLeagueRates(nextRates);
    setForm((current) => ({
      ...current,
      [side === "home" ? "homeName" : "awayName"]: suggestion.value,
      [side === "home" ? "homeAttack" : "awayAttack"]: attack == null ? current[side === "home" ? "homeAttack" : "awayAttack"] : attack.toFixed(2),
      [side === "home" ? "homeDefense" : "awayDefense"]: defense == null ? current[side === "home" ? "homeDefense" : "awayDefense"] : defense.toFixed(2),
      leagueGoals: leagueGoals ?? current.leagueGoals,
    }));
    void loadPlayers(side, suggestion.query || suggestion.value);
  }

  function choosePlayer(side: "home" | "away", suggestion: Suggestion) {
    update(side === "home" ? "homePlayer" : "awayPlayer", suggestion.value);
    const club = suggestion.query;
    const known = squad?.teams.find((team) => fold(team.name) === fold(club) || fold(team.query) === fold(club));
    const currentName = side === "home" ? form.homeName : form.awayName;
    if (known && !currentName.trim()) chooseTeam(side, teamSuggestions([known], known.name)[0]);
    else if (!currentName.trim() && club && club !== suggestion.value) {
      chooseTeam(side, { label: club, value: club, detail: "", query: club });
    }
  }

  const read = reading.error ? null : reading.read;
  const teamCount = squad?.teams.length ?? 0;

  return (
    <main className="dashboard football-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{squad ? `${squad.group} · ${squad.area}` : "Compétition"}</p>
          <h1 className="page-title">{squad?.name ?? "Football"}</h1>
          <p className="page-subtitle">
            <Link className="football-back" href="/football">Tous les championnats</Link>
            {teamCount
              ? ` ${teamCount.toLocaleString("fr-FR")} équipes déjà chargées. Tape le club, ou le joueur dans son champ.`
              : " Tape le club ou le joueur : la liste se complète dans le champ."}
          </p>
        </div>
      </div>

      {squadError ? <p className="football-error">{squadError}</p> : null}

      <section className="football-grid">
        <form className="panel" onSubmit={(event) => event.preventDefault()}>
          <div className="panel-body">
            <div className="football-teams">
              <SideFields
                title="Domicile"
                team={form.homeName}
                player={form.homePlayer}
                attack={form.homeAttack}
                defense={form.homeDefense}
                teams={squad?.teams ?? []}
                players={homePlayers}
                remote={Boolean(squad?.remoteSearch) || teamCount === 0}
                onTeam={(value) => update("homeName", value)}
                onPlayer={(value) => update("homePlayer", value)}
                onAttack={(value) => update("homeAttack", value)}
                onDefense={(value) => update("homeDefense", value)}
                onChooseTeam={(suggestion) => chooseTeam("home", suggestion)}
                onChoosePlayer={(suggestion) => choosePlayer("home", suggestion)}
              />
              <SideFields
                title="Extérieur"
                team={form.awayName}
                player={form.awayPlayer}
                attack={form.awayAttack}
                defense={form.awayDefense}
                teams={squad?.teams ?? []}
                players={awayPlayers}
                remote={Boolean(squad?.remoteSearch) || teamCount === 0}
                onTeam={(value) => update("awayName", value)}
                onPlayer={(value) => update("awayPlayer", value)}
                onAttack={(value) => update("awayAttack", value)}
                onDefense={(value) => update("awayDefense", value)}
                onChooseTeam={(suggestion) => chooseTeam("away", suggestion)}
                onChoosePlayer={(suggestion) => choosePlayer("away", suggestion)}
              />
            </div>
            <div className="risk-fields football-odds">
              <NumberField label="Cote 1" value={form.oddsHome} onChange={(value) => update("oddsHome", value)} />
              <NumberField label="Cote nul" value={form.oddsDraw} onChange={(value) => update("oddsDraw", value)} />
              <NumberField label="Cote 2" value={form.oddsAway} onChange={(value) => update("oddsAway", value)} />
              <NumberField label="Cote +2,5 buts" value={form.oddsOver25} onChange={(value) => update("oddsOver25", value)} />
              <NumberField label="Buts moyens du championnat" value={form.leagueGoals} onChange={(value) => update("leagueGoals", value)} />
              <NumberField label="Bankroll €" value={form.bankroll} onChange={(value) => update("bankroll", value)} />
            </div>
            {reading.error ? <p className="football-error">{reading.error}</p> : null}
            <p className="risk-caption">
              Les buts marqués et encaissés se remplissent avec les 8 derniers matchs quand les archives existent. Une cote vide pour +2,5 ignore ce marché. Aucun pari n’est envoyé.
            </p>
          </div>
        </form>

        <aside className="panel">
          <div className="panel-body">
            <p className="panel-kicker">Décision</p>
            {read?.decision ? (
              <div className="risk-result">
                <div>
                  <div className="risk-result-label">{form.homeName || "Domicile"} – {form.awayName || "Extérieur"}</div>
                  <div className="risk-result-value">{read.decision.market.label}</div>
                </div>
                <div className="risk-result-side">
                  <div className="risk-result-label">Mise max</div>
                  <div className="risk-result-value">{money(read.decision.stake)}</div>
                </div>
              </div>
            ) : (
              <div className="risk-result">
                <div>
                  <div className="risk-result-label">Décision</div>
                  <div className="risk-result-value">Passer</div>
                </div>
              </div>
            )}
            <p className="risk-caption">
              {read?.decision
                ? `Avantage estimé ${percent(read.decision.market.edge)} contre la cote ${read.decision.market.odds.toFixed(2)}. La mise reste sous ${percent(read.decision.stakePercent)} de la bankroll.`
                : "Choisis les deux équipes, puis entre les cotes. La mise n’apparaît que si l’écart est assez grand."}
            </p>
            {read ? (
              <>
                <p className="football-expect">
                  Buts estimés : {read.expectedHome.toFixed(2)} – {read.expectedAway.toFixed(2)}. Score le plus probable : {read.scorelines[0]?.home}-{read.scorelines[0]?.away}.
                </p>
                <ul className="football-markets">
                  {read.markets.map((item) => (
                    <li key={item.id}>
                      <span>{item.label}</span>
                      <span>{percent(item.probability)}</span>
                      <span className={item.edge >= 0.03 ? "positive" : ""}>{item.edge >= 0 ? "+" : ""}{percent(item.edge)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}

function SideFields({
  title,
  team,
  player,
  attack,
  defense,
  teams,
  players,
  remote,
  onTeam,
  onPlayer,
  onAttack,
  onDefense,
  onChooseTeam,
  onChoosePlayer,
}: {
  title: string;
  team: string;
  player: string;
  attack: string;
  defense: string;
  teams: SquadTeam[];
  players: Player[];
  remote: boolean;
  onTeam: (value: string) => void;
  onPlayer: (value: string) => void;
  onAttack: (value: string) => void;
  onDefense: (value: string) => void;
  onChooseTeam: (suggestion: Suggestion) => void;
  onChoosePlayer: (suggestion: Suggestion) => void;
}) {
  const playerOptions = players
    .filter((item) => !player.trim() || fold(item.name).includes(fold(player)))
    .map((item) => ({
      label: item.name,
      value: item.name,
      detail: item.position,
      query: team,
    }));
  const clubOptions = teamSuggestions(teams, team);

  return (
    <div>
      <p className="panel-title">{title}</p>
      <SuggestField
        label="Équipe"
        value={team}
        options={clubOptions}
        remoteKind={(remote || clubOptions.length === 0) && team.trim().length >= 2 ? "team" : undefined}
        onChange={onTeam}
        onPick={onChooseTeam}
      />
      <SuggestField
        label="Joueur"
        value={player}
        options={playerOptions}
        remoteKind={player.trim().length >= 2 && playerOptions.length === 0 ? "player" : undefined}
        onChange={onPlayer}
        onPick={onChoosePlayer}
      />
      <div className="risk-fields">
        <NumberField label="Buts marqués / match" value={attack} onChange={onAttack} />
        <NumberField label="Buts encaissés / match" value={defense} onChange={onDefense} />
      </div>
    </div>
  );
}

function SuggestField({
  label,
  value,
  options,
  remoteKind,
  onChange,
  onPick,
}: {
  label: string;
  value: string;
  options: Suggestion[];
  remoteKind?: "team" | "player";
  onChange: (value: string) => void;
  onPick: (suggestion: Suggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!remoteKind || value.trim().length < 2) {
      setRemoteOptions([]);
      return;
    }
    const handle = setTimeout(() => {
      appFetch(`/api/football/suggest?kind=${remoteKind}&q=${encodeURIComponent(value.trim())}`)
        .then(async (response) => response.ok ? response.json() as Promise<{ suggestions: Suggestion[] }> : { suggestions: [] })
        .then((body) => setRemoteOptions(body.suggestions))
        .catch(() => setRemoteOptions([]));
    }, 280);
    return () => clearTimeout(handle);
  }, [remoteKind, value]);

  const seen = new Set<string>();
  const suggestions = [...options, ...remoteOptions].filter((item) => {
    const key = fold(item.value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);

  return (
    <label className="form-label suggest">
      {label}
      <input
        className="form-input football-text"
        autoComplete="off"
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && suggestions[0]) {
            event.preventDefault();
            onPick(suggestions[0]);
            setOpen(false);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && suggestions.length ? (
        <ul className="suggest-list">
          {suggestions.map((item) => (
            <li key={`${item.value}-${item.detail}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(item);
                  setOpen(false);
                }}
              >
                <strong>{item.label}</strong>
                {item.detail ? <span>{item.detail}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  );
}

type BacktestBody = {
  source: string;
  odds: string;
  seasons: string[];
  leagues: string[];
  matches: number;
  priced: number;
  bets: number;
  wins: number;
  yield: number;
  calibration: Array<{ label: string; count: number; predicted: number; actual: number }>;
};

type TeamBody = {
  team: string;
  league: string;
  country: string;
  nextMatch: { name: string; date: string; time: string; venue: string } | null;
  players: Array<{ name: string; position: string }>;
  error?: string;
};

export function FootballArchives() {
  const [record, setRecord] = useState<BacktestBody | null>(null);
  const [recordError, setRecordError] = useState("");
  const [query, setQuery] = useState("Arsenal");
  const [team, setTeam] = useState<TeamBody | null>(null);
  const [teamError, setTeamError] = useState("");

  useEffect(() => {
    let cancelled = false;
    appFetch("/api/football/backtest")
      .then(async (response) => {
        if (!response.ok) throw new Error("Essai indisponible");
        return response.json() as Promise<BacktestBody>;
      })
      .then((body) => {
        if (!cancelled) setRecord(body);
      })
      .catch(() => {
        if (!cancelled) setRecordError("Les archives des matchs ne répondent pas.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function searchTeam() {
    setTeamError("");
    setTeam(null);
    const response = await appFetch(`/api/football/team?name=${encodeURIComponent(query)}`);
    const body = await response.json() as TeamBody;
    if (!response.ok) {
      setTeamError(body.error ?? "Équipe introuvable.");
      return;
    }
    setTeam(body);
  }

  return (
    <section className="football-record">
      <div className="panel">
        <div className="panel-body">
          <p className="panel-kicker">Archives réelles</p>
          <h2 className="panel-title">Essai sur d’anciens matchs</h2>
          {recordError ? <p className="football-error">{recordError}</p> : null}
          {!record && !recordError ? <p className="risk-caption">Lecture des résultats et des cotes…</p> : null}
          {record ? (
            <>
              <p className="football-expect">
                {record.matches.toLocaleString("fr-FR")} matchs, {record.leagues.join(", ")}, saisons {record.seasons.join(", ")}. Source {record.source}. {record.odds}.
              </p>
              <div className="risk-result">
                <div>
                  <div className="risk-result-label">Paris joués par la règle</div>
                  <div className="risk-result-value">{record.bets.toLocaleString("fr-FR")}</div>
                </div>
                <div className="risk-result-side">
                  <div className="risk-result-label">Rendement</div>
                  <div className="risk-result-value">{percent(record.yield)}</div>
                </div>
              </div>
              <p className="risk-caption">
                {record.wins.toLocaleString("fr-FR")} paris gagnés sur {record.priced.toLocaleString("fr-FR")} matchs cotés. Le rendement est négatif face aux cotes de clôture : ce modèle ne bat pas les bookmakers.
              </p>
              <ul className="football-markets">
                {record.calibration.map((bucket) => (
                  <li key={bucket.label}>
                    <span>Domicile estimé {bucket.label}</span>
                    <span>prédit {percent(bucket.predicted)}</span>
                    <span>réel {percent(bucket.actual)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
      <div className="panel">
        <div className="panel-body">
          <p className="panel-kicker">Équipes et joueurs</p>
          <h2 className="panel-title">Prochain match</h2>
          <label className="form-label">
            Équipe
            <input className="form-input football-text" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="football-search" type="button" onClick={() => void searchTeam()}>Chercher</button>
          {teamError ? <p className="football-error">{teamError}</p> : null}
          {team ? (
            <>
              <p className="football-expect">{team.team}, {team.league}, {team.country}</p>
              <p className="football-expect">
                {team.nextMatch
                  ? `${team.nextMatch.name}, ${team.nextMatch.date} ${team.nextMatch.time || ""}, ${team.nextMatch.venue}`
                  : "Aucun prochain match publié."}
              </p>
              <ul className="football-markets">
                {team.players.map((player) => (
                  <li key={player.name}>
                    <span>{player.name}</span>
                    <span>{player.position}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="risk-caption">Fiches d’équipes via TheSportsDB, une base gratuite. Les joueurs n’entrent pas dans le calcul du score : les archives gratuites n’ont pas leur historique match par match.</p>
        </div>
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-label">
      {label}
      <input className="form-input" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
