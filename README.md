# Scalperr

**Scalperr** is a configurable, automated trading bot for **Solana** that scalps tokens using technical analysis (TA), on-chain whale metrics, and optional AI sentiment. It supports **backtesting** (with Sharpe ratio, win rate, drawdown) and **live or dry-run** execution via Jupiter DEX.

---

## What It Is

- **Automated scalping bot** — Monitors price and indicators, generates BUY/SELL signals, and can execute swaps on Solana (or simulate them).
- **Multi-factor signals** — Combines RSI, MACD, Bollinger Bands, moving averages, volume, and a **Solscan Whale Index** (top-holder concentration) into a single confidence-scored signal.
- **Dual mode** — **Live path**: 1-minute candles from Binance WebSocket + TA + whale index; **Backtest path**: historical Binance klines with an RSI-only strategy and full performance metrics.
- **Risk-aware** — Configurable position sizing (fixed notional or % of balance), optional stop-loss/take-profit, min balance, and a confidence threshold so only high-conviction signals trigger execution.

---

## Why It Exists

- **Systematic execution** — Removes emotional decisions; entries and exits follow defined rules.
- **Quantifiable strategy** — Backtests give Sharpe ratio, win rate, and max drawdown so you can judge a strategy before risking capital.
- **On-chain edge** — Whale index and (optional) Helius/Grok integration add context beyond pure price/volume.
- **Solana-native** — Built for Jupiter DEX and Solana RPC; fits into a SOL/token workflow without CEX dependency for execution (Binance is used only as a price/klines source).

---

## How It Works

### High-level flow

1. **Data** — Live: Binance WebSocket → 1m candles. Backtest: Binance (or synthetic) historical klines.
2. **Signals** — Live: `SignalGenerator` computes TA (RSI, MACD, Bollinger, SMAs/EMAs), fetches Solscan Whale Index, and outputs BUY/SELL/HOLD with a confidence score (0–1). Backtest: RSI-only (oversold buy, overbought sell).
3. **Filter** — Live: A trade is only executed if `confidence ≥ minConfidenceToExecute` (e.g. 0.7) and other risk checks pass.
4. **Execution** — Live: Jupiter swap (USDC↔SOL or configured pair); dry-run logs the same flow without sending transactions. Backtest: simulated PnL and metrics.

### Components

| Component | Role |
|----------|------|
| **SignalGenerator** | TA + whale index → composite buy/sell score and confidence |
| **Live runner** | Consumes 1m candles, calls signal generator, applies risk and confidence filter, triggers Jupiter swap or dry-run |
| **Backtest engine** | Runs RSI strategy over historical candles; computes Sharpe, win rate, max drawdown, total return |
| **Jupiter DEX** | Quote and execute swaps on Solana |
| **Config** | `config/config.yaml` + `.env` for strategy thresholds, risk, execution, and API keys |

---

## Strategies (in detail)

### Live strategy: TA + Whale Index

- **Data**: 1-minute candles built from the Binance stream (e.g. SOLUSDT).
- **Indicators**: RSI(14), MACD(12/26), Bollinger Bands(20, 2σ), SMA 20/50, EMA 12/26, volume, **Solscan Whale Index** (0–100; share of supply held by top 10 holders).
- **Scoring**:
  - **Buy score**: RSI oversold (<30), MACD bullish cross, price at lower Bollinger, price above MAs, EMA 12 > 26, high volume, whale index above threshold (e.g. 50) add to the score.
  - **Sell score**: RSI overbought (>70), MACD bearish cross, price at upper Bollinger, price below MAs, EMA 12 < 26, low whale support add to the score.
- **Entry**: **BUY** when buy score > 0.3 and buy score > sell score; **SELL** when sell score > buy score and > 0.3. Whale index can boost or reduce confidence (e.g. +0.1 when WSI > 50).
- **Execution**: A swap is only placed (or simulated in dry-run) when **confidence ≥ minConfidenceToExecute** (default 0.7). Position size comes from config: fixed notional (USD) or % of balance (`maxTradePctPerTrade`).
- **Swap direction**: BUY base (e.g. SOL) = USDC → SOL; SELL = SOL → USDC.

