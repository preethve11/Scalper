/**
 * Live runner: streams price from Binance, builds 1m candles, generates signals,
 * and executes swaps via Jupiter (dry or live per TRADE_MODE).
 * Uses config for confidence threshold, risk sizing, and stop/limit (when implemented).
 */

import { streamLivePrice } from '../data/binanceProvider';
import { SignalGenerator } from '../ai/signal';
import { getSolscanWhaleIndex } from '../ai/solscanWhaleIndex';
import { Logger } from '../core/logger';
import { TradeSimulator } from './tradeSimulator';
import { executeSwapLive } from './liveExecutor';
import { TOKEN_MINTS } from '../config/tokenMap';
import { getLivePrice } from '../data/priceFeed';
import { getConfig } from '../config/loadConfig';
import { getPositionSizeUSD } from './risk';

const logger = new Logger('LiveRunner');

type Candle = { open: number; high: number; low: number; close: number; volume: number; startTime: number };
const candles: Candle[] = [];
let currentCandle: Candle | null = null;

const INTERVAL_MS = 60_000;

function updateCandle(price: number, volume: number): void {
  const now = Date.now();
  if (!currentCandle) {
    currentCandle = { open: price, high: price, low: price, close: price, volume, startTime: now };
    return;
  }
  if (now - currentCandle.startTime >= INTERVAL_MS) {
    candles.push(currentCandle);
    if (candles.length > 100) candles.shift();
    currentCandle = { open: price, high: price, low: price, close: price, volume, startTime: now };
  } else {
    currentCandle.high = Math.max(currentCandle.high, price);
    currentCandle.low = Math.min(currentCandle.low, price);
    currentCandle.close = price;
    currentCandle.volume += volume;
  }
}

function normalizeToBaseSymbol(symbolOrPair: string): string {
  return symbolOrPair.replace(/USDT$/i, '').toUpperCase();
}

/**
 * Start live runner for a pair (e.g. SOLUSDT).
 * BUY = swap USDC -> SOL; SELL = swap SOL -> USDC.
 */
export async function startLiveRunner(symbolPair: string = 'SOLUSDT'): Promise<void> {
  const cfg = getConfig();
  const minConfidence = cfg.strategy.minConfidenceToExecute;
  const initialBalance = cfg.backtest.initialBalanceUSD;

  logger.info(`[LiveRunner] Starting for ${symbolPair} (minConfidence=${minConfidence})`);

  const whaleIndex = await getSolscanWhaleIndex('SOL').catch(() => 0);
  logger.info(`[SolscanWhales] Whale Index for SOL: ${whaleIndex}`);

  const baseSymbol = normalizeToBaseSymbol(symbolPair);
  const signalGen = new SignalGenerator();
  const simulator = new TradeSimulator(initialBalance);

  let lastStatsLog = Date.now();
  streamLivePrice(baseSymbol, async (price: number) => {
    logger.debug(`[LiveRunner] Tick ${symbolPair}: ${price}`);
    updateCandle(price, 0);

    const signal = await signalGen.generateSignal(baseSymbol, price, 0);
    if (signal.action === 'BUY' || signal.action === 'SELL') {
      simulator.handleSignal(signal.action, price);
    }

    if (signal.action === 'HOLD' || signal.confidence < minConfidence) {
      if (Date.now() - lastStatsLog >= 5 * 60_000) {
        lastStatsLog = Date.now();
        logger.info(JSON.stringify(simulator.getStats(), null, 2));
      }
      return;
    }

    const notionalUSD = getPositionSizeUSD(initialBalance) || 100;
    const priceHint = await getLivePrice('SOL').catch(() => price);

    if (signal.action === 'BUY') {
      // BUY base (e.g. SOL): spend USDC to get SOL
      const inputMint = TOKEN_MINTS.USDC;
      const outputMint = TOKEN_MINTS[baseSymbol] || TOKEN_MINTS.SOL;
      const execRes = await executeSwapLive({
        inputMint,
        outputMint,
        notionalUSD,
        priceHint,
        useSolAsInput: false,
      });
      if (execRes.success) {
        logger.info(`Execution BUY success: ${JSON.stringify(execRes)}`);
      } else {
        logger.warn(`Execution BUY failed: ${execRes.reason} ${execRes.details ? JSON.stringify(execRes.details) : ''}`);
      }
    } else {
      // SELL base: spend SOL to get USDC
      const inputMint = TOKEN_MINTS.SOL;
      const outputMint = TOKEN_MINTS.USDC;
      const execRes = await executeSwapLive({
        inputMint,
        outputMint,
        notionalUSD,
        priceHint,
        useSolAsInput: true,
      });
      if (execRes.success) {
        logger.info(`Execution SELL success: ${JSON.stringify(execRes)}`);
      } else {
        logger.warn(`Execution SELL failed: ${execRes.reason} ${execRes.details ? JSON.stringify(execRes.details) : ''}`);
      }
    }

    if (Date.now() - lastStatsLog >= 5 * 60_000) {
      lastStatsLog = Date.now();
      logger.info(JSON.stringify(simulator.getStats(), null, 2));
    }
  });
}
