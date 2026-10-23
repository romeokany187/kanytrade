"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { appFetch } from "@/lib/app-fetch";
import { blankMatch, loadAnalysis, saveAnalysis, type AnalysisMatch, type AnalysisState } from "@/lib/football-analysis";
import { FootballFixtures, type DayFixture } from "@/components/football-fixtures";
import { betPhrase, betProposal, readMatch, readTicket, type MarketId, type TicketLeg, type TicketRead } from "@/lib/football-model";
import type { WinnerOdds } from "@/lib/winner-odds";

type SquadTeam = {
  name: string;
  query: string;
  aliases: string[];
  attack: number | null;
  defense: number | null;
  leagueGoals: number | null;
  firstHalfShare: number | null;
  played: number;
};

type SquadBody = {
  slug: string;
  name: string;
  area: string;
  group: string;
  remoteSearch: boolean;
  teams: SquadTeam[];
};

type CompetitionItem = { slug: string; name: string; area: string };
type CompetitionGroup = { title: string; items: CompetitionItem[] };

type Suggestion = {
  label: string;
  value: string;
  detail: string;
  query: string;
  team?: SquadTeam;
};

function parseNumber(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)} %`;
}

const pickOrder: MarketId[] = ["halfFirst", "halfEqual", "halfSecond", "half1x", "half12", "halfx2", "over25", "under25", "home", "draw", "away", "dc1x", "dc12", "dcx2", "btts", "bttsNo"];

function money(value: number) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(value))} FC`;
}

function stakeAdvice(account: number, read: TicketRead | null) {
  if (!read) return "Choisis une analyse sur chaque match du pari.";
  const cash = money(account);
  if (read.take) return `Sur les ${cash} du compte, mise environ ${money(read.stake)} sur ce pari.`;
  if (read.stake >= 1) return `Sur les ${cash} du compte, je te propose de passer. Si tu joues quand même, reste sous ${money(read.stake)}.`;
  return `Sur les ${cash} du compte, je te propose de passer.`;
}

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function teamSuggestions(teams: SquadTeam[], query: string): Suggestion[] {
  const needle = fold(query.trim());
  return teams
    .map((team) => {
      const haystack = [team.name, team.query, ...team.aliases].map(fold);
      const hits = needle ? haystack.map((value) => value.indexOf(needle)).filter((value) => value >= 0) : [0];
      return { team, rank: hits.length ? Math.min(...hits) : -1 };
    })
    .filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.team.name.localeCompare(b.team.name, "fr"))
    .slice(0, 8)
    .map(({ team }) => ({
      label: team.name,
      value: team.name,
      query: team.query,
      detail: team.played ? `${team.attack?.toFixed(2) ?? "–"} buts, ${team.defense?.toFixed(2) ?? "–"} encaissés` : "",
      team,
    }));
}

function optionalOdd(raw: string | undefined) {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const value = parseNumber(text);
  return Number.isNaN(value) || value <= 1 ? Number.NaN : value;
}

