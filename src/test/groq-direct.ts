import * as dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';

async function testGroqDirect() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY not set. Add it to .env');
    process.exit(1);
  }

  try {
    console.log('🤖 Testing Groq API directly...');
    
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    console.log('📝 Making direct API call...');
    const response = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Hello, are you working?' }],
      max_tokens: 10,
    });

    console.log('✅ Groq API is working!');
    console.log('Response:', response.choices[0]?.message?.content);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Groq API error:', errorMessage);
    
    if (errorMessage.includes('401')) {
      console.log('🔑 API key is invalid');
    } else if (errorMessage.includes('429')) {
      console.log('⏰ Rate limit exceeded');
    } else {
      console.log('🔍 Other error:', errorMessage);
    }
  }
}

testGroqDirect();
