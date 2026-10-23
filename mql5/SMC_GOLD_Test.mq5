#property strict
#property version   "1.21"
#property description "XAU M5: SMC location, Wyckoff effort/result, auction value. Fixed risk."

#include <Trade/Trade.mqh>

input bool   InpEnableTrading       = true; // Envoyer un ordre si le signal est complet
input double InpRiskPercent         = 0.25;  // Risque par ordre, en %
input double InpMaxDailyLossPercent = 1.0;   // Perte max du jour, en %
input double InpRewardRiskRatio     = 2.0;
input double InpMinRewardRisk       = 1.5;
input int    InpSwingLookback       = 8;
input int    InpSetupExpiryBars     = 24;
input int    InpSweepBufferPoints   = 20;
input int    InpMaxSpreadPoints     = 100;
input int    InpDeviationPoints     = 30;
input bool   InpUseSessionFilter    = true;
input int    InpSessionStartHour    = 8;
input int    InpSessionEndHour      = 17;
input double InpMinBodyRatio        = 0.5;
input double InpMinFvgRatio         = 0.15;
input double InpMinSweepVolumeRatio = 1.1;
input double InpMinBreakVolumeRatio = 1.0;
input double InpMaxTestVolumeRatio  = 1.25;
input ulong  InpMagicNumber         = 26091001;

enum SetupPhase
  {
   PHASE_IDLE = 0,
   PHASE_WAITING_FOR_STRUCTURE,
   PHASE_WAITING_FOR_RETEST
  };

enum SetupDirection
  {
   DIRECTION_NONE = 0,
   DIRECTION_BUY,
   DIRECTION_SELL
  };

CTrade trade;
SetupPhase setup_phase = PHASE_IDLE;
SetupDirection setup_direction = DIRECTION_NONE;
datetime last_bar_time = 0;
datetime last_acted_day = 0;
double sweep_extreme = 0.0;
double dealing_high = 0.0;
double dealing_low = 0.0;
double fvg_lower = 0.0;
double fvg_upper = 0.0;
long displacement_volume = 0;
int setup_age_bars = 0;
datetime day_anchor = 0;
double day_start_equity = 0.0;
string status_text = "Pas de position.";

void ResetSetup()
  {
   setup_phase = PHASE_IDLE;
   setup_direction = DIRECTION_NONE;
   sweep_extreme = 0.0;
   dealing_high = 0.0;
   dealing_low = 0.0;
   fvg_lower = 0.0;
   fvg_upper = 0.0;
   displacement_volume = 0;
   setup_age_bars = 0;
  }

void PublishStatus()
  {
   Comment("Décision maintenant : ", status_text,
           "\nRisque par ordre : ", DoubleToString(InpRiskPercent, 2),
           " %    Perte max du jour : ", DoubleToString(InpMaxDailyLossPercent, 2), " %",
           "\nEnvoi d'ordres : ", (InpEnableTrading ? "OUVERT" : "FERME"));
  }

void UpdateDayBaseline()
  {
   datetime today = DayOf(TimeCurrent());
   if(today == day_anchor)
      return;
   day_anchor = today;
   day_start_equity = AccountInfoDouble(ACCOUNT_EQUITY);
  }

bool DailyLossReached()
  {
   if(day_start_equity <= 0.0)
      return false;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double loss_percent = (day_start_equity - equity) / day_start_equity * 100.0;
   return loss_percent >= InpMaxDailyLossPercent;
  }

bool HasOpenPositionOnSymbol()
  {
   return PositionSelect(_Symbol);
  }

datetime DayOf(const datetime when)
  {
   MqlDateTime parts;
   TimeToStruct(when, parts);
   parts.hour = 0;
   parts.min = 0;
   parts.sec = 0;
   return StructToTime(parts);
  }

bool IsInSession(const datetime when)
  {
   if(!InpUseSessionFilter)
      return true;

   MqlDateTime parts;
   TimeToStruct(when, parts);
   return parts.hour >= InpSessionStartHour && parts.hour < InpSessionEndHour;
  }

double AverageRange(const MqlRates &rates[], const int start, const int count)
  {
   double sum = 0.0;
   int used = 0;
   for(int i = start; i < start + count; i++)
     {
      double span = rates[i].high - rates[i].low;
      if(span <= 0.0)
         continue;
      sum += span;
      used++;
     }
   if(used == 0)
      return 0.0;
   return sum / used;
  }

