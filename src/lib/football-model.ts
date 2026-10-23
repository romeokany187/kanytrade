export type Scoreline = {
  home: number;
  away: number;
  probability: number;
};

export type MarketId =
  | "home"
  | "draw"
  | "away"
  | "dc1x"
  | "dc12"
  | "dcx2"
  | "over25"
  | "under25"
  | "btts"
  | "bttsNo"
  | "halfFirst"
  | "halfEqual"
  | "halfSecond"
  | "half1x"
  | "half12"
  | "halfx2";

export type MarketRead = {
  id: MarketId;
  label: string;
  probability: number;
  odds: number;
  implied: number;
  fair: number | null;
  juice: number | null;
  edge: number;
  worth: boolean;
};

export type FootballInput = {
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
  leagueGoals: number;
  firstHalfShare?: number | null;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsHalfFirst?: number | null;
  oddsHalfEqual?: number | null;
  oddsHalfSecond?: number | null;
  oddsHalf1X?: number | null;
  oddsHalf12?: number | null;
  oddsHalfX2?: number | null;
  oddsOver25: number | null;
  oddsUnder25?: number | null;
  oddsDouble1X?: number | null;
  oddsDouble12?: number | null;
  oddsDoubleX2?: number | null;
  oddsBothScore?: number | null;
  oddsNotBoth?: number | null;
  bankroll: number;
  rule?: "tested" | "margin";
};

export type FootballDecision = {
  market: MarketRead;
  stake: number;
  stakePercent: number;
};

export type FootballRead = {
  expectedHome: number;
  expectedAway: number;
  markets: MarketRead[];
  scorelines: Scoreline[];
  over25: number;
  half: { first: number; equal: number; second: number; share: number } | null;
  overround: number;
  decision: FootballDecision | null;
};

const MAX_GOALS = 8;
const HOME_ADVANTAGE = 1.1;
const LOW_SCORE_RHO = -0.08;
const MIN_EDGE = 0.03;
const KELLY_FRACTION = 0.25;
const MAX_STAKE_PERCENT = 0.02;

function factorial(value: number) {
  let result = 1;
  for (let step = 2; step <= value; step += 1) result *= step;
  return result;
}

function poisson(goals: number, lambda: number) {
  return (Math.exp(-lambda) * lambda ** goals) / factorial(goals);
}

function clampRate(value: number) {
  return Math.min(4.2, Math.max(0.15, value));
}

function dependence(home: number, away: number, homeRate: number, awayRate: number) {
  if (home === 0 && away === 0) return 1 - homeRate * awayRate * LOW_SCORE_RHO;
  if (home === 0 && away === 1) return 1 + homeRate * LOW_SCORE_RHO;
  if (home === 1 && away === 0) return 1 + awayRate * LOW_SCORE_RHO;
  if (home === 1 && away === 1) return 1 - LOW_SCORE_RHO;
  return 1;
}

function scoreMatrix(homeRate: number, awayRate: number) {
  const rows: Scoreline[] = [];
  for (let home = 0; home <= MAX_GOALS; home += 1) {
    for (let away = 0; away <= MAX_GOALS; away += 1) {
      const raw =
        poisson(home, homeRate) *
        poisson(away, awayRate) *
        dependence(home, away, homeRate, awayRate);
      rows.push({ home, away, probability: Math.max(0, raw) });
    }
  }
  const total = rows.reduce((sum, row) => sum + row.probability, 0);
  return rows.map((row) => ({ ...row, probability: row.probability / total }));
}

function implied(odds: number) {
  return odds > 1 ? 1 / odds : 0;
}

function halfSplit(totalRate: number, firstShare: number) {
  const share = Math.min(0.8, Math.max(0.2, firstShare));
  const firstRate = Math.max(0.05, totalRate * share);
  const secondRate = Math.max(0.05, totalRate * (1 - share));
  const first: number[] = [];
  const second: number[] = [];
  for (let goals = 0; goals <= MAX_GOALS; goals += 1) {
    first.push(poisson(goals, firstRate));
    second.push(poisson(goals, secondRate));
  }
  const firstTotal = first.reduce((sum, value) => sum + value, 0);
  const secondTotal = second.reduce((sum, value) => sum + value, 0);
  let moreFirst = 0;
  let equal = 0;
  let moreSecond = 0;
  for (let left = 0; left <= MAX_GOALS; left += 1) {
    for (let right = 0; right <= MAX_GOALS; right += 1) {
      const probability = (first[left] / firstTotal) * (second[right] / secondTotal);
      if (left > right) moreFirst += probability;
      else if (left === right) equal += probability;
      else moreSecond += probability;
    }
  }
  return { moreFirst, equal, moreSecond, share };
}

