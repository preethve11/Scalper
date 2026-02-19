import { JupiterDEX } from '../dex/jupiter';
import { Logger } from '../core/logger';

// Test Jupiter DEX quote functionality
async function testQuote() {
  const logger = new Logger('QuoteTest');
  const jupiter = new JupiterDEX();

  try {
    // Test SOL to BONK quote
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const outputMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK
    const amount = 0.1; // 0.1 SOL

    logger.info(`🔍 Fetching quote for ${amount} SOL → BONK...`);

    const quote = await jupiter.getQuote(
      inputMint,
      outputMint,
      amount * 1e9, // Convert to lamports
      50 // 0.5% slippage
    );

    // Convert output amount from smallest unit to readable format
    const outputAmount = parseInt(quote.outAmount) / 1e5; // BONK has 5 decimals

    logger.info(`💱 Best route found: ${quote.routePlan[0]?.swapInfo?.label || 'Unknown'}`);
    logger.info(`Expected output: ${Math.floor(outputAmount).toLocaleString()} BONK`);
    logger.info(`Price impact: ${quote.priceImpactPct}%`);
    logger.info(`✅ Quote fetched successfully.`);

  } catch (error) {
    logger.error('❌ Quote test failed:', error);
    process.exit(1);
  }
}

// Run the test
testQuote().catch(console.error);
