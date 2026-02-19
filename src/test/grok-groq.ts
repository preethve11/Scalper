// Requires GROQ_API_KEY in .env. Run: GROQ_API_KEY=your_key npx tsx src/test/grok-groq.ts

import { GrokClient } from '../ai/grok';

async function testGroq() {
  try {
    console.log('🤖 Testing Groq API integration...');
    
    // Create a new instance to test
    const groqGrok = new GrokClient();
    
    console.log('🔑 Testing API key validation...');
    const isValid = await groqGrok.validateApiKey();
    console.log('API key valid:', isValid);
    
    if (isValid) {
      console.log('✅ Groq API key is working!');
      
      // Test basic chat
      console.log('📝 Testing basic chat...');
      const response = await groqGrok.chat('What is the current price of Bitcoin?');
      console.log('Response:', response);
      
      // Test with system message
      console.log('📝 Testing with system message...');
      const response2 = await groqGrok.chat(
        'Analyze this trading signal: BUY SOL at $100',
        {
          systemMessage: 'You are a professional cryptocurrency trading analyst.',
          temperature: 0.3
        }
      );
      console.log('Response:', response2);
      
    } else {
      console.log('❌ Groq API key is invalid or expired');
      console.log('Please check:');
      console.log('1. Go to https://console.groq.com');
      console.log('2. Verify your API key is active');
      console.log('3. Generate a new key if needed');
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

testGroq();