double AverageTickVolume(const MqlRates &rates[], const int start, const int count)
  {
   double sum = 0.0;
   int used = 0;
   for(int i = start; i < start + count; i++)
     {
      if(rates[i].tick_volume <= 0)
         continue;
      sum += (double)rates[i].tick_volume;
      used++;
     }
   if(used == 0)
      return 0.0;
   return sum / used;
  }

bool HasEffort(const MqlRates &candle, const double average_volume, const double minimum_ratio)
  {
   if(average_volume <= 0.0)
      return true;
   return (double)candle.tick_volume >= average_volume * minimum_ratio;
  }

bool IsAbsorption(const MqlRates &candle, const double average_volume)
  {
   double range = candle.high - candle.low;
   double body = MathAbs(candle.close - candle.open);
   if(average_volume <= 0.0 || range <= 0.0)
      return false;
   return (double)candle.tick_volume >= average_volume * 2.0 && body < range * 0.35;
  }

void UpsertHLine(const string name, const double price, const color line_color)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, line_color);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
  }

void UpsertZone(const string name, const datetime left_time, const datetime right_time,
                const double lower, const double upper, const color zone_color)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE, 0, left_time, upper, right_time, lower);
   ObjectSetInteger(0, name, OBJPROP_TIME, 0, left_time);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 0, upper);
   ObjectSetInteger(0, name, OBJPROP_TIME, 1, right_time);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 1, lower);
   ObjectSetInteger(0, name, OBJPROP_COLOR, zone_color);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
  }

double NormalizeVolumeDown(const double volume)
  {
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minimum = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maximum = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0.0 || minimum <= 0.0 || maximum <= 0.0)
      return 0.0;

   double normalized = MathFloor(volume / step) * step;
   if(normalized < minimum || normalized > maximum)
      return 0.0;

   int digits = 0;
   double scaled_step = step;
   while(digits < 8 && MathAbs(scaled_step - MathRound(scaled_step)) > 1e-8)
     {
      scaled_step *= 10.0;
      digits++;
     }
   return NormalizeDouble(normalized, digits);
  }

double CalculateRiskBasedVolume(const double entry, const double stop)
  {
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double tick_size = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tick_value = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tick_value <= 0.0)
      tick_value = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);

   double distance = MathAbs(entry - stop);
   if(equity <= 0.0 || tick_size <= 0.0 || tick_value <= 0.0 || distance <= 0.0)
      return 0.0;

   double loss_per_lot = (distance / tick_size) * tick_value;
   if(loss_per_lot <= 0.0)
      return 0.0;

   double risk_money = equity * (InpRiskPercent / 100.0);
   return NormalizeVolumeDown(risk_money / loss_per_lot);
  }

bool IsSpreadAcceptable()
  {
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return false;

   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(point <= 0.0)
      return false;

   double spread_points = (tick.ask - tick.bid) / point;
   if(spread_points > InpMaxSpreadPoints)
     {
      PrintFormat("SMC signal skipped: spread %.1f points exceeds limit %d.",
                  spread_points, InpMaxSpreadPoints);
      return false;
     }
   return true;
  }

bool IsSweepRejected(const MqlRates &candle, const bool swept_low)
  {
   double range = candle.high - candle.low;
   if(range <= 0.0)
      return false;

   double close_position = (candle.close - candle.low) / range;
   if(swept_low)
      return close_position >= 0.5;
   return close_position <= 0.5;
  }

bool PriceClosedThroughSweep(const double close_price)
  {
   if(setup_direction == DIRECTION_BUY)
      return close_price < sweep_extreme;
   if(setup_direction == DIRECTION_SELL)
      return close_price > sweep_extreme;
   return false;
  }

