/**
 * Backtest CLI. Run via:
 *   npx tsx src/backtest/runBacktest.ts [symbol] [fromISO] [toISO]
 *   npm run backtest  (uses index --backtest, defaults: SOL, last 30d)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { runStrategy } from './strategyEngine';
import { getSolscanWhaleIndex } from '../ai/solscanWhaleIndex';
import { getHistoricalData } from '../data/priceFeed';

function generateSyntheticData(fromISO: string, toISO: string): Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> {
  const from = new Date(fromISO).getTime();
  const to = new Date(toISO).getTime();
  const intervalMs = 24 * 60 * 60 * 1000;
  let price = 100;
  const out: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  for (let t = from; t <= to; t += intervalMs) {
    const change = (Math.random() - 0.5) * 0.04;
    const open = price;
    price = Math.max(0.0001, price * (1 + change));
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = 1000 + Math.random() * 5000;
    out.push({ time: t, open, high, low, close, volume });
  }
  return out;
}

export async function runBacktestCLI(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const tokenMint = args[0] ?? process.env.BACKTEST_SYMBOL ?? 'SOL';
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromISO = args[1] ?? fromDate.toISOString().slice(0, 10);
  const toISO = args[2] ?? toDate.toISOString().slice(0, 10);

  const symbol = tokenMint.toUpperCase();
  console.log(`📈 Backtest ${symbol} from ${fromISO} to ${toISO}`);

  let data: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  try {
    data = await getHistoricalData(symbol, fromISO, toISO);
  } catch (e) {
    console.warn('⚠️ Historical data load failed, using synthetic data.');
  }
  if (!data?.length) {
    data = generateSyntheticData(fromISO, toISO);
  }
  console.log(`✅ Loaded ${data.length} candles`);

  try {
    const wsi = await getSolscanWhaleIndex(symbol);
    console.log(`🐋 Whale Index: ${wsi}`);
  } catch (e) {
    console.warn('⚠️ Whale Index unavailable:', (e as Error).message);
  }

  const results = await runStrategy(symbol, data);
  console.log('\n--- Backtest results ---');
  console.log(JSON.stringify(results, null, 2));
  console.log('\n--- Performance summary ---');
  console.log(`Win rate: ${results.stats.winRatePct.toFixed(2)}%`);
  console.log(`Sharpe ratio: ${results.stats.sharpeRatio.toFixed(4)}`);
  console.log(`Max drawdown: ${results.stats.maxDrawdownPct.toFixed(2)}%`);
  console.log(`Total return: ${results.stats.totalReturnPct.toFixed(2)}%`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (args.length < 3) {
    console.error('Usage: npx tsx src/backtest/runBacktest.ts <symbol> <fromISO> <toISO>');
    console.error('Example: npx tsx src/backtest/runBacktest.ts SOL 2024-01-01 2024-01-31');
    process.exit(1);
  }
  await runBacktestCLI();
}

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].includes('runBacktest') || process.argv[1].includes('backtest'));
if (isDirectRun) {
  main().catch((err) => {
    console.error('runBacktest failed:', err);
    process.exit(1);
  });
}