### Backtest strategy: RSI-only

- **Data**: Binance klines (or synthetic if fetch fails) for the chosen symbol and date range.
- **Rules**: **Entry** when RSI(14) < `rsiBuyBelow` (default 30). **Exit** when RSI > `rsiSellAbove` (default 70). No SL/TP in this backtest.
- **Metrics**: Total return %, win rate %, **Sharpe ratio** (from trade returns), **max drawdown %**, average PnL per trade, winning/losing counts. All use `config.backtest` (initial balance, RSI thresholds, commission).

---

## How to Use It

### Prerequisites

- **Node.js** ≥ 18  
- **npm** or **yarn**

### 1. Clone and install

```bash
git clone https://github.com/preethve11/Scalper.git
cd scalperr
npm install
```

### 2. Configure environment (required)

Your keys stay on your machine; they are never committed.

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- **`PRIVATE_KEY`** — Solana wallet private key (JSON array, e.g. from Phantom export).
- **`RPC_URL`** — Solana RPC endpoint (e.g. Helius, QuickNode).
- **`TRADE_MODE`** — `dry` (simulate) or `live` (real swaps).

Optional: `JUPITER_API_URL`, `HELIUS_API_KEY` / `HELIUS_URL`, `GROK_API_KEY` / `X_BEARER_TOKEN` for sentiment/on-chain features. See `.env.example` for all options.

### 3. Optional: tune strategy and risk

Edit **`config/config.yaml`** to adjust:

- Strategy: `entryThreshold`, `minConfidenceToExecute`, indicator periods, `whaleBullishThreshold`, `whaleConfidenceBoost`.
- Risk: `maxTradePctPerTrade`, `minBalanceUSD`, `stopLossPct`, `takeProfitPct`, `fixedNotionalUSD`.
- Backtest: `initialBalanceUSD`, `rsiBuyBelow`, `rsiSellAbove`, `commissionPct`.
- Execution: `slippageBps`, `maxRetries`, `retryDelayMs`.

Environment variables override YAML where documented (e.g. in `.env.example`).

### 4. Build

```bash
npm run build
```

### 5. Backtest (recommended before live)

Uses `BACKTEST_SYMBOL` (default SOL) and last 30 days by default:

```bash
npm run backtest
```

With custom symbol and date range:

```bash
npx tsx src/backtest/runBacktest.ts SOL 2024-01-01 2024-01-31
```

Output includes: number of trades, win rate, Sharpe ratio, max drawdown, total return %. Historical data is from Binance; if the request fails, the script falls back to synthetic data (logged).

### 6. Run live (or dry-run)

1. In `.env`, set **`TRADE_MODE=dry`** to simulate, or **`TRADE_MODE=live`** for real execution.
2. Ensure **`PRIVATE_KEY`** and **`RPC_URL`** (and optionally **`JUPITER_API_URL`**) are set.
3. Start the bot (Binance stream + live runner for SOLUSDT by default):

```bash
npm run dev
# or
node dist/index.js
```

- **Dry-run**: Logs “TRADE_MODE != live -> dry-run” and simulated execution.  
- **Live**: Signs and sends Jupiter swap transactions when confidence and risk checks pass.

---

## Project layout

```
scalperr/
├── config/
│   └── config.yaml       # Strategy, risk, backtest, execution
├── src/
│   ├── config/           # Env, schema, loadConfig
│   ├── core/             # Logger, wallet, connection
│   ├── ai/               # Signal (TA + whale), sentiment, solscanWhaleIndex
│   ├── strategy/         # baseStrategy (whale-only), whalePulse
│   ├── engine/           # risk, liveExecutor, liveRunner, tradeSimulator
│   ├── backtest/         # strategyEngine (RSI), runBacktest, engine
│   ├── dex/              # Jupiter
│   ├── data/             # Binance provider, priceFeed
│   └── index.ts          # Entry: --backtest → backtest CLI, else live runner
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
- Prefer environment variables (and optionally `config.yaml`) for sensitive or environment-specific settings.
- For production, use a dedicated wallet and consider rate limits and monitoring.

---

## License

ISC (see `package.json`).