void ProcessClosedBar()
  {
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int required = MathMax(InpSwingLookback + 4, 18);
   if(CopyRates(_Symbol, PERIOD_M5, 0, required, rates) < required)
      return;

   double previous_day_high = iHigh(_Symbol, PERIOD_D1, 1);
   double previous_day_low = iLow(_Symbol, PERIOD_D1, 1);
   if(previous_day_high <= previous_day_low)
      return;

   if(setup_phase != PHASE_IDLE)
     {
      setup_age_bars++;
      if(setup_age_bars > InpSetupExpiryBars)
        {
         Print("SMC setup expired without entry.");
         status_text = "Idée expirée. Pas de position.";
         ResetSetup();
        }
      else if(PriceClosedThroughSweep(rates[1].close))
        {
         Print("SMC setup cancelled: price closed through the sweep.");
         status_text = "Prix repassé le niveau. Pas de position.";
         ResetSetup();
        }
      else if(setup_phase == PHASE_WAITING_FOR_RETEST &&
              rates[1].high >= fvg_lower && rates[1].low <= fvg_upper &&
              displacement_volume > 0 &&
              (double)rates[1].tick_volume > displacement_volume * InpMaxTestVolumeRatio)
        {
         Print("SMC setup cancelled: the retest showed more effort than the impulse.");
         status_text = "Le retour a trop de volume. Pas de position.";
         ResetSetup();
        }
     }

   if(DailyLossReached())
     {
      if(setup_phase != PHASE_IDLE)
         ResetSetup();
      status_text = "Perte du jour atteinte. Je m'arrête.";
      return;
     }

   if(setup_phase == PHASE_IDLE)
     {
      status_text = "Pas de position.";
      if(!IsInSession(rates[1].time))
         return;
      if(last_acted_day == DayOf(rates[1].time))
         return;

      double buffer = InpSweepBufferPoints * _Point;
      bool swept_high = rates[1].high > previous_day_high + buffer &&
                        rates[1].close < previous_day_high &&
                        IsSweepRejected(rates[1], false);
      bool swept_low = rates[1].low < previous_day_low - buffer &&
                       rates[1].close > previous_day_low &&
                       IsSweepRejected(rates[1], true);

      if(swept_high == swept_low)
         return;

      double average_volume = AverageTickVolume(rates, 2, 14);
      if(!HasEffort(rates[1], average_volume, InpMinSweepVolumeRatio))
         return;

      setup_direction = swept_low ? DIRECTION_BUY : DIRECTION_SELL;
      sweep_extreme = swept_low ? rates[1].low : rates[1].high;
      dealing_high = previous_day_high;
      dealing_low = previous_day_low;
      setup_age_bars = 0;
      setup_phase = PHASE_WAITING_FOR_STRUCTURE;
      double equilibrium = (dealing_high + dealing_low) / 2.0;
      UpsertHLine("SMC_SWEEP", sweep_extreme,
                  swept_low ? clrDodgerBlue : clrTomato);
      UpsertHLine("SMC_EQ", equilibrium, clrSilver);
      PrintFormat("Liquidity sweep recorded: %s in %s. Level %.5f, extreme %.5f.",
                  swept_low ? "buy setup" : "sell setup",
                  swept_low ? "discount" : "premium",
                  swept_low ? previous_day_low : previous_day_high,
                  sweep_extreme);
      status_text = "Balayage accepté. J'attends l'impulsion.";
      return;
     }

   if(setup_phase != PHASE_WAITING_FOR_STRUCTURE || !IsInSession(rates[1].time))
      return;

   double prior_swing_high = rates[2].high;
   double prior_swing_low = rates[2].low;
   for(int i = 3; i < InpSwingLookback + 2; i++)
     {
      prior_swing_high = MathMax(prior_swing_high, rates[i].high);
      prior_swing_low = MathMin(prior_swing_low, rates[i].low);
     }

   bool bullish_structure_break = setup_direction == DIRECTION_BUY &&
                                  rates[1].close > prior_swing_high &&
                                  rates[1].low > rates[3].high;
   bool bearish_structure_break = setup_direction == DIRECTION_SELL &&
                                  rates[1].close < prior_swing_low &&
                                  rates[1].high < rates[3].low;
   if(!bullish_structure_break && !bearish_structure_break)
      return;

   double average_range = AverageRange(rates, 2, 14);
   double average_volume = AverageTickVolume(rates, 2, 14);
   double body = MathAbs(rates[1].close - rates[1].open);
   if(average_range <= 0.0 || body < average_range * InpMinBodyRatio)
      return;
   if(!HasEffort(rates[1], average_volume, InpMinBreakVolumeRatio) ||
      IsAbsorption(rates[1], average_volume))
      return;

   double zone_lower = bullish_structure_break ? rates[3].high : rates[1].high;
   double zone_upper = bullish_structure_break ? rates[1].low : rates[3].low;
   double zone_size = zone_upper - zone_lower;
   if(zone_size < average_range * InpMinFvgRatio)
      return;

   double midpoint = (zone_lower + zone_upper) / 2.0;
   double equilibrium = (dealing_high + dealing_low) / 2.0;
   bool in_discount = setup_direction == DIRECTION_BUY && midpoint < equilibrium;
   bool in_premium = setup_direction == DIRECTION_SELL && midpoint > equilibrium;
   if(!in_discount && !in_premium)
      return;

   fvg_lower = zone_lower;
   fvg_upper = zone_upper;
   displacement_volume = rates[1].tick_volume;
   setup_phase = PHASE_WAITING_FOR_RETEST;
   setup_age_bars = 0;
   datetime zone_right = rates[1].time + 6 * PeriodSeconds(PERIOD_M5);
   UpsertZone("SMC_FVG", rates[3].time, zone_right, fvg_lower, fvg_upper,
              setup_direction == DIRECTION_BUY ? clrDodgerBlue : clrTomato);
   PrintFormat("%s displacement and FVG %.5f to %.5f. Waiting for the 50%% retest.",
               bullish_structure_break ? "Bullish" : "Bearish",
               fvg_lower, fvg_upper);
   status_text = "Impulsion acceptée. J'attends le retour au milieu.";
  }

