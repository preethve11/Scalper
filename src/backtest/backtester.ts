/**
 * Backtester - Simulates trades using signalEngine over historical OHLCV.
 *
 * Limitations:
 * - Uses close/high/low of candles; does not model intra-candle path.
 * - Simple slippage and fee models; plug in realistic liquidity/impact models where noted.
 * - evaluateToken may call external services; consider caching for speed in large runs.
 */

import { fetchRawTrades, buildOHLCV, Trade, OHLCV } from './historyFetcher';
import { evaluateToken } from '../engine/signalEngine';

export interface BacktestConfig {
  intervalMins?: number; // Candle interval in minutes (default 5)
  initialBalance?: number; // Starting capital (default 10_000)
  feePct?: number; // e.g., 0.0025 for 0.25%
  slippagePct?: number; // e.g., 0.002 for 0.2%
  positionPct?: number; // fraction of balance per trade (default 0.1)
  takeProfitPct?: number; // TP from entry (default 0.05)
  stopLossPct?: number; // SL from entry (default 0.03)
  maxPositions?: number; // currently only 1 long supported; reserved for future
  randomSeed?: number; // deterministic slippage
}

export interface ExecutedTrade {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  size: number;
  feesPaid: number;
  pnl: number;
  pnlPct: number;
  reason: string;
}

export interface BacktestReport {
  tokenMint: string;
  fromISO: string;
  toISO: string;
  config: Required<BacktestConfig>;
  trades: ExecutedTrade[];
  equityCurve: Array<{ t: number; equity: number }>;
  stats: {
    finalEquity: number;
    totalReturnPct: number;
    maxDrawdownPct: number;
    numTrades: number;
    winRatePct: number;
    avgPnL: number;
  };
  csv: string;
}

interface Position {
  entryTime: number;
  entryPrice: number;
  size: number; // in tokens
  cost: number; // notional at entry
  feesPaid: number;
  tp: number; // take profit price
  sl: number; // stop loss price
}

