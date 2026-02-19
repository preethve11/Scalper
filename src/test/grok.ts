import { grok, GrokClient } from '../ai/grok';
import { Logger } from '../core/logger';

// Test Grok API integration
async function testGrok() {
  const logger = new Logger('GrokTest');

  try {
    logger.info('🤖 Testing Grok API integration...');

    // Check if grok instance is available, create one if not
    let grokClient: GrokClient;
    try {
      grokClient = grok || new GrokClient();
    } catch (error) {
      logger.error('❌ Failed to initialize Grok client. Please check your environment variables:');
      logger.error('   Required: GROK_API_KEY, GROK_ENDPOINT');
      logger.error('   Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
    
    // Test 1: Basic chat functionality
    logger.info('📝 Test 1: Basic chat');
    const response1 = await grokClient.chat('What is the current state of the cryptocurrency market?');
    logger.info(`Response: ${response1}`);

    // Test 2: Chat with system message
    logger.info('📝 Test 2: Chat with system message');
    const response2 = await grokClient.chat(
      'Analyze this trading signal: BUY SOL at $100 with RSI 45',
      {
        systemMessage: 'You are a professional cryptocurrency trading analyst. Provide concise analysis.',
        temperature: 0.3
      }
    );
    logger.info(`Response: ${response2}`);

    // Test 3: Message array conversation
    logger.info('📝 Test 3: Message array conversation');
    const messages = [
      { role: 'system' as const, content: 'You are a ScalperrBot trading assistant.' },
      { role: 'user' as const, content: 'Should I buy BONK tokens now?' },
      { role: 'assistant' as const, content: 'I need more market data to make a recommendation.' },
      { role: 'user' as const, content: 'BONK is at $0.000012, volume is 2x average, RSI is 60.' }
    ];
    const response3 = await grokClient.chat(messages);
    logger.info(`Response: ${response3}`);

    // Test 4: Validate API key
    logger.info('🔑 Test 4: Validating API key');
    const isValid = await grokClient.validateApiKey();
    logger.info(`API key is valid: ${isValid}`);

    // Test 5: Get available models
    logger.info('📋 Test 5: Getting available models');
    const models = await grokClient.getModels();
    logger.info(`Available models: ${models.join(', ')}`);

    // Test 6: Custom configuration
    logger.info('⚙️ Test 6: Custom configuration');
    const customGrok = new GrokClient({
      model: 'grok-beta',
      maxTokens: 500,
      temperature: 0.1
    });
    
    const response4 = await customGrok.chat('Give me a short trading tip for SOL.');
    logger.info(`Custom config response: ${response4}`);

    logger.info('✅ All Grok API tests completed successfully!');

  } catch (error) {
    logger.error('❌ Grok API test failed:', error);
    process.exit(1);
  }
}

// Run the test
testGrok().catch(console.error);