void CheckFvgRetest()
  {
   if(setup_phase != PHASE_WAITING_FOR_RETEST)
      return;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;

   bool is_buy = setup_direction == DIRECTION_BUY;
   if(is_buy && tick.bid < fvg_lower)
     {
      Print("SMC setup cancelled: bullish FVG was filled before entry.");
      ResetSetup();
      return;
     }
   if(!is_buy && tick.ask > fvg_upper)
     {
      Print("SMC setup cancelled: bearish FVG was filled before entry.");
      ResetSetup();
      return;
     }

   if(!IsInSession(TimeCurrent()))
      return;

   double midpoint = (fvg_lower + fvg_upper) / 2.0;
   double entry = is_buy ? tick.ask : tick.bid;
   bool reached_midpoint = is_buy ? entry <= midpoint : entry >= midpoint;
   bool still_inside = entry >= fvg_lower && entry <= fvg_upper;
   if(!reached_midpoint || !still_inside)
      return;

   double stop_buffer = InpSweepBufferPoints * _Point;
   double stop = is_buy ? sweep_extreme - stop_buffer
                        : sweep_extreme + stop_buffer;
   double risk_distance = is_buy ? entry - stop : stop - entry;
   if(risk_distance <= 0.0)
     {
      Print("SMC signal skipped: stop is not beyond the entry.");
      ResetSetup();
      return;
     }

   double raw_target = is_buy ? entry + risk_distance * InpRewardRiskRatio
                              : entry - risk_distance * InpRewardRiskRatio;
   double opposing_liquidity = is_buy ? dealing_high : dealing_low;
   double target = raw_target;
   if(is_buy && raw_target > opposing_liquidity)
      target = opposing_liquidity - stop_buffer;
   if(!is_buy && raw_target < opposing_liquidity)
      target = opposing_liquidity + stop_buffer;

   double reward_distance = is_buy ? target - entry : entry - target;
   double actual_rr = reward_distance / risk_distance;
   if(reward_distance <= 0.0 || actual_rr + 1e-8 < InpMinRewardRisk)
     {
      PrintFormat("SMC signal skipped: room to the next liquidity is only 1:%.2f.",
                  actual_rr);
      ResetSetup();
      return;
     }

   int price_digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   stop = NormalizeDouble(stop, price_digits);
   target = NormalizeDouble(target, price_digits);
   last_acted_day = DayOf(TimeCurrent());

   PrintFormat("%s SMC retest at the FVG midpoint. Entry %.5f, stop %.5f, "
               "target %.5f (1:%.2f).",
               is_buy ? "Buy" : "Sell", entry, stop, target, actual_rr);

   if(DailyLossReached())
     {
      Print("SMC signal skipped: daily loss limit reached.");
      status_text = "Perte du jour atteinte. Je m'arrête.";
      ResetSetup();
      return;
     }

   if(!InpEnableTrading)
     {
      Print("Signal complet. Envoi d'ordres fermé : aucun ordre envoyé.");
      status_text = "Signal complet. Envoi d'ordres fermé.";
      ResetSetup();
      return;
     }

   if(AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO)
     {
      Print("Order blocked: this robot sends orders only on a demo account.");
      status_text = "Compte réel : aucun ordre. Le prix suivi est quand même le prix actuel.";
      ResetSetup();
      return;
     }

   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ||
      !MQLInfoInteger(MQL_TRADE_ALLOWED))
     {
      Print("SMC signal skipped: trading is blocked in the terminal.");
      status_text = "Signal complet. MetaTrader bloque l'envoi.";
      ResetSetup();
      return;
     }

   if(!IsSpreadAcceptable())
     {
      ResetSetup();
      return;
     }

   if(HasOpenPositionOnSymbol())
     {
      Print("SMC signal skipped: a position is already open on this symbol.");
      ResetSetup();
      return;
     }

   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   long stop_level_points = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minimum_stop_distance = stop_level_points * point;
   if(MathAbs(entry - stop) < minimum_stop_distance ||
      MathAbs(target - entry) < minimum_stop_distance)
     {
      Print("SMC signal skipped: stop or target is inside the broker's "
            "minimum stop distance.");
      ResetSetup();
      return;
     }

   double volume = CalculateRiskBasedVolume(entry, stop);
   if(volume <= 0.0)
     {
      Print("SMC signal skipped: calculated volume is below the symbol minimum "
            "or symbol risk data is unavailable.");
      ResetSetup();
      return;
     }

   bool sent = is_buy
               ? trade.Buy(volume, _Symbol, 0.0, stop, target, "SMC FVG retest")
               : trade.Sell(volume, _Symbol, 0.0, stop, target, "SMC FVG retest");
   uint retcode = trade.ResultRetcode();
   if(!sent || (retcode != TRADE_RETCODE_DONE &&
                retcode != TRADE_RETCODE_PLACED))
     {
      PrintFormat("Order was not confirmed. Retcode %u: %s",
                  retcode, trade.ResultRetcodeDescription());
      ResetSetup();
      return;
     }

   PrintFormat("Order accepted: %s %.2f lots; order %I64u.",
               is_buy ? "BUY" : "SELL", volume, trade.ResultOrder());
   status_text = "Ordre envoyé. Stop et objectif sont placés. Je n'y touche plus.";
   ResetSetup();
  }

