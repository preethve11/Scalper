/**
 * How to run:
 * npx tsx src/test/signalTest.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { evaluateToken } from '../engine/signalEngine';

async function main() {
  const tokenMint = 'TestMint1111111111111111111111111111111111111';

  // Synthetic price series stub (not used directly by evaluateToken yet)
  const prices = [1.18, 1.20, 1.22, 1.25, 1.23];
  const volumes = [900, 1100, 1050, 1200, 1000];

  // Use the latest point as context
  const context = {
    price: prices[prices.length - 1]!,
    volume: volumes[volumes.length - 1]!,
  };

  const result = await evaluateToken(tokenMint, context);
  console.log('evaluateToken result:', JSON.stringify(result, null, 2));

  // Basic shape assertions
  console.assert(result && typeof result === 'object', 'Result should be an object');
  console.assert(['buy', 'hold', 'sell'].includes(result.action), 'Action should be buy|hold|sell');
  console.assert(typeof result.score === 'number', 'Score should be a number');
  console.assert(result.details && typeof result.details === 'object', 'Details should be present');

  console.log('signalTest completed successfully.');
}

main().catch((err) => {
  console.error('signalTest failed:', err);
  process.exit(1);
});


