import { readMatch } from "./football-model";

export type HistoricalMatch = {
  league: string;
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  homeHt: number | null;
  awayHt: number | null;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsOver25: number | null;
};

export type MarketTally = {
  bets: number;
  wins: number;
  staked: number;
  profit: number;
};

export type CalibrationBucket = {
  label: string;
  count: number;
  predicted: number;
  actual: number;
};

export type BacktestSummary = {
  matches: number;
  priced: number;
  bets: number;
  wins: number;
  staked: number;
  profit: number;
  yield: number;
  byMarket: Record<string, MarketTally>;
  calibration: CalibrationBucket[];
};

type TeamForm = {
  played: number;
  scored: number;
  conceded: number;
};

const PRIOR_MATCHES = 8;
const MINIMUM_MATCHES = 5;

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function count(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function odds(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (value > 1) return value;
  }
  return null;
}

function isoDate(value: string) {
  const [day, month, year] = value.split(/[/-]/);
  if (!year || !month || !day) return value;
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseHistory(csv: string, league: string): HistoricalMatch[] {
  return parseCsv(csv).flatMap((row) => {
    const homeGoals = Number(row.FTHG);
    const awayGoals = Number(row.FTAG);
    if (!row.HomeTeam || !row.AwayTeam || !Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return [];
    return [{
      league,
      date: isoDate(row.Date),
      home: row.HomeTeam,
      away: row.AwayTeam,
      homeGoals,
      awayGoals,
      homeHt: count(row.HTHG ?? ""),
      awayHt: count(row.HTAG ?? ""),
      oddsHome: odds(row, ["PSCH", "PSH", "B365CH", "B365H"]),
      oddsDraw: odds(row, ["PSCD", "PSD", "B365CD", "B365D"]),
      oddsAway: odds(row, ["PSCA", "PSA", "B365CA", "B365A"]),
      oddsOver25: odds(row, ["PC>2.5", "P>2.5", "AvgC>2.5", "Avg>2.5"]),
    }];
  });
}

function shrunk(scored: number, played: number, leagueGoals: number) {
  return (scored + PRIOR_MATCHES * leagueGoals) / (played + PRIOR_MATCHES);
}

function emptyTally(): MarketTally {
  return { bets: 0, wins: 0, staked: 0, profit: 0 };
}

export function backtestHistory(matches: HistoricalMatch[]): BacktestSummary {
  const ordered = [...matches].sort((a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home));
  const form = new Map<string, TeamForm>();
  const leagueGoals = new Map<string, { goals: number; matches: number }>();
  const byMarket: Record<string, MarketTally> = {};
  const buckets = [
    { label: "moins de 40 %", min: 0, max: 0.4, count: 0, predicted: 0, actual: 0 },
    { label: "40 à 50 %", min: 0.4, max: 0.5, count: 0, predicted: 0, actual: 0 },
    { label: "50 à 60 %", min: 0.5, max: 0.6, count: 0, predicted: 0, actual: 0 },
    { label: "60 à 70 %", min: 0.6, max: 0.7, count: 0, predicted: 0, actual: 0 },
    { label: "70 % et plus", min: 0.7, max: 1.01, count: 0, predicted: 0, actual: 0 },
  ];
  let priced = 0;
  let bets = 0;
  let wins = 0;
  let staked = 0;
  let profit = 0;

  let pending: HistoricalMatch[] = [];
  const applyPending = () => {
    for (const match of pending) {
      const home = form.get(`${match.league}:${match.home}`) ?? { played: 0, scored: 0, conceded: 0 };
      const away = form.get(`${match.league}:${match.away}`) ?? { played: 0, scored: 0, conceded: 0 };
      const league = leagueGoals.get(match.league) ?? { goals: 0, matches: 0 };
      form.set(`${match.league}:${match.home}`, {
        played: home.played + 1,
        scored: home.scored + match.homeGoals,
        conceded: home.conceded + match.awayGoals,
      });
      form.set(`${match.league}:${match.away}`, {
        played: away.played + 1,
        scored: away.scored + match.awayGoals,
        conceded: away.conceded + match.homeGoals,
      });
      leagueGoals.set(match.league, {
        goals: league.goals + match.homeGoals + match.awayGoals,
        matches: league.matches + 1,
      });
    }
    pending = [];
  };

  for (const match of ordered) {
    if (pending.length > 0 && pending[0].date !== match.date) applyPending();
    const home = form.get(`${match.league}:${match.home}`) ?? { played: 0, scored: 0, conceded: 0 };
    const away = form.get(`${match.league}:${match.away}`) ?? { played: 0, scored: 0, conceded: 0 };
    const league = leagueGoals.get(match.league) ?? { goals: 0, matches: 0 };
    const average = league.matches >= 20 ? league.goals / (league.matches * 2) : 1.35;

    if (
      home.played >= MINIMUM_MATCHES &&
      away.played >= MINIMUM_MATCHES &&
      match.oddsHome &&
      match.oddsDraw &&
      match.oddsAway
    ) {
      priced += 1;
      const reading = readMatch({
        homeAttack: shrunk(home.scored, home.played, average),
        homeDefense: shrunk(home.conceded, home.played, average),
        awayAttack: shrunk(away.scored, away.played, average),
        awayDefense: shrunk(away.conceded, away.played, average),
        leagueGoals: average,
        oddsHome: match.oddsHome,
        oddsDraw: match.oddsDraw,
        oddsAway: match.oddsAway,
        oddsOver25: match.oddsOver25,
        bankroll: 100,
        rule: "tested",
      });
      const homeChance = reading.markets.find((item) => item.id === "home");
      if (homeChance) {
        const bucket = buckets.find((item) => homeChance.probability >= item.min && homeChance.probability < item.max);
        if (bucket) {
          bucket.count += 1;
          bucket.predicted += homeChance.probability;
          bucket.actual += match.homeGoals > match.awayGoals ? 1 : 0;
        }
      }
      const decision = reading.decision;
      if (decision) {
        const won = decision.market.id === "home"
          ? match.homeGoals > match.awayGoals
          : decision.market.id === "away"
            ? match.awayGoals > match.homeGoals
            : decision.market.id === "draw"
              ? match.homeGoals === match.awayGoals
              : match.homeGoals + match.awayGoals >= 3;
        const stake = decision.stake;
        const result = won ? stake * (decision.market.odds - 1) : -stake;
        const tally = byMarket[decision.market.id] ?? emptyTally();
        tally.bets += 1;
        tally.wins += won ? 1 : 0;
        tally.staked += stake;
        tally.profit += result;
        byMarket[decision.market.id] = tally;
        bets += 1;
        wins += won ? 1 : 0;
        staked += stake;
        profit += result;
      }
    }

    pending.push(match);
  }
  applyPending();

  return {
    matches: ordered.length,
    priced,
    bets,
    wins,
    staked,
    profit,
    yield: staked > 0 ? profit / staked : 0,
    byMarket,
    calibration: buckets.filter((bucket) => bucket.count > 0).map((bucket) => ({
      label: bucket.label,
      count: bucket.count,
      predicted: bucket.predicted / bucket.count,
      actual: bucket.actual / bucket.count,
    })),
  };
}