int OnInit()
  {
   if(_Period != PERIOD_M5)
     {
      Print("Attach this experimental EA to a GOLD M5 chart.");
      return INIT_PARAMETERS_INCORRECT;
     }

   string symbol_name = _Symbol;
   StringToUpper(symbol_name);
   if(StringFind(symbol_name, "GOLD") < 0 &&
      StringFind(symbol_name, "XAU") < 0)
     {
      PrintFormat("Symbol %s does not look like GOLD/XAU. Initialization stopped.",
                  _Symbol);
      return INIT_PARAMETERS_INCORRECT;
     }

   if(InpRiskPercent <= 0.0 || InpRiskPercent > 0.5 ||
      InpRewardRiskRatio <= 0.0 || InpMinRewardRisk <= 0.0 ||
      InpMinRewardRisk > InpRewardRiskRatio || InpSwingLookback < 2 ||
      InpSetupExpiryBars < 1 || InpSweepBufferPoints < 0 ||
      InpMaxSpreadPoints < 1 || InpDeviationPoints < 0 ||
      InpMinBodyRatio <= 0.0 || InpMinFvgRatio <= 0.0 ||
      InpMinSweepVolumeRatio <= 0.0 || InpMinBreakVolumeRatio <= 0.0 ||
      InpMaxTestVolumeRatio <= 0.0 ||
      InpMaxDailyLossPercent <= 0.0 || InpMaxDailyLossPercent > 2.0 ||
      (InpUseSessionFilter &&
       (InpSessionStartHour < 0 || InpSessionEndHour > 24 ||
        InpSessionStartHour >= InpSessionEndHour)))
     {
      Print("Invalid inputs. Risk must be > 0 and <= 0.5%; check other limits.");
      return INIT_PARAMETERS_INCORRECT;
     }

   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpDeviationPoints);
   if(!trade.SetTypeFillingBySymbol(_Symbol))
     {
      PrintFormat("Could not set the broker's filling mode for %s.", _Symbol);
      return INIT_FAILED;
     }

   last_bar_time = iTime(_Symbol, PERIOD_M5, 0);
   UpdateDayBaseline();
   status_text = "Prix actuel. Pas de position pour l'instant.";
   PublishStatus();
   PrintFormat("SMC_GOLD_Test 1.21 on the live %s M5 price. Orders %s. Demo only. Risk %.2f%%.",
               _Symbol,
               (InpEnableTrading ? "OPEN" : "CLOSED"),
               InpRiskPercent);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   Comment("");
  }

void OnTick()
  {
   UpdateDayBaseline();
   datetime current_bar_time = iTime(_Symbol, PERIOD_M5, 0);
   if(current_bar_time > 0 && current_bar_time != last_bar_time)
     {
      last_bar_time = current_bar_time;
      ProcessClosedBar();
     }

   CheckFvgRetest();
   PublishStatus();
  }