function lcg(seed: number) {
  let state = seed >>> 0;
  return function rand(): number {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function toCsv(trades: ExecutedTrade[]): string {
  const header = 'entryTime,entryPrice,exitTime,exitPrice,size,feesPaid,pnl,pnlPct,reason';
  const rows = trades.map(t => [
    new Date(t.entryTime).toISOString(),
    t.entryPrice.toFixed(8),
    new Date(t.exitTime).toISOString(),
    t.exitPrice.toFixed(8),
    t.size.toFixed(8),
    t.feesPaid.toFixed(6),
    t.pnl.toFixed(6),
    (t.pnlPct * 100).toFixed(3) + '%',
    t.reason.replace(/[,\n]/g, ' '),
  ].join(','));
  return [header, ...rows].join('\n');
}

function computeDrawdown(equityCurve: Array<{ t: number; equity: number }>): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? (peak - p.equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

export async function runBacktest(
  tokenMint: string,
  fromISO: string,
  toISO: string,
  cfg: BacktestConfig = {}
): Promise<BacktestReport> {
  const config: Required<BacktestConfig> = {
    intervalMins: cfg.intervalMins ?? 5,
    initialBalance: cfg.initialBalance ?? 10_000,
    feePct: cfg.feePct ?? 0.0025,
    slippagePct: cfg.slippagePct ?? 0.002,
    positionPct: cfg.positionPct ?? 0.1,
    takeProfitPct: cfg.takeProfitPct ?? 0.05,
    stopLossPct: cfg.stopLossPct ?? 0.03,
    maxPositions: cfg.maxPositions ?? 1,
    randomSeed: cfg.randomSeed ?? 42,
  };

  // Fetch history and derive OHLCV
  const trades: Trade[] = await fetchRawTrades(tokenMint, fromISO, toISO);
  const candles: OHLCV[] = buildOHLCV(trades, config.intervalMins);

  const rand = lcg(config.randomSeed);
  let balance = config.initialBalance;
  let pos: Position | undefined;
  const executed: ExecutedTrade[] = [];
  const equityCurve: Array<{ t: number; equity: number }> = [];

  for (const c of candles) {
    // Evaluate signal using current close price as context
    const context = { price: c.close, volume: c.volume };
    const signal = await evaluateToken(tokenMint, context);

    // Position management: exit conditions first
    if (pos) {
      // Plug realistic liquidity models here: partial fills, depth-based slippage, etc.
      let exitReason: string | undefined;
      let exitPrice: number | undefined;

      // Check SL/TP intra-candle
      if (c.low <= pos.sl) {
        exitReason = 'stopLoss';
        exitPrice = Math.max(pos.sl, c.low) * (1 - rand() * config.slippagePct);
      } else if (c.high >= pos.tp) {
        exitReason = 'takeProfit';
        exitPrice = Math.min(pos.tp, c.high) * (1 - rand() * config.slippagePct);
      } else if (signal.action === 'sell') {
        exitReason = 'signalExit';
        exitPrice = c.close * (1 - rand() * config.slippagePct);
      }

      if (exitPrice && exitReason) {
        const notionalExit = exitPrice * pos.size;
        const fees = notionalExit * config.feePct;
        const pnl = notionalExit - pos.cost - fees; // long position PnL
        balance += notionalExit - fees;
        executed.push({
          entryTime: pos.entryTime,
          entryPrice: pos.entryPrice,
          exitTime: c.timestamp,
          exitPrice,
          size: pos.size,
          feesPaid: pos.feesPaid + fees,
          pnl,
          pnlPct: pos.cost > 0 ? pnl / pos.cost : 0,
          reason: exitReason,
        });
        pos = undefined;
      }
    }

    // Entry logic
    if (!pos && signal.action === 'buy') {
      const entryBase = c.close * (1 + rand() * config.slippagePct);
      const alloc = balance * config.positionPct;
      if (alloc > 0 && entryBase > 0) {
        const size = alloc / entryBase;
        const entryFees = alloc * config.feePct;
        const totalCost = alloc + entryFees;
        if (balance >= totalCost) {
          balance -= totalCost;
          pos = {
            entryTime: c.timestamp,
            entryPrice: entryBase,
            size,
            cost: alloc,
            feesPaid: entryFees,
            tp: entryBase * (1 + config.takeProfitPct),
            sl: entryBase * (1 - config.stopLossPct),
          };
        }
      }
    }

    // Mark-to-market equity at candle close
    const unrealized = pos ? (c.close * pos.size - pos.cost) : 0;
    const equity = balance + (pos ? pos.cost + unrealized : 0);
    equityCurve.push({ t: c.timestamp, equity });
  }

  // Close any open position at last close
  if (pos && candles.length > 0) {
    const last = candles[candles.length - 1];
    const exitPrice = last.close * (1 - rand() * config.slippagePct);
    const notionalExit = exitPrice * pos.size;
    const fees = notionalExit * config.feePct;
    const pnl = notionalExit - pos.cost - fees;
    balance += notionalExit - fees;
    executed.push({
      entryTime: pos.entryTime,
      entryPrice: pos.entryPrice,
      exitTime: last.timestamp,
      exitPrice,
      size: pos.size,
      feesPaid: pos.feesPaid + fees,
      pnl,
      pnlPct: pos.cost > 0 ? pnl / pos.cost : 0,
      reason: 'forceExitEndOfBacktest',
    });
    pos = undefined;
    const equity = balance;
    equityCurve.push({ t: last.timestamp, equity });
  }

  // Stats
  const finalEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : balance;
  const totalReturnPct = (finalEquity - config.initialBalance) / config.initialBalance;
  const maxDrawdownPct = computeDrawdown(equityCurve);
  const numTrades = executed.length;
  const wins = executed.filter(t => t.pnl > 0).length;
  const winRatePct = numTrades > 0 ? wins / numTrades : 0;
  const avgPnL = numTrades > 0 ? executed.reduce((s, t) => s + t.pnl, 0) / numTrades : 0;

  const csv = toCsv(executed);

  return {
    tokenMint,
    fromISO,
    toISO,
    config,
    trades: executed,
    equityCurve,
    stats: {
      finalEquity,
      totalReturnPct,
      maxDrawdownPct,
      numTrades,
      winRatePct,
      avgPnL,
    },
    csv,
  };
}

// CLI runnable entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const [, , tokenMint, fromISO, toISO] = process.argv;
    if (!tokenMint || !fromISO || !toISO) {
      console.error('Usage: node dist/backtest/backtester.js <tokenMint> <fromISO> <toISO>');
      process.exit(1);
    }
    try {
      const report = await runBacktest(tokenMint, fromISO, toISO, {});
      const s = report.stats;
      console.log('Backtest Summary');
      console.log(`Token: ${report.tokenMint}`);
      console.log(`Period: ${report.fromISO} -> ${report.toISO}`);
      console.log(`Trades: ${s.numTrades}, WinRate: ${(s.winRatePct * 100).toFixed(2)}%`);
      console.log(`Final Equity: ${s.finalEquity.toFixed(2)} (Return: ${(s.totalReturnPct * 100).toFixed(2)}%)`);
      console.log(`Max Drawdown: ${(s.maxDrawdownPct * 100).toFixed(2)}%`);
      // Print CSV to stdout if desired; pipe to a file from CLI
      // console.log('\nCSV:\n' + report.csv);
    } catch (e) {
      console.error('Backtest failed:', e);
      process.exit(1);
    }
  })();
}

export default runBacktest;


