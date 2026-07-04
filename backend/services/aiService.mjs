// backend/services/aiService.mjs
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Gemini client
const geminiClient = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY not found in environment');
} else {
  console.log('✅ GROQ_API_KEY loaded, length:', GROQ_API_KEY.length);
}

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment');
} else {
  console.log('✅ GEMINI_API_KEY loaded, length:', GEMINI_API_KEY.length);
}

const SYSTEM_INSTRUCTION = `You are a coding assistant in BadLson_AI_code Editor.

ABSOLUTE RULES - NEVER BREAK THESE:
1. MAXIMUM 2 sentences for any explanation.
2. NO bullet points. NO numbered lists. NO "Step 1" etc.
3. NO "text Copy Apply" or any action labels in your response.
4. NO "Why this works" or "Here is how" sections.
5. NO markdown tables. EVER.
6. Use code blocks ONLY with triple backticks.
7. NEVER wrap code explanations in \`\`\`text blocks. Only actual code goes in code blocks.
8. If the user asks "how do I add color", just give the CSS. Don't explain CSS theory.
9. Casual tone. "Yeah" or "Sure" is fine.
10. Assume the user is a beginner. One thing at a time.

CRITICAL:
- JavaScript: plain ES6+ only, NO TypeScript.
- CSS: standard CSS only.
- HTML: standard HTML5 only.`;

function getFallbackResponse() {
  const responses = [
    "I'd help with that, but the AI service is currently experiencing high demand. Please try again in a few moments.",
    "The AI is temporarily busy. Please try again shortly.",
    "I'm currently unavailable due to high traffic. Try again in a minute or two.",
    "AI service is experiencing a spike in demand. Please wait a moment and try your request again.",
    "Sorry, I'm getting a lot of requests right now. Please try again in a few moments."
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// ─── GROQ ───────────────────────────────────────────────────────────

async function callGroq(messages, model = 'meta-llama/llama-4-scout-17b-16e-instruct') {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid response from Groq');
  }

  return data.choices[0].message.content;
}

// ─── GEMINI ─────────────────────────────────────────────────────────

async function callGemini(prompt, model = 'gemini-2.5-flash') {
  if (!geminiClient) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const result = await geminiClient.models.generateContent({
    model,
    contents: [
      { role: 'user', parts: [{ text: SYSTEM_INSTRUCTION + '\n\n' + prompt }] }
    ],
    config: {
      maxOutputTokens: 2048,
      temperature: 0.7,
    },
  });

  return result.text;
}

// ─── MAIN FUNCTIONS ───────────────────────────────────────────────

function buildPrompt(projectFiles, userMessage) {
  const filesContext = Object.entries(projectFiles)
    .map(([filename, content]) => `--- ${filename} ---\n${content.substring(0, 2000)}${content.length > 2000 ? '\n...' : ''}`)
    .join('\n\n');

  return `Files:\n${filesContext}\n\nUser: ${userMessage}\n\nReply in 1-2 sentences. Use \`\`\`css or \`\`\`html for code only.`;
}

function cleanResponse(text) {
  if (!text) return '';
  return text
    .replace(/text\s*Copy\s*Apply/gi, '')
    .replace(/\bCopy\s*Apply\b/gi, '')
    .replace(/```text\s*\n/g, '\n')
    .replace(/```\s*text\s*/g, '');
}

export async function generateCodeResponse(projectFiles, userMessage, chatHistory = [], provider = 'gemini') {
  try {
    const prompt = buildPrompt(projectFiles, userMessage);
    
    const messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
    ];

    const trimmedHistory = chatHistory.slice(-5);
    for (const msg of trimmedHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    messages.push({ role: 'user', content: prompt });

    // Try preferred provider first, fallback to other
    const providers = provider === 'gemini' 
      ? [
          () => callGemini(prompt, 'gemini-2.5-flash'),
          () => callGroq(messages, 'meta-llama/llama-4-scout-17b-16e-instruct'),
        ]
      : [
          () => callGroq(messages, 'meta-llama/llama-4-scout-17b-16e-instruct'),
          () => callGemini(prompt, 'gemini-2.5-flash'),
        ];

    let lastError;
    for (const callFn of providers) {
      try {
        const response = await callFn();
        if (!response) continue;
        const cleaned = cleanResponse(response);
        console.log(`✅ Success with provider, length: ${cleaned.length}`);
        return cleaned;
      } catch (error) {
        console.warn(`❌ Provider failed:`, error.message);
        lastError = error;
        continue;
      }
    }

    console.error('All AI providers failed:', lastError);
    return getFallbackResponse();
  } catch (error) {
    console.error('generateCodeResponse error:', error);
    return getFallbackResponse();
  }
}

export async function streamCodeResponse(projectFiles, userMessage, chatHistory = [], onChunk, provider = 'gemini') {
  try {
    const prompt = buildPrompt(projectFiles, userMessage);

    // Gemini doesn't support streaming the same way, so use Groq for streaming
    if (provider === 'gemini') {
      const response = await generateCodeResponse(projectFiles, userMessage, chatHistory, 'gemini');
      if (onChunk) {
        // Simulate streaming by sending chunks
        const chunks = response.split(' ');
        for (const chunk of chunks) {
          onChunk(chunk + ' ');
          await new Promise(r => setTimeout(r, 20));
        }
      }
      return response;
    }

    // Groq streaming
    const messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      ...chatHistory.slice(-5).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: prompt },
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq streaming error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

      for (const line of lines) {
        const data = line.replace('data:', '').trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            if (onChunk) onChunk(content);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    return cleanResponse(fullText);
  } catch (error) {
    console.error('streamCodeResponse error:', error);
    const fallback = getFallbackResponse();
    if (onChunk) onChunk(fallback);
    return fallback;
  }
}

export async function testConnection() {
  const results = {};

  // Test Groq
  if (GROQ_API_KEY) {
    try {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "OK" in one word.' },
      ];
      const response = await callGroq(messages, 'meta-llama/llama-4-scout-17b-16e-instruct');
      results.groq = { status: 'ok', response: response.trim() };
    } catch (error) {
      results.groq = { status: 'error', error: error.message };
    }
  } else {
    results.groq = { status: 'not_configured' };
  }

  // Test Gemini
  if (geminiClient) {
    try {
      const response = await callGemini('Say "OK" in one word.', 'gemini-2.5-flash');
      results.gemini = { status: 'ok', response: response.trim() };
    } catch (error) {
      results.gemini = { status: 'error', error: error.message };
    }
  } else {
    results.gemini = { status: 'not_configured' };
  }

  return results;
}