function market(
  id: MarketId,
  label: string,
  probability: number,
  odds: number,
): MarketRead {
  const price = implied(odds);
  return {
    id,
    label,
    probability,
    odds,
    implied: price,
    fair: null,
    juice: null,
    edge: probability - price,
    worth: false,
  };
}

function applyGroupMargin(markets: MarketRead[], ids: MarketId[]) {
  const group = markets.filter((item) => ids.includes(item.id));
  if (group.length < 2) return;
  const sum = group.reduce((total, item) => total + item.implied, 0);
  if (sum <= 0) return;
  for (const item of group) {
    const fair = item.implied / sum;
    const juice = Math.max(0, item.implied - fair);
    item.fair = fair;
    item.juice = juice;
    item.worth = item.edge >= Math.max(MIN_EDGE, juice);
  }
}

function applyDerived(markets: MarketRead[], pairs: Array<[MarketId, MarketId, MarketId]>) {
  const byId = new Map(markets.map((item) => [item.id, item]));
  for (const [id, leftId, rightId] of pairs) {
    const item = byId.get(id);
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (!item || left?.fair == null || right?.fair == null) continue;
    const fair = left.fair + right.fair;
    const juice = Math.max(0, item.implied - fair);
    item.fair = fair;
    item.juice = juice;
    item.worth = fair > 0 && fair < 1 && item.edge >= Math.max(MIN_EDGE, juice);
  }
}

function kellyStake(probability: number, odds: number, bankroll: number) {
  const netOdds = odds - 1;
  if (netOdds <= 0 || probability <= 0 || probability >= 1) return 0;
  const fraction = (netOdds * probability - (1 - probability)) / netOdds;
  const capped = Math.min(MAX_STAKE_PERCENT, Math.max(0, fraction * KELLY_FRACTION));
  return bankroll * capped;
}

export function readMatch(input: FootballInput): FootballRead {
  const league = Math.max(0.4, input.leagueGoals);
  const homeRate = clampRate(
    (input.homeAttack / league) * (input.awayDefense / league) * league * HOME_ADVANTAGE,
  );
  const awayRate = clampRate((input.awayAttack / league) * (input.homeDefense / league) * league);
  const scorelines = scoreMatrix(homeRate, awayRate).sort((a, b) => b.probability - a.probability);

  let home = 0;
  let draw = 0;
  let away = 0;
  let over25 = 0;
  let bothScore = 0;
  for (const row of scorelines) {
    if (row.home > row.away) home += row.probability;
    else if (row.home === row.away) draw += row.probability;
    else away += row.probability;
    if (row.home + row.away >= 3) over25 += row.probability;
    if (row.home >= 1 && row.away >= 1) bothScore += row.probability;
  }

  const share = input.firstHalfShare;
  const half = share != null && share > 0 && share < 1
    ? halfSplit(homeRate + awayRate, share)
    : null;
  const markets: MarketRead[] = [];
  const priced: Array<[MarketId, string, number, number | null | undefined]> = [
    ["home", "1", home, input.oddsHome],
    ["draw", "X", draw, input.oddsDraw],
    ["away", "2", away, input.oddsAway],
    ["over25", "Plus de 2,5", over25, input.oddsOver25],
    ["under25", "Moins de 2,5", 1 - over25, input.oddsUnder25],
    ["dc1x", "1X", home + draw, input.oddsDouble1X],
    ["dc12", "12", home + away, input.oddsDouble12],
    ["dcx2", "X2", draw + away, input.oddsDoubleX2],
    ["btts", "Les deux marquent", bothScore, input.oddsBothScore],
    ["bttsNo", "Les deux ne marquent pas", 1 - bothScore, input.oddsNotBoth],
  ];
  if (half) {
    priced.push(
      ["halfFirst", "1re", half.moreFirst, input.oddsHalfFirst],
      ["halfEqual", "Égal", half.equal, input.oddsHalfEqual],
      ["halfSecond", "2e", half.moreSecond, input.oddsHalfSecond],
      ["half1x", "1re/Égal", half.moreFirst + half.equal, input.oddsHalf1X],
      ["half12", "1re/2e", half.moreFirst + half.moreSecond, input.oddsHalf12],
      ["halfx2", "2e/Égal", half.equal + half.moreSecond, input.oddsHalfX2],
    );
  }
  for (const [id, label, probability, odds] of priced) {
    if (odds && odds > 1) markets.push(market(id, label, probability, odds));
  }

  applyGroupMargin(markets, ["home", "draw", "away"]);
  applyGroupMargin(markets, ["over25", "under25"]);
  applyGroupMargin(markets, ["btts", "bttsNo"]);
  applyGroupMargin(markets, ["halfFirst", "halfEqual", "halfSecond"]);
  applyDerived(markets, [
    ["half1x", "halfFirst", "halfEqual"],
    ["half12", "halfFirst", "halfSecond"],
    ["halfx2", "halfEqual", "halfSecond"],
  ]);
  const halfMarket = new Set<MarketId>(["halfFirst", "halfEqual", "halfSecond", "half1x", "half12", "halfx2"]);
  for (const item of markets) {
    if (halfMarket.has(item.id) && item.edge >= MIN_EDGE) item.worth = true;
    else if (item.juice == null && item.edge >= MIN_EDGE) item.worth = true;
  }
  const result = markets.filter((item) => item.id === "home" || item.id === "draw" || item.id === "away");
  const overround = result.length === 3 ? result.reduce((total, item) => total + item.implied, 0) - 1 : 0;

  const best = markets
    .filter((item) => input.rule === "tested" ? item.edge >= MIN_EDGE : item.worth)
    .sort((a, b) => b.edge - a.edge)[0];
  const stake = best ? kellyStake(best.probability, best.odds, input.bankroll) : 0;
  const decision =
    best && stake >= 0.5
      ? { market: best, stake, stakePercent: stake / input.bankroll }
      : null;

  return {
    expectedHome: homeRate,
    expectedAway: awayRate,
    markets,
    scorelines: scorelines.slice(0, 5),
    over25,
    half: half ? { first: half.moreFirst, equal: half.equal, second: half.moreSecond, share: half.share } : null,
    overround,
    decision,
  };
}

