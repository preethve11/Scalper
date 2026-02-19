/**
 * Backtest strategy: RSI-only scalping.
 * Entry: RSI < rsiBuyBelow (oversold). Exit: RSI > rsiSellAbove (overbought).
 * Uses config for initial balance and RSI thresholds; computes Sharpe, win rate, drawdown.
 */

import { RSI } from 'technicalindicators';
import { getConfig } from '../config/loadConfig';

export interface BacktestCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestTrade {
  type: 'BUY' | 'SELL';
  price: number;
  time: number;
  pnl?: number;
}

export interface BacktestStats {
  numTrades: number;
  finalEquity: number;
  initialEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  winRatePct: number;
  sharpeRatio: number;
  avgPnL: number;
  winningTrades: number;
  losingTrades: number;
}

export interface BacktestResult {
  tokenMint: string;
  stats: BacktestStats;
  trades: BacktestTrade[];
}

export async function runStrategy(symbol: string, candles: BacktestCandle[]): Promise<BacktestResult> {
  const cfg = getConfig().backtest;
  const period = 14;
  const rsiBuyBelow = cfg.rsiBuyBelow;
  const rsiSellAbove = cfg.rsiSellAbove;
  const initialEquity = cfg.initialBalanceUSD;

  if (!candles || candles.length < period + 1) {
    return {
      tokenMint: symbol,
      stats: {
        numTrades: 0,
        finalEquity: initialEquity,
        initialEquity,
        totalReturnPct: 0,
        maxDrawdownPct: 0,
        winRatePct: 0,
        sharpeRatio: 0,
        avgPnL: 0,
        winningTrades: 0,
        losingTrades: 0,
      },
      trades: [],
    };
  }

  const prices = candles.map((c) => c.close);
  const rsiValues = RSI.calculate({ period, values: prices });

  let balance = initialEquity;
  let position = 0;
  let entryPrice = 0;
  const trades: BacktestTrade[] = [];
  let peakEquity = balance;
  const returns: number[] = [];

  for (let i = period; i < candles.length; i++) {
    const candle = candles[i];
    const rsi = rsiValues[i - period];
    const price = candle.close;

    if (rsi < rsiBuyBelow && position === 0) {
      position = balance / Math.max(price, 1e-9);
      entryPrice = price;
      balance = 0;
      trades.push({ type: 'BUY', price, time: candle.time });
    }

    if (rsi > rsiSellAbove && position > 0) {
      const pnlPct = ((price - entryPrice) / entryPrice) * 100;
      balance = position * price;
      trades.push({
        type: 'SELL',
        price,
        time: candle.time,
        pnl: pnlPct,
      });
      returns.push(pnlPct);
      position = 0;
    }

    const equity = balance + position * price;
    if (equity > peakEquity) peakEquity = equity;
  }

  const lastPrice = candles[candles.length - 1].close;
  const finalEquity = balance + position * lastPrice;
  const totalReturnPct = ((finalEquity - initialEquity) / initialEquity) * 100;
  const maxDrawdownPct = peakEquity > 0 ? ((peakEquity - finalEquity) / peakEquity) * 100 : 0;

  const closedTrades = trades.filter((t) => t.pnl != null);
  const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = closedTrades.filter((t) => (t.pnl ?? 0) < 0).length;
  const winRatePct = closedTrades.length ? (wins / closedTrades.length) * 100 : 0;
  const avgPnL =
    closedTrades.length > 0
      ? closedTrades.reduce((a, t) => a + (t.pnl ?? 0), 0) / closedTrades.length
      : 0;

  const sharpeRatio = computeSharpeFromReturns(returns);

  return {
    tokenMint: symbol,
    stats: {
      numTrades: trades.length,
      finalEquity,
      initialEquity,
      totalReturnPct,
      maxDrawdownPct,
      winRatePct,
      sharpeRatio,
      avgPnL,
      winningTrades: wins,
      losingTrades: losses,
    },
    trades,
  };
}

function computeSharpeFromReturns(returns: number[], riskFreeRate = 0): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean - riskFreeRate) / std;
}

