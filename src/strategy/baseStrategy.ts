/**
 * Base strategy: Whale Index only (Solscan).
 * Optional entry point; live path uses SignalGenerator (TA + Whale) in liveRunner.
 */

import { getSolscanWhaleIndex } from '../ai/solscanWhaleIndex';
import { getConfig } from '../config/loadConfig';

/** Whale index is 0–100 (share of top 10 holders). Above threshold = BUY bias, below = SELL. */
const WSI_BUY_THRESHOLD = 50;
const WSI_SELL_THRESHOLD = 30;

export async function generateSignal(symbol: string, _candle: unknown, _from: Date, _to: Date): Promise<'BUY' | 'SELL' | 'HOLD'> {
  const cfg = getConfig();
  const buyThreshold = cfg.strategy.whaleBullishThreshold ?? WSI_BUY_THRESHOLD;
  const wsi = await getSolscanWhaleIndex(symbol);
  if (wsi >= buyThreshold) return 'BUY';
  if (wsi <= WSI_SELL_THRESHOLD) return 'SELL';
  return 'HOLD';
}


