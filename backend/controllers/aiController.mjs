// backend/controllers/aiController.mjs
import { generateCodeResponse, streamCodeResponse, parseAiResponse, applyEdits } from '../services/aiService.mjs';

export async function handleChat(req, res) {
  try {
    const { projectFiles, message, chatHistory, provider, preferredModel, activeFile } = req.body;

    console.log('=== handleChat DEBUG ===');
    console.log('Received message:', message);
    console.log('Provider:', provider || 'openrouter (default)');
    console.log('Preferred model:', preferredModel || 'auto-rotate');
    console.log('Active file:', activeFile || 'none');
    console.log('Project files count:', Object.keys(projectFiles || {}).length);
    console.log('Chat history length:', (chatHistory || []).length);
    console.log('========================');

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const aiResponse = await generateCodeResponse(
      projectFiles || {},
      message,
      chatHistory || [],
      provider || 'openrouter',
      activeFile || null
    );

    // Parse response for targeted edits
    const { message: cleanMessage, edits } = parseAiResponse(aiResponse);
    
    // Apply edits if found
    let updatedFiles = null;
    let editSummary = null;
    
    if (edits.length > 0) {
      const result = applyEdits(projectFiles || {}, edits);
      updatedFiles = result.updatedFiles;
      editSummary = {
        applied: result.applied,
        failed: result.failed,
      };
      console.log('✅ Applied edits:', result.applied);
      if (result.failed.length > 0) {
        console.warn('⚠️ Failed edits:', result.failed);
      }
    }

    res.json({
      success: true,
      response: cleanMessage || aiResponse,
      provider: provider || 'openrouter',
      timestamp: new Date().toISOString(),
      // Include edit info so frontend can apply changes
      edits: editSummary,
      updatedFiles: updatedFiles,
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
    const { projectFiles, message, chatHistory, provider, activeFile } = req.body;

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
      },
      provider || 'openrouter',
      activeFile || null
    );

    res.end();
  } catch (error) {
    console.error('Stream Error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function handleAnalyze(req, res) {
  try {
    const { projectFiles, provider, activeFile } = req.body;

    const response = await generateCodeResponse(
      projectFiles || {},
      'Analyze this code for errors, bugs, and potential improvements. Provide specific fixes.',
      [],
      provider || 'openrouter',
      activeFile || null
    );

    res.json({
      success: true,
      response,
      provider: provider || 'openrouter',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Analyze Error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function handleExplain(req, res) {
  try {
    const { projectFiles, filename, provider, activeFile } = req.body;

    const response = await generateCodeResponse(
      projectFiles || {},
      `Explain the code in ${filename || 'all files'} in detail. Break down the logic and structure.`,
      [],
      provider || 'openrouter',
      activeFile || null
    );

    res.json({
      success: true,
      response,
      provider: provider || 'openrouter',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Explain Error:', error);
    res.status(500).json({ error: error.message });
  }
}