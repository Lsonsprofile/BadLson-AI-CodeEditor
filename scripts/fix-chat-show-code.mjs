// Fix: show AI code in chat (edit: blocks were hidden)
// Run: node scripts/fix-chat-show-code.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'components', 'AI', 'ChatPanel.tsx');
let src = fs.readFileSync(target, 'utf8');
let changes = 0;

// 1) Fix MessageContent to render edit:/patch: blocks
const oldMc = `  // Match code blocks
  const codeBlockRegex = /\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index);
      parts.push(<MarkdownText key={\`text-\${lastIndex}\`} text={textBefore} />);
    }

    const language = match[1];
    const code = match[2].trim();

    if (!language?.startsWith('edit:') && !language?.startsWith('patch:') && !language?.startsWith('wireframe:')) {
      parts.push(<CodeBlock key={\`code-\${match.index}\`} code={code} language={language} />);
    }

    lastIndex = match.index + match[0].length;
  }`;

const newMc = `  // Match lang OR edit:path / patch:path
  const codeBlockRegex = /\`\`\`([^\\n\`]*)\\n([\\s\\S]*?)\`\`\`/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index);
      parts.push(<MarkdownText key={\`text-\${lastIndex}\`} text={textBefore} />);
    }

    const tag = (match[1] || '').trim();
    const code = match[2].trim();

    if (tag.startsWith('wireframe:')) {
      // rendered separately
    } else if (tag.startsWith('edit:') || tag.startsWith('patch:')) {
      const filename = tag.replace(/^(edit|patch):/, '');
      parts.push(<CodeBlock key={\`code-\${match.index}\`} code={code} language={filename || tag} />);
    } else {
      parts.push(<CodeBlock key={\`code-\${match.index}\`} code={code} language={tag || 'code'} />);
    }

    lastIndex = match.index + match[0].length;
  }`;

if (src.includes(oldMc)) {
  src = src.replace(oldMc, newMc);
  changes++;
  console.log('✓ MessageContent now shows edit: code blocks');
} else if (src.includes("tag.startsWith('edit:')")) {
  console.log('• MessageContent already fixed');
} else {
  console.warn('! Could not patch MessageContent automatically');
}

// 2) Prefer rawContent so chat keeps full code text
const oldRaw = `      // Process edit results and build response message
      const responseMessage = processEditResults(data);`;
const newRaw = `      // Prefer full AI text (with code fences) for chat display
      if ((data as any).rawContent && typeof (data as any).rawContent === 'string') {
        data.response = (data as any).rawContent;
      }

      // Process edit results and build response message
      const responseMessage = processEditResults(data);`;

if (src.includes(oldRaw) && !src.includes('rawContent && typeof')) {
  src = src.replace(oldRaw, newRaw);
  changes++;
  console.log('✓ Prefer rawContent for chat message');
}

// 3) Inject code into message when files written but no fences in text
const oldAdd = `      // Add AI response
      if (responseMessage) {
        addChatMessage('ai', responseMessage);`;
const newAdd = `      let finalMessage = responseMessage;
      if (
        data.updatedFiles &&
        Object.keys(data.updatedFiles).length > 0 &&
        finalMessage &&
        !finalMessage.includes('\`\`\`')
      ) {
        const blocks = Object.entries(data.updatedFiles)
          .map(([name, code]) => \`\\\`\\\`\\\`edit:\${name}\\n\${code}\\n\\\`\\\`\\\`\`)
          .join('\\n\\n');
        finalMessage = \`\${finalMessage}\\n\\n\${blocks}\`;
      }

      // Add AI response
      if (finalMessage) {
        addChatMessage('assistant', finalMessage);`;

if (src.includes(oldAdd)) {
  src = src.replace(oldAdd, newAdd);
  changes++;
  console.log('✓ Inject code into chat when files are written');
}

src = src.replace(/addChatMessage\('ai'/g, "addChatMessage('assistant'");

fs.writeFileSync(target, src);
console.log(changes ? `Done (${changes} change(s)). Restart npm run dev.` : 'No changes needed.');
