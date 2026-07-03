import { generateCodeResponse, streamCodeResponse } from '../services/geminiService.mjs';

export async function handleChat(req, res) {
  try {
    const { projectFiles, message, chatHistory } = req.body;

    console.log('=== handleChat DEBUG ===');
    console.log('Received message:', message);
    console.log('Project files count:', Object.keys(projectFiles || {}).length);
    console.log('Chat history length:', (chatHistory || []).length);
    console.log('========================');

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('Calling generateCodeResponse...');
    const response = await generateCodeResponse(
      projectFiles || {},
      message,
      chatHistory || []
    );
    console.log('AI response received, length:', response?.length);

    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('=== Chat Error FULL ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================');
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}

export async function handleStream(req, res) {
  try {
    const { projectFiles, message, chatHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    await streamCodeResponse(
      projectFiles || {},
      message,
      chatHistory || [],
      (chunk) => {
        res.write(chunk);
      }
    );

    res.end();
  } catch (error) {
    console.error('Stream Error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function handleAnalyze(req, res) {
  try {
    const { projectFiles } = req.body;

    const response = await generateCodeResponse(
      projectFiles || {},
      'Analyze this code for errors, bugs, and potential improvements. Provide specific fixes.',
      []
    );

    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Analyze Error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function handleExplain(req, res) {
  try {
    const { projectFiles, filename } = req.body;

    const response = await generateCodeResponse(
      projectFiles || {},
      `Explain the code in ${filename || 'all files'} in detail. Break down the logic and structure.`,
      []
    );

    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Explain Error:', error);
    res.status(500).json({ error: error.message });
  }
}