export type TicketLeg = {
  label: string;
  probability: number;
  odds: number;
  worth: boolean;
};

export type TicketRead = {
  legs: number;
  probability: number;
  odds: number;
  edge: number;
  stake: number;
  stakePercent: number;
  take: boolean;
};

const PROPOSALS: Record<MarketId, string> = {
  halfSecond: "plus de buts en deuxième mi-temps qu’en première",
  halfFirst: "plus de buts en première mi-temps qu’en deuxième",
  halfEqual: "autant de buts dans les deux mi-temps",
  half1x: "plus de buts en première mi-temps, ou autant dans les deux",
  half12: "plus de buts dans l’une des deux mi-temps",
  halfx2: "plus de buts en deuxième mi-temps, ou autant dans les deux",
  home: "la victoire de l’équipe à domicile",
  draw: "le match nul",
  away: "la victoire de l’équipe à l’extérieur",
  over25: "plus de 2,5 buts",
  under25: "moins de 2,5 buts",
  btts: "les deux équipes marquent",
  bttsNo: "au moins une équipe ne marque pas",
  dc1x: "la victoire à domicile ou le match nul",
  dc12: "la victoire d’une des deux équipes",
  dcx2: "la victoire à l’extérieur ou le match nul",
};

export function betPhrase(id: MarketId) {
  return PROPOSALS[id];
}

const HALF_PHRASE = new Set<MarketId>(["halfFirst", "halfEqual", "halfSecond", "half1x", "half12", "halfx2"]);

export function betProposal(markets: MarketRead[]) {
  if (!markets.length) return "Les cotes ne sont pas encore là. Dès qu’elles arrivent, je te dirai le pari à prendre.";
  const chosen = markets.filter((item) => item.worth).sort((a, b) => {
    const halfA = HALF_PHRASE.has(a.id) ? 0 : 1;
    const halfB = HALF_PHRASE.has(b.id) ? 0 : 1;
    if (halfA !== halfB) return halfA - halfB;
    return b.edge - a.edge;
  });
  if (!chosen.length) return "Pour ce match, je te propose de passer. Aucune cote ne dépasse la marge déjà prise par le book.";
  const phrases = chosen.map((item) => PROPOSALS[item.id]);
  if (phrases.length === 1) return `Pour ce match, je te propose de miser sur ${phrases[0]}.`;
  const last = phrases[phrases.length - 1];
  return `Pour ce match, je te propose de miser sur ${phrases.slice(0, -1).join(", ")} et ${last}.`;
}

export function readTicket(legs: TicketLeg[], bankroll: number): TicketRead | null {
  if (!legs.length || bankroll <= 0) return null;
  const probability = legs.reduce((product, leg) => product * leg.probability, 1);
  const odds = legs.reduce((product, leg) => product * leg.odds, 1);
  if (odds <= 1 || probability <= 0 || probability >= 1) return null;
  const stake = kellyStake(probability, odds, bankroll);
  const edge = probability - 1 / odds;
  return {
    legs: legs.length,
    probability,
    odds,
    edge,
    stake,
    stakePercent: bankroll > 0 ? stake / bankroll : 0,
    take: legs.every((leg) => leg.worth) && edge >= MIN_EDGE && stake >= 1,
  };
}
