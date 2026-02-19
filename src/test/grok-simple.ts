// Requires GROQ_API_KEY in .env. Run: GROQ_API_KEY=your_key npx tsx src/test/grok-simple.ts

import { grok } from '../ai/grok';

async function testSimple() {
  try {
    console.log('🔑 Testing API key validation...');
    const isValid = await grok?.validateApiKey() ?? false;
    console.log('API key valid:', isValid);
    
    if (isValid) {
      console.log('✅ API key is working!');
    } else {
      console.log('❌ API key is invalid or expired');
      console.log('Please check:');
      console.log('1. Go to https://console.x.ai');
      console.log('2. Verify your API key is active');
      console.log('3. Generate a new key if needed');
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

testSimple();
