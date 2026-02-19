# Scalperr

**Solana scalping bot** — TypeScript, Jupiter DEX, Binance price feed, technical indicators + whale index. Configurable risk, backtesting with Sharpe/win rate/drawdown, dry-run and live execution.

---

## Strategy logic

### Live path (default)

- **Data**: 1m candles built from **Binance** WebSocket (e.g. SOLUSDT).
- **Indicators**: RSI (14), MACD (12/26), Bollinger Bands (20, 2σ), SMA 20/50, EMA 12/26, volume, **Solscan Whale Index** (top 10 holders’ share).
- **Entry**: BUY when composite buy score > 0.3 and buy score > sell score; SELL when sell score > buy score and > 0.3. Score built from RSI (oversold/overbought), MACD cross, price vs Bollinger, MAs, volume, and whale index.
- **Execution filter**: Only place a live (or dry-run) swap when **confidence ≥ minConfidenceToExecute** (default 0.7), configurable in `config/config.yaml` or env.
- **Exits**: No explicit stop loss or take profit in the current live loop; SL/TP are defined in config and risk module for future use (e.g. exit on next tick when price crosses SL/TP).
- **Position sizing**: From `config` — either **fixed notional** (e.g. 100 USD) or **% of balance** (`maxTradePctPerTrade`). Live runner uses `getPositionSizeUSD(initialBalance)` (from `config.backtest.initialBalanceUSD` when no live balance feed).
- **Swap direction**: BUY base (e.g. SOL) = swap USDC → SOL; SELL base = swap SOL → USDC.

### Backtest path (RSI-only)

- **Data**: Binance klines (or synthetic if fetch fails) for the given symbol and date range.
- **Strategy**: RSI(14). **Entry**: RSI < `rsiBuyBelow` (default 30). **Exit**: RSI > `rsiSellAbove` (default 70). No SL/TP in backtest.
- **Metrics**: Total return %, win rate %, **Sharpe ratio** (from trade returns), **max drawdown %**, avg PnL per trade, winning/losing counts. All from `config.backtest` (initial balance, RSI thresholds).

### Timeframe

- **Live**: 1-minute candles built from the stream; indicators need ~50+ points (config: `minCandleHistory`).
- **Backtest**: Uses whatever candles `getHistoricalData()` returns (e.g. 1h Binance klines); RSI uses 14 periods.

---

## Setup

### Prerequisites

- **Node.js** ≥ 18
- **npm** or **yarn**

### Install

```bash
git clone <repo-url>
cd scalperr
npm install
```

### Config

1. **Environment (your keys stay private)**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your own `PRIVATE_KEY` and optional API keys. `.env` is gitignored—it never gets committed, so only you see your keys on your machine.

2. **YAML (optional)**  
   Edit `config/config.yaml` to change strategy thresholds, risk (SL/TP, position size), backtest params, and execution (slippage, retries). Env vars override YAML where documented.

### Build

```bash
npm run build
```

---

## How to backtest

- **Via npm (recommended)**  
  Uses defaults: symbol from `BACKTEST_SYMBOL` or `SOL`, last 30 days, config from `config/config.yaml` and env:
  ```bash
  npm run backtest
  ```

- **CLI with dates**
  ```bash
  npx tsx src/backtest/runBacktest.ts SOL 2024-01-01 2024-01-31
  ```
  Output: trades, win rate, Sharpe ratio, max drawdown, total return.

Historical data is from Binance; if the request fails, the script falls back to synthetic data (clearly warned in logs).

---

## How to run live

1. Set **TRADE_MODE=dry** in `.env` for dry-run (no real swaps), or **TRADE_MODE=live** for live execution.
2. Ensure **PRIVATE_KEY** and **RPC_URL** (and optionally **JUPITER_API_URL**) are set.
3. Start the bot (starts Binance stream and live runner for SOLUSDT by default):
   ```bash
  npm run dev
  # or
  node dist/index.js
  ```
4. Dry-run: logs “TRADE_MODE != live -> dry-run” and simulated execution. Live: signs and sends Jupiter swap transactions.

---

## Project layout

```
scalperr/
├── config/
│   └── config.yaml       # Strategy, risk, backtest, execution
├── src/
│   ├── config/           # Env, schema, loadConfig
│   ├── core/              # Logger, wallet, connection
│   ├── ai/                # Signal (TA + whale), sentiment, solscanWhaleIndex
│   ├── strategy/          # baseStrategy (whale-only), whalePulse
│   ├── engine/            # risk, liveExecutor, liveRunner, tradeSimulator
│   ├── backtest/          # strategyEngine (RSI), runBacktest, engine
│   ├── dex/               # Jupiter
│   ├── data/              # Binance provider, priceFeed
│   └── index.ts           # Entry: --backtest → backtest CLI, else live runner
├── .env.example
├── package.json
└── README.md
```

---

## Risk disclaimer

**This software is for educational and research purposes only.** Cryptocurrency and token trading carry substantial risk of loss. Past backtest or dry-run results do not guarantee future performance. Only risk capital you can afford to lose. The authors and contributors are not responsible for any financial losses from use of this bot. Use live mode at your own risk and ensure you understand the strategy, execution, and fees/slippage.

---

## Security notes

- Never commit `.env` or private keys.
- Prefer env vars (and optionally `config.yaml`) for sensitive or environment-specific settings.
- For production, consider a dedicated wallet and rate limits / monitoring.

---

## License

ISC (see `package.json`).
