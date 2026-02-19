import 'dotenv/config';
import { grok, GrokClient } from '../ai/grok';
import { connection, publicKey, getBalance } from '../lib/solana';

async function testGrok(): Promise<void> {
  const client = grok ?? new GrokClient();
  const reply = await client.chat('Say "pong"');
  console.log('[Grok] reply:', reply);
}

async function testWallet(): Promise<void> {
  console.log('[Solana] RPC endpoint:', (connection as any)._rpcEndpoint || 'custom');
  console.log('[Solana] Public key:', publicKey.toBase58());
  const bal = await getBalance(publicKey);
  console.log('[Solana] Balance:', `${bal.sol} SOL (${bal.lamports} lamports)`);
}

async function main(): Promise<void> {
  try {
    await testGrok();
  } catch (e) {
    console.error('[Grok] test failed:', e instanceof Error ? e.message : e);
  }

  try {
    await testWallet();
  } catch (e) {
    console.error('[Solana] test failed:', e instanceof Error ? e.message : e);
  }
}

main().catch(err => {
  console.error('Integration test fatal error:', err);
  process.exitCode = 1;
});