function positiveRate(raw: string | undefined) {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const value = parseNumber(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function shownRate(raw: string) {
  return raw.trim().replace(".", ",") || "–";
}

function sameMeasuredLeague(match: AnalysisMatch) {
  return positiveRate(match.homeLeague) != null && positiveRate(match.awayLeague) != null;
}

function unmatchedLeagueSentence(match: AnalysisMatch) {
  const home = match.homeName.trim() || "L’équipe à domicile";
  const away = match.awayName.trim() || "l’équipe à l’extérieur";
  return `Pour ce match, je te propose de passer. ${home} marque ${shownRate(match.homeAttack)} et encaisse ${shownRate(match.homeDefense)} par match, ${away} marque ${shownRate(match.awayAttack)} et encaisse ${shownRate(match.awayDefense)}. Ces moyennes viennent de championnats différents.`;
}

function readOne(match: AnalysisMatch) {
  const rates = [match.homeAttack, match.homeDefense, match.awayAttack, match.awayDefense];
  if (rates.some((value) => !value.trim())) return null;
  const homeAttack = parseNumber(match.homeAttack);
  const homeDefense = parseNumber(match.homeDefense);
  const awayAttack = parseNumber(match.awayAttack);
  const awayDefense = parseNumber(match.awayDefense);
  const leagueText = match.leagueGoals.trim();
  const leagueGoals = leagueText ? parseNumber(leagueText) : (homeAttack + awayAttack) / 2;
  const numbers = [homeAttack, homeDefense, awayAttack, awayDefense, leagueGoals];
  if (numbers.some((value) => Number.isNaN(value) || value <= 0)) return null;
  const odds = {
    oddsHome: optionalOdd(match.oddsHome),
    oddsDraw: optionalOdd(match.oddsDraw),
    oddsAway: optionalOdd(match.oddsAway),
    oddsOver25: optionalOdd(match.oddsOver25),
    oddsUnder25: optionalOdd(match.oddsUnder25),
    oddsDouble1X: optionalOdd(match.oddsDouble1X),
    oddsDouble12: optionalOdd(match.oddsDouble12),
    oddsDoubleX2: optionalOdd(match.oddsDoubleX2),
    oddsBothScore: optionalOdd(match.oddsBothScore),
    oddsNotBoth: optionalOdd(match.oddsNotBoth),
    oddsHalfFirst: optionalOdd(match.oddsHalfFirst),
    oddsHalfEqual: optionalOdd(match.oddsHalfEqual),
    oddsHalfSecond: optionalOdd(match.oddsHalfSecond),
    oddsHalf1X: optionalOdd(match.oddsHalf1X),
    oddsHalf12: optionalOdd(match.oddsHalf12),
    oddsHalfX2: optionalOdd(match.oddsHalfX2),
  };
  if (Object.values(odds).some((value) => Number.isNaN(value))) return null;
  const shareText = (match.firstHalfShare ?? "").trim();
  const share = shareText ? parseNumber(shareText) : null;
  if (shareText && (share == null || Number.isNaN(share) || share <= 0 || share >= 1)) return null;
  const reading = readMatch({
    homeAttack,
    homeDefense,
    awayAttack,
    awayDefense,
    leagueGoals,
    firstHalfShare: share,
    ...odds,
    bankroll: 1,
  });
  if (!sameMeasuredLeague(match)) {
    for (const item of reading.markets) item.worth = false;
    reading.decision = null;
  }
  return reading;
}

export function FootballBoard({
  view = "list",
  focusSlug = "",
  matchId = "",
}: {
  view?: "list" | "ticket" | "editor" | "competition";
  focusSlug?: string;
  matchId?: string;
}) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [groups, setGroups] = useState<CompetitionGroup[]>([]);
  const [squads, setSquads] = useState<Record<string, SquadBody>>({});
  useEffect(() => {
    setAnalysis(loadAnalysis());
  }, []);

  useEffect(() => {
    if (!analysis) return;
    saveAnalysis(analysis);
  }, [analysis]);

  useEffect(() => {
    appFetch("/api/football/competitions?scope=local")
      .then(async (response) => response.ok ? response.json() as Promise<{ groups: CompetitionGroup[] }> : { groups: [] })
      .then((body) => setGroups(body.groups))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    if (!analysis) return;
    const missing = [...new Set(analysis.matches.map((match) => match.competitionSlug).filter(Boolean))]
      .filter((slug) => !squads[slug]);
    if (!missing.length) return;
    let cancelled = false;
    for (const slug of missing) {
      appFetch(`/api/football/competitions/${encodeURIComponent(slug)}`)
        .then(async (response) => response.ok ? response.json() as Promise<SquadBody> : null)
        .then((body) => {
          if (!cancelled && body) {
            setSquads((current) => ({ ...current, [slug]: body }));
            const share = body.teams.find((team) => team.firstHalfShare != null)?.firstHalfShare;
            setAnalysis((current) => current && ({
              ...current,
              matches: current.matches.map((match) => (
                match.competitionSlug === slug
                  ? {
                      ...match,
                      competitionName: match.competitionName || body.name,
                      firstHalfShare: match.firstHalfShare || (share == null ? "" : String(share)),
                    }
                  : match
              )),
            }));
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [analysis, squads]);

  const bankroll = parseNumber(analysis?.bankroll ?? "");
  const ticket = useMemo(() => {
    if (!analysis || !Number.isFinite(bankroll) || bankroll <= 0) return null;
    const legs: TicketLeg[] = [];
    for (const match of analysis.matches) {
      if (!match.included || !match.pick) continue;
      const reading = readOne(match);
      const market = reading?.markets.find((item) => item.id === match.pick);
      if (!market) continue;
      const home = match.homeName || "Domicile";
      const away = match.awayName || "Extérieur";
      legs.push({
        label: `${home} – ${away} : ${betPhrase(market.id)}`,
        probability: market.probability,
        odds: market.odds,
        worth: market.worth,
      });
    }
    return { legs, read: readTicket(legs, bankroll) };
  }, [analysis, bankroll]);

  function updateMatch(id: string, patch: Partial<AnalysisMatch>) {
    setAnalysis((current) => current && ({
      ...current,
      matches: current.matches.map((match) => match.id === id ? { ...match, ...patch } : match),
    }));
  }

  function openFixture(fixture: DayFixture) {
    if (!analysis) return;
    const existing = analysis.matches.find((match) =>
      match.competitionSlug === focusSlug && (
        (fixture.id && match.fixtureId === fixture.id)
        || (fold(match.homeName) === fold(fixture.home) && fold(match.awayName) === fold(fixture.away))
      ),
    );
    if (existing) {
      router.push(`/football/match?id=${encodeURIComponent(existing.id)}`);
      return;
    }
    const match = blankMatch(focusSlug);
    match.fixtureId = fixture.id;
    match.competitionName = focus?.name ?? "";
    match.homeName = fixture.home;
    match.awayName = fixture.away;
    match.homeAttack = fixture.homeAttack;
    match.homeDefense = fixture.homeDefense;
    match.awayAttack = fixture.awayAttack;
    match.awayDefense = fixture.awayDefense;
    match.leagueGoals = fixture.leagueGoals;
    match.firstHalfShare = fixture.firstHalfShare;
    match.homeLeague = fixture.homeLeague;
    match.awayLeague = fixture.awayLeague;
    const next = { ...analysis, matches: [...analysis.matches, match] };
    saveAnalysis(next);
    setAnalysis(next);
    router.push(`/football/match?id=${encodeURIComponent(match.id)}`);
  }

  function createMatch(slug = focusSlug) {
    if (!analysis) return;
    const match = blankMatch(slug);
    const next = { ...analysis, matches: [...analysis.matches, match] };
    saveAnalysis(next);
    setAnalysis(next);
    router.push(`/football/match?id=${encodeURIComponent(match.id)}`);
  }

  function removeMatch(id: string) {
    if (!analysis) return;
    const next = { ...analysis, matches: analysis.matches.filter((match) => match.id !== id) };
    saveAnalysis(next);
    setAnalysis(next);
  }

  function chooseTeam(match: AnalysisMatch, side: "home" | "away", suggestion: Suggestion) {
    const attack = suggestion.team?.attack;
    const defense = suggestion.team?.defense;
    const league = suggestion.team?.leagueGoals;
    const share = suggestion.team?.firstHalfShare;
    const stored = (value: string) => {
      if (!value.trim()) return null;
      const parsed = parseNumber(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const homeLeague = side === "home" ? league : stored(match.homeLeague);
    const awayLeague = side === "away" ? league : stored(match.awayLeague);
    const known = [homeLeague, awayLeague].filter((value): value is number => value != null && value > 0);
    updateMatch(match.id, {
      [side === "home" ? "homeName" : "awayName"]: suggestion.value,
      [side === "home" ? "homeAttack" : "awayAttack"]: attack == null ? match[side === "home" ? "homeAttack" : "awayAttack"] : attack.toFixed(2),
      [side === "home" ? "homeDefense" : "awayDefense"]: defense == null ? match[side === "home" ? "homeDefense" : "awayDefense"] : defense.toFixed(2),
      [side === "home" ? "homeLeague" : "awayLeague"]: league == null ? match[side === "home" ? "homeLeague" : "awayLeague"] : String(league),
      leagueGoals: known.length ? (known.reduce((sum, value) => sum + value, 0) / known.length).toFixed(2) : match.leagueGoals,
      firstHalfShare: match.firstHalfShare || (share == null ? "" : String(share)),
    });
  }

  if (!analysis) {
    return <p className="risk-caption">Lecture de l’analyse enregistrée…</p>;
  }

  const focus = squads[focusSlug];
  const visible = view === "competition"
    ? analysis.matches.filter((match) => match.competitionSlug === focusSlug)
    : analysis.matches;
  const edited = analysis.matches.find((match) => match.id === matchId);

  if (view === "ticket") {
    return (
      <section className="football-board">
        <p className="risk-caption">
          Ajoute les matchs les uns après les autres. Pour le pari, une seule analyse par match.
        </p>
        {analysis.matches.length ? analysis.matches.map((match, index) => {
          const reading = readOne(match);
          const home = match.homeName || "Domicile";
          const away = match.awayName || "Extérieur";
          const markets = reading
            ? [...reading.markets].sort((a, b) => pickOrder.indexOf(a.id) - pickOrder.indexOf(b.id))
            : [];
          return (
            <form className="panel" key={match.id} onSubmit={(event) => event.preventDefault()}>
              <div className="panel-body">
                <p className="panel-title">Match {index + 1} · {home} – {away}</p>
                <p className="football-proposal">
                  {reading
                    ? (sameMeasuredLeague(match) ? betProposal(reading.markets) : unmatchedLeagueSentence(match))
                    : "Les moyennes ou les cotes manquent encore pour ce match."}
                </p>
                {markets.length ? (
                  <div className="football-picks">
                    {markets.map((item) => (
                      <button
                        className={match.pick === item.id ? "football-pick active" : "football-pick"}
                        key={item.id}
                        type="button"
                        onClick={() => updateMatch(match.id, {
                          pick: match.pick === item.id ? "" : item.id,
                          included: true,
                        })}
                      >
                        <span>{betPhrase(item.id)}</span>
                        <strong>{percent(item.probability)}</strong>
                        <span>{item.worth ? `${item.edge >= 0 ? "+" : ""}${percent(item.edge)}` : "Passer"}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Link className="football-back" href={`/football/match?id=${encodeURIComponent(match.id)}`}>Ouvrir ce match</Link>
                )}
              </div>
            </form>
          );
        }) : (
          <p className="risk-caption">Aucun match pour l’instant. Ouvre un championnat et ajoute le premier.</p>
        )}
        <form className="panel" onSubmit={(event) => event.preventDefault()}>
          <div className="panel-body">
            <p className="panel-title">Combien miser</p>
            <label className="form-label">
              Argent sur le compte
              <input
                className="form-input"
                inputMode="decimal"
                value={analysis.bankroll}
                onChange={(event) => setAnalysis({ ...analysis, bankroll: event.target.value })}
              />
            </label>
            <p className="football-proposal">{stakeAdvice(Number.isFinite(bankroll) ? bankroll : 0, ticket?.read ?? null)}</p>
            {ticket?.read ? (
              <p className="risk-caption">
                {ticket.read.legs} match{ticket.read.legs > 1 ? "s" : ""}. Probabilité {percent(ticket.read.probability)}. Cote {ticket.read.odds.toFixed(2)}. La mise reste sous 2 % du compte. Aucun pari n’est envoyé.
              </p>
            ) : (
              <p className="risk-caption">La mise apparaît quand chaque match du pari a une analyse choisie.</p>
            )}
            {ticket && ticket.legs.length ? (
              <ul className="football-markets">
                {ticket.legs.map((leg) => (
                  <li key={leg.label}>
                    <span>{leg.label}</span>
                    <span>{leg.odds.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </form>
        <div className="football-actions">
          <Link className="football-search" href="/football/championnats">Ajouter un match</Link>
          <Link className="football-back" href="/football">Revenir à l’analyse</Link>
        </div>
      </section>
    );
  }

  if (view === "editor") {
    if (!edited) {
      return (
        <p className="risk-caption">
          Ce match n’est plus dans l’analyse. <Link className="football-back" href="/football">Retour à l’analyse</Link>
        </p>
      );
    }
    return (
      <section className="football-board">
        <p className="page-subtitle">
          <Link className="football-back" href="/football">Analyse</Link>
          {edited.competitionSlug ? <> · <Link className="football-back" href={`/football/competition?slug=${encodeURIComponent(edited.competitionSlug)}`}>{edited.competitionName || "Championnat"}</Link></> : null}
          {" "}· <Link className="football-back" href="/football/championnats">Ajouter un match</Link>
          {" "}· <Link className="football-back" href="/football/pari">Combien miser</Link>
        </p>
        <MatchCard
          index={analysis.matches.findIndex((match) => match.id === edited.id)}
          match={edited}
          groups={groups}
          squad={squads[edited.competitionSlug]}
          onChange={(patch) => updateMatch(edited.id, patch)}
          onChooseTeam={(side, suggestion) => chooseTeam(edited, side, suggestion)}
          onRemove={() => {
            removeMatch(edited.id);
            router.push("/football");
          }}
        />
      </section>
    );
  }

  return (
    <section className="football-board">
      {view === "competition" ? (
        <div className="page-heading">
          <div>
            <p className="eyebrow">{focus ? `${focus.group} · ${focus.area}` : "Championnat"}</p>
            <h1 className="page-title">{focus?.name ?? "Championnat"}</h1>
            <p className="page-subtitle">
              Les matchs du jour sont déjà listés. Ouvre-en un : les cotes Winner se remplissent, puis une phrase dit le pari à prendre.
            </p>
          </div>
        </div>
      ) : null}
      {view === "competition" ? (
        <FootballFixtures
          slug={focusSlug}
          knownIds={visible.flatMap((match) => match.fixtureId ? [match.fixtureId] : [])}
          onAnalyze={openFixture}
        />
      ) : null}
      {visible.length ? (
        <ul className="football-rows">
          {visible.map((match) => (
            <li key={match.id}>
              <Link href={`/football/match?id=${encodeURIComponent(match.id)}`}>
                <strong>{match.homeName || "Domicile"} – {match.awayName || "Extérieur"}</strong>
                <span>{match.competitionName || "Championnat à choisir"}{match.pick ? " · résultat choisi" : ""}</span>
              </Link>
              <button className="football-remove" type="button" onClick={() => removeMatch(match.id)}>Retirer</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="risk-caption">
          {view === "competition"
            ? "Aucun match de ce championnat pour l’instant."
            : "Aucun match dans l’analyse. Choisis un championnat, puis prépare un match."}
        </p>
      )}
      <div className="football-actions">
        {view === "competition" ? (
          <button className="football-search" type="button" onClick={() => createMatch(focusSlug)}>Préparer un match</button>
        ) : (
          <Link className="football-search" href="/football/championnats">Choisir un championnat</Link>
        )}
        <Link className="football-back" href="/football/pari">Voir le pari</Link>
      </div>
    </section>
  );
}

function MatchCard({
  index,
  match,
  groups,
  squad,
  onChange,
  onChooseTeam,
  onRemove,
}: {
  index: number;
  match: AnalysisMatch;
  groups: CompetitionGroup[];
  squad?: SquadBody;
  onChange: (patch: Partial<AnalysisMatch>) => void;
  onChooseTeam: (side: "home" | "away", suggestion: Suggestion) => void;
  onRemove: () => void;
}) {
  const reading = readOne(match);
  const remote = Boolean(squad?.remoteSearch) || (squad?.teams.length ?? 0) === 0;
  const [winnerNote, setWinnerNote] = useState("");
  const [formNote, setFormNote] = useState("");
  const matchRef = useRef(match);
  const onChangeRef = useRef(onChange);
  matchRef.current = match;
  onChangeRef.current = onChange;
  const winnerKey = useRef("");
  const formKey = useRef("");

  useEffect(() => {
    const home = match.homeName.trim();
    const away = match.awayName.trim();
    const key = `${fold(home)}|${fold(away)}|${fold(match.competitionName)}`;
    if (!home || !away || winnerKey.current === key) return;
    winnerKey.current = key;
    let cancelled = false;
    setWinnerNote("Lecture des cotes sur Winner…");
    const query = new URLSearchParams({ home, away, competition: match.competitionName });
    appFetch(`/api/football/winner?${query}`)
      .then(async (response) => response.json() as Promise<{ found?: boolean; message?: string; odds?: WinnerOdds }>)
      .then((body) => {
        if (cancelled) return;
        setWinnerNote(body?.message || "Winner ne répond pas. Les cotes restent à saisir à la main.");
        if (!body?.found || !body.odds) return;
        const current = matchRef.current;
        const patch: Partial<AnalysisMatch> = {};
        for (const [field, value] of Object.entries(body.odds) as Array<[keyof WinnerOdds, string]>) {
          if (!value) continue;
          const existing = current[field];
          if (typeof existing === "string" && existing.trim()) continue;
          patch[field] = value;
        }
        if (Object.keys(patch).length) onChangeRef.current(patch);
      })
      .catch(() => {
        if (!cancelled) setWinnerNote("Winner ne répond pas. Les cotes restent à saisir à la main.");
      });
    return () => {
      cancelled = true;
      if (winnerKey.current === key) winnerKey.current = "";
    };
  }, [match.awayName, match.competitionName, match.homeName]);

  useEffect(() => {
    const jobs: Array<{ side: "home" | "away"; name: string }> = [];
    if (match.homeName.trim() && (!match.homeAttack.trim() || !match.homeDefense.trim())) {
      jobs.push({ side: "home", name: match.homeName.trim() });
    }
    if (match.awayName.trim() && (!match.awayAttack.trim() || !match.awayDefense.trim())) {
      jobs.push({ side: "away", name: match.awayName.trim() });
    }
    const key = jobs.map((job) => `${job.side}:${fold(job.name)}`).join("|");
    if (!jobs.length || formKey.current === key) return;
    formKey.current = key;
    let cancelled = false;
    setFormNote("Recherche des moyennes de buts manquantes…");
    Promise.all(jobs.map(async (job) => {
      const response = await appFetch(`/api/football/form?team=${encodeURIComponent(job.name)}`);
      const body = await response.json() as { found?: boolean; attack?: string; defense?: string; message?: string };
      return { side: job.side, body };
    })).then((rows) => {
      if (cancelled) return;
      const current = matchRef.current;
      const patch: Partial<AnalysisMatch> = {};
      const notes: string[] = [];
      for (const row of rows) {
        if (row.body.message) notes.push(row.body.message);
        if (!row.body.found || !row.body.attack || !row.body.defense) continue;
        const attackKey = row.side === "home" ? "homeAttack" : "awayAttack";
        const defenseKey = row.side === "home" ? "homeDefense" : "awayDefense";
        if (!current[attackKey].trim()) patch[attackKey] = row.body.attack;
        if (!current[defenseKey].trim()) patch[defenseKey] = row.body.defense;
      }
      const homeAttack = patch.homeAttack || current.homeAttack;
      const awayAttack = patch.awayAttack || current.awayAttack;
      if (!current.leagueGoals.trim() && homeAttack.trim() && awayAttack.trim()) {
        const home = Number(homeAttack.replace(",", "."));
        const away = Number(awayAttack.replace(",", "."));
        if (home > 0 && away > 0) {
          patch.leagueGoals = ((home + away) / 2).toFixed(2);
          notes.push(`Buts moyens du championnat estimés à ${patch.leagueGoals}, à partir des deux équipes.`);
        }
      }
      if (Object.keys(patch).length) onChangeRef.current(patch);
      setFormNote(notes.join(" "));
    }).catch(() => {
      if (!cancelled) setFormNote("La recherche des moyennes n’a pas répondu. Tu peux les taper.");
    });
    return () => {
      cancelled = true;
      if (formKey.current === key) formKey.current = "";
    };
  }, [match.awayAttack, match.awayDefense, match.awayName, match.homeAttack, match.homeDefense, match.homeName]);

  return (
    <form className="panel" onSubmit={(event) => event.preventDefault()}>
      <div className="panel-body">
        <div className="football-match-head">
          <p className="panel-title">Match {index + 1}{match.competitionName ? ` · ${match.competitionName}` : ""}</p>
          <button className="football-remove" type="button" onClick={onRemove}>Retirer</button>
        </div>
        <label className="form-label">
          Championnat
          <select
            className="form-input football-text"
            value={match.competitionSlug}
            onChange={(event) => {
              const slug = event.target.value;
              const name = groups.flatMap((group) => group.items).find((item) => item.slug === slug)?.name ?? "";
              onChange({ competitionSlug: slug, competitionName: name, homeName: "", awayName: "", homePlayer: "", awayPlayer: "" });
            }}
          >
            <option value="">Choisir</option>
            {groups.map((group) => (
              <optgroup key={group.title} label={group.title}>
                {group.items.map((item) => (
                  <option key={item.slug} value={item.slug}>{item.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="football-include">
          <input
            type="checkbox"
            checked={match.included}
            onChange={(event) => onChange({ included: event.target.checked })}
          />
          <span>Ce match entre dans le pari</span>
        </label>
        <div className="football-teams">
          <Side
            title="Domicile"
            team={match.homeName}
            attack={match.homeAttack}
            defense={match.homeDefense}
            teams={squad?.teams ?? []}
            remote={remote}
            onTeam={(value) => onChange({ homeName: value })}
            onAttack={(value) => onChange({ homeAttack: value })}
            onDefense={(value) => onChange({ homeDefense: value })}
            onChooseTeam={(suggestion) => onChooseTeam("home", suggestion)}
          />
          <Side
            title="Extérieur"
            team={match.awayName}
            attack={match.awayAttack}
            defense={match.awayDefense}
            teams={squad?.teams ?? []}
            remote={remote}
            onTeam={(value) => onChange({ awayName: value })}
            onAttack={(value) => onChange({ awayAttack: value })}
            onDefense={(value) => onChange({ awayDefense: value })}
            onChooseTeam={(suggestion) => onChooseTeam("away", suggestion)}
          />
        </div>
        <p className="panel-title">Quelle mi-temps marque le plus</p>
        <div className="risk-fields football-odds">
          <NumberField label="1re" value={match.oddsHalfFirst ?? ""} onChange={(value) => onChange({ oddsHalfFirst: value })} />
          <NumberField label="Égal" value={match.oddsHalfEqual ?? ""} onChange={(value) => onChange({ oddsHalfEqual: value })} />
          <NumberField label="2e" value={match.oddsHalfSecond ?? ""} onChange={(value) => onChange({ oddsHalfSecond: value })} />
          <NumberField label="1re/Égal" value={match.oddsHalf1X ?? ""} onChange={(value) => onChange({ oddsHalf1X: value })} />
          <NumberField label="1re/2e" value={match.oddsHalf12 ?? ""} onChange={(value) => onChange({ oddsHalf12: value })} />
          <NumberField label="2e/Égal" value={match.oddsHalfX2 ?? ""} onChange={(value) => onChange({ oddsHalfX2: value })} />
        </div>
        <p className="panel-title">Total de buts</p>
        <div className="risk-fields football-odds football-goals">
          <NumberField label="Plus de 2,5" value={match.oddsOver25} onChange={(value) => onChange({ oddsOver25: value })} />
          <NumberField label="Moins de 2,5" value={match.oddsUnder25 ?? ""} onChange={(value) => onChange({ oddsUnder25: value })} />
        </div>
        <p className="panel-title">Résultat du match</p>
        <div className="risk-fields football-odds">
          <NumberField label="1" value={match.oddsHome} onChange={(value) => onChange({ oddsHome: value })} />
          <NumberField label="X" value={match.oddsDraw} onChange={(value) => onChange({ oddsDraw: value })} />
          <NumberField label="2" value={match.oddsAway} onChange={(value) => onChange({ oddsAway: value })} />
          <NumberField label="1X" value={match.oddsDouble1X ?? ""} onChange={(value) => onChange({ oddsDouble1X: value })} />
          <NumberField label="12" value={match.oddsDouble12 ?? ""} onChange={(value) => onChange({ oddsDouble12: value })} />
          <NumberField label="X2" value={match.oddsDoubleX2 ?? ""} onChange={(value) => onChange({ oddsDoubleX2: value })} />
          <NumberField label="Les deux marquent" value={match.oddsBothScore ?? ""} onChange={(value) => onChange({ oddsBothScore: value })} />
          <NumberField label="Les deux ne marquent pas" value={match.oddsNotBoth ?? ""} onChange={(value) => onChange({ oddsNotBoth: value })} />
          <NumberField label="Buts moyens du championnat" value={match.leagueGoals} onChange={(value) => onChange({ leagueGoals: value })} />
        </div>
        {formNote ? <p className="risk-caption">{formNote}</p> : null}
        {winnerNote ? <p className="risk-caption">{winnerNote}</p> : null}
        {reading ? (
          <>
          <p className="football-proposal">{sameMeasuredLeague(match) ? betProposal(reading.markets) : unmatchedLeagueSentence(match)}</p>
          <p className="risk-caption">
            {sameMeasuredLeague(match)
              ? "Choisis une analyse ci-dessous, puis ajoute le match suivant. La mise du combiné est sur Pari."
              : "Ce match se passe tant que les moyennes des deux clubs viennent de championnats différents."}
          </p>
          {sameMeasuredLeague(match) ? (
            <>
          <p className="risk-caption">
            {reading.half
              ? `1re mi-temps plus de buts : ${percent(reading.half.first)}. Égalité : ${percent(reading.half.equal)}. 2e mi-temps plus de buts : ${percent(reading.half.second)}. Sur ce championnat, ${percent(reading.half.share)} des buts arrivent en 1re mi-temps.`
              : "La part de buts en 1re mi-temps n’est pas encore mesurée pour ce championnat."}
          </p>
          <p className="risk-caption">
            Buts estimés {reading.expectedHome.toFixed(2)} – {reading.expectedAway.toFixed(2)}. Plus de 2,5 : {percent(reading.over25)}. Scores les plus probables : {reading.scorelines.map((score) => `${score.home}-${score.away} ${percent(score.probability)}`).join(", ")}.
          </p>
            </>
          ) : null}
          <p className="risk-caption">
            {reading.markets.some((item) => item.id === "halfFirst") && reading.markets.some((item) => item.id === "halfEqual") && reading.markets.some((item) => item.id === "halfSecond")
              ? `Marge du book sur 1re / Égal / 2e : ${percent(Math.max(0, reading.markets.filter((item) => item.id === "halfFirst" || item.id === "halfEqual" || item.id === "halfSecond").reduce((total, item) => total + item.implied, 0) - 1))}. Ce pari entre dans la phrase dès que l’écart atteint 3 %.`
              : "Les cotes vides sont ignorées. La phrase utilise seulement les cotes déjà remplies."}
          </p>
          <div className="football-picks">
            {[...reading.markets].sort((a, b) => pickOrder.indexOf(a.id) - pickOrder.indexOf(b.id)).map((item) => (
              <button
                className={match.pick === item.id ? "football-pick active" : "football-pick"}
                key={item.id}
                type="button"
                onClick={() => onChange({ pick: match.pick === item.id ? "" : item.id as MarketId, included: true })}
              >
                <span>{item.label}</span>
                <strong>{percent(item.probability)}</strong>
                <span>{item.worth ? `${item.edge >= 0 ? "+" : ""}${percent(item.edge)}` : "Passer"}</span>
              </button>
            ))}
          </div>
          </>
        ) : (
          <p className="risk-caption">L’analyse attend les moyennes de buts des deux équipes. Les cotes déjà là seront prises en compte, les champs vides sont ignorés.</p>
        )}
      </div>
    </form>
  );
}

function Side({
  title,
  team,
  attack,
  defense,
  teams,
  remote,
  onTeam,
  onAttack,
  onDefense,
  onChooseTeam,
}: {
  title: string;
  team: string;
  attack: string;
  defense: string;
  teams: SquadTeam[];
  remote: boolean;
  onTeam: (value: string) => void;
  onAttack: (value: string) => void;
  onDefense: (value: string) => void;
  onChooseTeam: (suggestion: Suggestion) => void;
}) {
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
  remoteKind?: "team";
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

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="form-label">
      {label}
      <input className="form-input" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
