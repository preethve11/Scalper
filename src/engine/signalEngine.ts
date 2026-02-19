/**
 * Signal Engine - Combines on-chain analytics, social sentiment, and TA into an action.
 *
 * Exports `evaluateToken` and several helpers to ease unit testing.
 *
 * TODOs for production hardening:
 * - Replace `onchainAnalyzer` stub with a real implementation.
 * - Provide actual time-series price data for TA calculations.
 * - Add retries/backoff and circuit-breaking for external calls.
 * - Persist/cache intermediate analytics for cost efficiency.
 */

import { getSentimentForToken } from '../ai/sentiment';
import { onchainAnalyzer } from './onchainAnalyzer';

export type EvaluationAction = 'buy' | 'hold' | 'sell';

export interface EvaluateContext {
  price: number;
  volume: number;
  // In the future, consider extending with time-series arrays for TA:
  // prices?: number[]; volumes?: number[]; timestamps?: number[];
}

export interface EvaluationDetails {
  onchain: {
    whaleScore: number;
    lpFlag: boolean;
    holderConcentration: number;
    weight: number;
  };
  sentiment: {
    rawScore: number; // [-1, 1]
    normalized: number; // normalization may be applied
    sourceCount: number;
    reason: string;
    weight: number;
  };
  ta: {
    score: number; // [-1, 1] or [0, 1] depending on design; we clamp downstream
    indicators: Record<string, unknown>;
    used: boolean;
    weight: number;
  };
  weights: {
    onchainWeight: number;
    sentimentWeight: number;
    taWeight: number;
  };
  compositeFormula: string;
}

export interface EvaluateResult {
  action: EvaluationAction;
  score: number; // composite score in [-1, 1]
  details: EvaluationDetails;
}

export interface OnchainAnalysis {
  whaleScore: number; // [0, 1]
  lpFlag: boolean;
  holderConcentration: number; // [0, 1]
}

// onchainAnalyzer is now imported from './onchainAnalyzer'

/**
 * Map raw sentiment score to desired scale.
 * If SENTIMENT_NORMALIZE is 'unit', map [-1, 1] -> [0, 1]. Otherwise, keep [-1, 1].
 */
export function normalizeSentiment(raw: number): number {
  const mode = process.env.SENTIMENT_NORMALIZE ?? 'raw';
  if (mode.toLowerCase() === 'unit') {
    // Convert [-1, 1] to [0, 1]
    return (raw + 1) / 2;
  }
  return raw; // keep original scale
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Compute the composite score from component scores and weights.
 * All weights and composition can be tuned via env:
 * - ONCHAIN_WEIGHT (default 0.4)
 * - SENTIMENT_WEIGHT (default 0.4)
 * - TA_WEIGHT (default 0.2)
 */
export function computeCompositeScore(params: {
  whaleScore: number; // typically [0, 1]
  sentimentScore: number; // either [-1, 1] or [0, 1] depending on normalization
  taScore: number; // typically [-1, 1] or [0, 1]
  weights?: { onchain?: number; sentiment?: number; ta?: number };
}): { score: number; weights: { onchainWeight: number; sentimentWeight: number; taWeight: number } } {
  const onchainWeight = Number(process.env.ONCHAIN_WEIGHT ?? params.weights?.onchain ?? 0.4);
  const sentimentWeight = Number(process.env.SENTIMENT_WEIGHT ?? params.weights?.sentiment ?? 0.4);
  const taWeight = Number(process.env.TA_WEIGHT ?? params.weights?.ta ?? 0.2);

  const raw = (onchainWeight * params.whaleScore)
    + (sentimentWeight * params.sentimentScore)
    + (taWeight * params.taScore);
  const score = clamp(raw, -1, 1);
  return { score, weights: { onchainWeight, sentimentWeight, taWeight } };
}

/**
 * Attempt to compute a simple TA score. If no time-series is available, returns 0.
 * This function is designed to be resilient when the `technicalindicators` package is missing.
 */
export async function computeTaScore(context?: EvaluateContext): Promise<{ score: number; indicators: Record<string, unknown>; used: boolean }> {
  if (!context || !Number.isFinite(context.price) || !Number.isFinite(context.volume)) {
    return { score: 0, indicators: {}, used: false };
  }

  // Placeholder: Without time-series, we cannot compute robust indicators.
  // TODO: Provide arrays of closes/volumes to compute RSI, MACD, SMA, etc.
  // We will attempt a minimal heuristic using current price/volume in the future.
  try {
    // Dynamic import keeps this optional; if package not installed, we skip TA.
    const ti = await import('technicalindicators');
    void ti;
    // Example (if closes are provided in the future):
    // const rsi = ti.RSI.calculate({ values: closes, period: 14 }).at(-1);
    // Map RSI to a [-1, 1] score: taScore = (50 - rsi) / -50, etc.
    // For now we do not have series, so return neutral.
    return { score: 0, indicators: {}, used: false };
  } catch {
    return { score: 0, indicators: {}, used: false };
  }
}

export function decideAction(score: number): EvaluationAction {
  if (score >= 0.65) return 'buy';
  if (score <= -0.5) return 'sell';
  return 'hold';
}

/**
 * Evaluate a token and produce a recommended action with an explainable breakdown.
 */
export async function evaluateToken(
  tokenMint: string,
  context?: EvaluateContext
): Promise<EvaluateResult> {
  const tokenSymbol = process.env.TOKEN_SYMBOL_OVERRIDE || tokenMint.substring(0, 6); // fallback symbol heuristic

  // 1) On-chain analysis
  const onchain = await onchainAnalyzer(tokenMint);
  const whaleScore = clamp(onchain.whaleScore, 0, 1);

  // 2) Social sentiment (Grok-backed via getSentimentForToken)
  const sentiment = await getSentimentForToken(tokenSymbol, tokenMint);
  const normalizedSentiment = normalizeSentiment(sentiment.score);

  // 3) TA indicators
  const ta = await computeTaScore(context);

  // 4) Composite scoring
  const { score: composite, weights } = computeCompositeScore({
    whaleScore,
    sentimentScore: normalizedSentiment,
    taScore: ta.score,
  });

  const action = decideAction(composite);

  const details: EvaluationDetails = {
    onchain: {
      whaleScore,
      lpFlag: onchain.lpFlag,
      holderConcentration: clamp(onchain.holderConcentration, 0, 1),
      weight: weights.onchainWeight,
    },
    sentiment: {
      rawScore: clamp(sentiment.score, -1, 1),
      normalized: clamp(normalizedSentiment, -1, 1),
      sourceCount: sentiment.sourceCount,
      reason: sentiment.reason,
      weight: weights.sentimentWeight,
    },
    ta: {
      score: clamp(ta.score, -1, 1),
      indicators: ta.indicators,
      used: ta.used,
      weight: weights.taWeight,
    },
    weights,
    compositeFormula: 'clamp(onchainWeight*whaleScore + sentimentWeight*normalizedSentiment + taWeight*taScore, -1, 1)',
  };

  return { action, score: composite, details };
}

export default evaluateToken;


