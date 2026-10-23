# Experimental MQL5 SMC EA

`SMC_GOLD_Test.mq5` is a learning prototype for the broker's GOLD/XAU symbol on
M5. It tests one explicitly defined setup:

1. During server hours 8:00–17:00, price sweeps the previous day high or low
   and closes back inside that level. The sweep candle must also show effort:
   tick volume at least `InpMinSweepVolumeRatio` times the recent average.
2. A later candle must displace with a real body, leave a three-candle FVG in
   discount for a buy or premium for a sell, and show volume behind the move.
   A lot of volume with almost no progress is treated as absorption and ignored.
3. The retest of the FVG midpoint must be quieter than the impulse. The stop
   stays beyond the sweep. The target is `InpRewardRiskRatio`, capped at the
   opposite day level, and skipped below `InpMinRewardRisk`. One signal per
   day. A new order is refused once the day is down `InpMaxDailyLossPercent`.

Retail gold candles have no exchange order book. Volume here is tick volume,
an effort-versus-result proxy in the Wyckoff sense, not a record of
institutional orders. These rules do not prove a profitable strategy. The
daily levels use the broker's D1 candles, so the session boundary may differ
between brokers.

## Install and test

1. In MT5, choose **File → Open Data Folder**, then open `MQL5/Experts`.
2. Copy `SMC_GOLD_Test.mq5` there and open it in MetaEditor.
3. Compile with **F7**. Attach the resulting EA to the broker's exact GOLD/XAU
   symbol on an M5 chart.
4. On a live chart the EA follows the current price. It can send orders only on a demo account.
   The default risk is 0.25% per order, capped at 0.5%. The EA sizes down to
   the volume step, allows one signal a day, stops new orders after a 1% daily
   loss, skips an open position on the symbol, and does not use martingale.
   Stop and target are sent with the order and are not moved.

The EA sends no orders by default. If enabled, it can send orders and cause
losses. Tester results do not predict future performance; spreads, commissions,
slippage, execution, and broker symbol settings can materially change results.
