import 'dotenv/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Solana helpers that prefer Helius and fall back to generic RPC.
 * Reads env from dotenvx/dotenv via process.env:
 * - HELIUS_URL (e.g. https://mainnet.helius-rpc.com)
 * - HELIUS_API_KEY
 * - RPC_URL (generic fallback, e.g. QuickNode endpoint)
 * - PRIVATE_KEY (JSON array string or base58 secret)
 */

function buildHeliusUrl(): string | null {
  const base = process.env.HELIUS_URL?.trim();
  const key = process.env.HELIUS_API_KEY?.trim();
  console.log('DEBUG: HELIUS_URL =', base);
  console.log('DEBUG: HELIUS_API_KEY =', key ? `${key.substring(0, 8)}...` : 'undefined');
  if (!base || !key) return null;
  if (base.includes('api-key=')) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}api-key=${key}`;
}

function resolveRpcEndpoint(): string {
  const helius = buildHeliusUrl();
  if (helius) return helius;
  const fallback = process.env.RPC_URL?.trim();
  console.log('DEBUG: RPC_URL =', fallback);
  if (!fallback) {
    throw new Error('RPC endpoint not configured. Provide HELIUS_URL+HELIUS_API_KEY or RPC_URL');
  }
  return fallback;
}

function parsePrivateKey(): Uint8Array {
  const raw = process.env.PRIVATE_KEY;
  if (!raw) throw new Error('PRIVATE_KEY is required');
  // Try JSON array first (recommended)
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return new Uint8Array(arr as number[]);
    }
  } catch {}
  // Fallback: base58 secret key
  try {
    // Lazy import to avoid heavy dependency when unused
    const bs58 = require('bs58');
    const decoded: Uint8Array = bs58.decode(raw);
    return decoded;
  } catch {
    throw new Error('Invalid PRIVATE_KEY format. Use JSON array or base58 secret');
  }
}

export const rpcEndpoint: string = resolveRpcEndpoint();
export const connection: Connection = new Connection(rpcEndpoint, { commitment: 'confirmed' });

export const wallet: Keypair = Keypair.fromSecretKey(parsePrivateKey());
export const publicKey: PublicKey = wallet.publicKey;

/**
 * Get balance for a public key in lamports and SOL.
 */
export async function getBalance(pubkey: PublicKey | string): Promise<{ lamports: number; sol: number }>
{
  const key = typeof pubkey === 'string' ? new PublicKey(pubkey) : pubkey;
  const lamports = await connection.getBalance(key);
  return { lamports, sol: lamports / LAMPORTS_PER_SOL };
}


