import { GoogleGenAI } from '@google/genai';

let genAI;

function getGenerativeAI() {
  if (!genAI) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('Missing Gemini API key: set GEMINI_API_KEY in backend/.env');
      throw new Error('Gemini API key is required for AI generation.');
    }
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return genAI;
}

const SYSTEM_INSTRUCTION = `You are an expert AI coding assistant integrated into a web-based IDE called AI Code Workspace. You help users write, debug, and improve HTML, CSS, and JavaScript code.

Your capabilities:
1. Read and analyze the user's current project files
2. Provide code suggestions and improvements
3. Generate complete code blocks for HTML, CSS, and JavaScript
4. Debug errors and explain solutions
5. Optimize code performance and accessibility

CRITICAL RULES:
- When generating JavaScript code, use ONLY plain JavaScript (ES6+). NEVER use TypeScript syntax like type annotations (: string, : Element, : HTMLElement), interfaces, type aliases, or 'as' type casts. The code runs directly in the browser without compilation.
- When generating CSS, use standard CSS. Do not use SCSS, Sass, or Less syntax.
- When generating HTML, use standard HTML5.

When providing code changes, ALWAYS wrap code in markdown blocks:
\`\`\`html
<!-- HTML code -->
\`\`\`
\`\`\`css
/* CSS code */
\`\`\`
\`\`\`javascript
// JavaScript code
\`\`\`

Be concise but thorough. Focus on practical, working solutions.`;

async function createInteraction(inputText) {
  const client = getGenerativeAI();

  const response = await client.models.generateContent({
    model: 'gemini-flash-latest',
    contents: `${SYSTEM_INSTRUCTION}\n\n${inputText}`,
  });

  if (!response.text) {
    console.error('Empty response:', response);
    throw new Error('No response returned from Gemini API.');
  }

  return response.text;
}

export async function generateCodeResponse(projectFiles, userMessage, chatHistory = []) {
  try {
    const prompt = `Current Project Files:\n${Object.entries(projectFiles)
      .map(([filename, content]) => `--- ${filename} ---\n${content}`)
      .join('\n\n')}\n\nUser Request: ${userMessage}\n\nPlease provide a helpful response and use markdown code blocks for code changes.`;

    return await createInteraction(prompt);
  } catch (error) {
    console.error('Gemini API Error:', error);
    
    // Check for quota/rate limit errors
    if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('AI service is temporarily busy. Please wait a minute and try again.');
    }
    
    throw new Error(`AI generation failed: ${error.message}`);
  }
}

export async function streamCodeResponse(projectFiles, userMessage, chatHistory = [], onChunk) {
  try {
    const client = getGenerativeAI();
    const prompt = `Current Project Files:\n${Object.entries(projectFiles)
      .map(([filename, content]) => `--- ${filename} ---\n${content}`)
      .join('\n\n')}\n\nUser Request: ${userMessage}\n\nPlease provide a helpful response and use markdown code blocks for code changes.`;

    const stream = await client.models.generateContentStream({
      model: 'gemini-flash-latest',
      contents: prompt,
    });

    let fullText = '';
    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        if (onChunk) onChunk(chunk.text);
      }
    }

    return fullText;
  } catch (error) {
    console.error('Gemini Streaming Error:', error);
    
    // Check for quota/rate limit errors
    if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('AI service is temporarily busy. Please wait a minute and try again.');
    }
    
    throw new Error(`AI streaming failed: ${error.message}`);
  }
}