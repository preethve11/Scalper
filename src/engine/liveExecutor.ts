/**
 * Live execution: get Jupiter quote, build swap tx, sign and send (or dry-run).
 * Supports SOL or USDC as input; uses config for slippage, retries, min SOL.
 */

import { LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { Logger } from '../core/logger';
import { Wallet } from '../core/wallet';
import { JupiterDEX, JupiterQuote } from '../dex/jupiter';
import { sleep } from '../utils/sleep';
import { getConfig } from '../config/loadConfig';

const logger = new Logger('LiveExecutor');

const USDC_DECIMALS = 6;

export type LiveExecutionResult =
  | { success: true; txid?: string; executedNotionalUSD: number; price: number; routeSummary?: unknown }
  | { success: false; reason: string; details?: unknown };

function bpsToFrac(bps: number): number {
  return bps / 10_000;
}

async function ensureWalletHasSol(wallet: Wallet, minLamports: number): Promise<boolean> {
  const bal = await wallet.getBalance();
  logger.info(`Wallet SOL balance: ${bal} lamports`);
  return bal >= minLamports;
}

export async function executeSwapLive(params: {
  inputMint: string;
  outputMint: string;
  notionalUSD: number;
  priceHint?: number;
  useSolAsInput?: boolean;
  /** When useSolAsInput=false (e.g. USDC input), pass raw input amount. If not set, notionalUSD * 10^6 used for USDC. */
  amountInRaw?: number;
}): Promise<LiveExecutionResult> {
  const { inputMint, outputMint, notionalUSD, priceHint, useSolAsInput = true, amountInRaw } = params;
  const cfg = getConfig().execution;
  const TRADE_MODE = cfg.mode;
  const SLIPPAGE_BPS = cfg.slippageBps;
  const MAX_EXEC_RETRIES = cfg.maxRetries;
  const RETRY_DELAY_MS = cfg.retryDelayMs;
  const MIN_SOL_BALANCE = cfg.minSolBalanceLamports;

  const wallet = new Wallet();
  const dex = new JupiterDEX();

  const ok = await ensureWalletHasSol(wallet, MIN_SOL_BALANCE);
  if (!ok) return { success: false, reason: 'insufficient_sol_balance' };

  let inputAmountRaw: number;
  if (useSolAsInput) {
    if (!priceHint) {
      logger.warn('Missing priceHint for SOL/USD conversion.');
      return { success: false, reason: 'missing_price_hint' };
    }
    const solAmount = notionalUSD / Math.max(priceHint, 1e-9);
    inputAmountRaw = Math.round(solAmount * LAMPORTS_PER_SOL);
  } else {
    inputAmountRaw = amountInRaw ?? Math.round(notionalUSD * Math.pow(10, USDC_DECIMALS));
  }

  logger.info(`Fetching Jupiter quote ${inputMint} -> ${outputMint} amount=${inputAmountRaw}`);
  let quote: JupiterQuote;
  try {
    quote = await dex.getQuote(inputMint, outputMint, inputAmountRaw, SLIPPAGE_BPS);
  } catch (err: unknown) {
    logger.error("getQuote failed:", err);
    return { success: false, reason: 'quote_failed', details: String(err) };
  }

  const estimatedOut = Number(quote.outAmount ?? 0) || 0;
  const estimatedIn = Number(quote.inAmount ?? inputAmountRaw) || inputAmountRaw;
  const impliedPrice =
    estimatedOut > 0 && useSolAsInput
      ? estimatedOut / (estimatedIn / LAMPORTS_PER_SOL)
      : priceHint ?? 0;
  logger.info(`Route found. estOut=${estimatedOut}, impliedPrice=${impliedPrice}`);

  if (useSolAsInput && priceHint && impliedPrice) {
    const priceDiff = Math.abs(impliedPrice - priceHint) / Math.max(1e-9, priceHint);
    if (priceDiff > bpsToFrac(SLIPPAGE_BPS)) {
      logger.warn(`Slippage ${(priceDiff * 100).toFixed(3)}% exceeds ${SLIPPAGE_BPS / 100}%`);
      return { success: false, reason: 'slippage_too_high', details: { priceHint, impliedPrice, priceDiff } };
    }
  }

  let swapTxBase64: string;
  try {
    const swapResp = await dex.getSwapTransaction(quote, wallet.address, true);
    swapTxBase64 = swapResp.swapTransaction;
  } catch (err: unknown) {
    logger.error('Failed to build swap transaction:', err);
    return { success: false, reason: 'build_failed', details: String(err) };
  }

  const tx: Transaction = dex.deserializeTransaction(swapTxBase64);

  if (TRADE_MODE !== 'live') {
    logger.info('TRADE_MODE != live -> dry-run. Returning simulated execution details.');
    return {
      success: true,
      price: impliedPrice || priceHint || 0,
      executedNotionalUSD: notionalUSD,
      routeSummary: quote,
    };
  }

  for (let attempt = 1; attempt <= MAX_EXEC_RETRIES; attempt++) {
    try {
      const signed = await wallet.signTransaction(tx);
      const txid = await wallet.sendTransaction(signed);
      logger.info(`Transaction submitted. txid=${txid}`);
      return { success: true, txid, executedNotionalUSD: notionalUSD, price: impliedPrice, routeSummary: quote };
    } catch (err: unknown) {
      logger.warn(`Send attempt ${attempt} failed: ${String(err)}`);
      if (attempt < MAX_EXEC_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return { success: false, reason: 'send_failed', details: String(err) };
    }
  }

  return { success: false, reason: 'unexpected_error' };
}
