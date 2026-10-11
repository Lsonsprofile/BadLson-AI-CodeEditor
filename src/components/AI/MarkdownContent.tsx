// Professional AI message Markdown renderer
import { useMemo, useState, useCallback, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Copy, Check, Wrench, Info, AlertTriangle, AlertCircle, CheckCircle2,
} from 'lucide-react';

export type ApplyHandler = (path: string, content: string) => void;

function parseFenceMeta(className?: string, meta?: string): { lang: string; filePath: string | null } {
  const raw = (className || '').replace(/^language-/, '') || 'text';
  let lang = raw;
  let filePath: string | null = null;
  const fromMeta = (meta || '').trim();
  if (fromMeta) {
    const edit = fromMeta.match(/^edit:(\S+)/i);
    const path = fromMeta.match(/(?:file|path)[:=\s]+(\S+)/i) || fromMeta.match(/^([\w./\\-]+\.\w+)$/);
    if (edit) filePath = edit[1];
    else if (path) filePath = path[1];
  }
  const editLang = raw.match(/^edit:(.+)$/i);
  if (editLang) {
    filePath = editLang[1];
    lang = (filePath.split('.').pop() || 'text').toLowerCase();
  }
  const langMap: Record<string, string> = {
    js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash',
    yml: 'yaml', md: 'markdown', htm: 'html',
  };
  lang = langMap[lang] || lang;
  return { lang, filePath };
}

function CodeBlock({
  code,
  language,
  filePath,
  onApply,
}: {
  code: string;
  language: string;
  filePath: string | null;
  onApply?: ApplyHandler;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  }, [code]);

  const handleApply = useCallback(() => {
    if (!filePath || !onApply) return;
    onApply(filePath, code);
    setApplied(true);
    window.setTimeout(() => setApplied(false), 2000);
  }, [filePath, onApply, code]);

  const label = filePath || language || 'code';
  const showLines = code.split('\n').length > 8;

  return (
    <div className="my-3 rounded-md border border-[#30363d] bg-[#0d1117] overflow-hidden max-w-full">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#161b22] border-b border-[#30363d]">
        <span className="text-[11px] text-[#8b949e] font-mono truncate" title={label}>
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {filePath && onApply && (
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] hover:border-[#58a6ff]/50 transition focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
              title={`Apply to ${filePath}`}
            >
              {applied ? (
                <><Check className="w-3 h-3 text-[#3fb950]" /> Applied</>
              ) : (
                <><Wrench className="w-3 h-3" /> Apply</>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
          >
            {copied ? <Check className="w-3 h-3 text-[#3fb950]" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
        <SyntaxHighlighter
          language={language === 'text' ? 'plaintext' : language}
          style={oneDark}
          showLineNumbers={showLines}
          customStyle={{
            margin: 0,
            padding: '12px 14px',
            background: 'transparent',
            fontSize: '12px',
            lineHeight: 1.55,
          }}
          lineNumberStyle={{
            color: '#484f58',
            minWidth: '2.25em',
            paddingRight: '1em',
            userSelect: 'none',
          }}
          wrapLongLines={false}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

function Callout({
  type,
  children,
}: {
  type: 'info' | 'success' | 'warning' | 'error';
  children: ReactNode;
}) {
  const styles = {
    info: {
      border: 'border-[#388bfd]/40',
      bg: 'bg-[#388bfd]/10',
      icon: <Info className="w-4 h-4 text-[#58a6ff] shrink-0 mt-0.5" />,
      title: 'Info',
      titleColor: 'text-[#58a6ff]',
    },
    success: {
      border: 'border-[#3fb950]/40',
      bg: 'bg-[#3fb950]/10',
      icon: <CheckCircle2 className="w-4 h-4 text-[#3fb950] shrink-0 mt-0.5" />,
      title: 'Success',
      titleColor: 'text-[#3fb950]',
    },
    warning: {
      border: 'border-[#d29922]/40',
      bg: 'bg-[#d29922]/10',
      icon: <AlertTriangle className="w-4 h-4 text-[#d29922] shrink-0 mt-0.5" />,
      title: 'Warning',
      titleColor: 'text-[#d29922]',
    },
    error: {
      border: 'border-[#f85149]/40',
      bg: 'bg-[#f85149]/10',
      icon: <AlertCircle className="w-4 h-4 text-[#f85149] shrink-0 mt-0.5" />,
      title: 'Error',
      titleColor: 'text-[#f85149]',
    },
  }[type];

  return (
    <div className={`my-3 flex gap-2.5 rounded-md border ${styles.border} ${styles.bg} px-3 py-2.5`}>
      {styles.icon}
      <div className="min-w-0 flex-1 text-[13px] text-[#c9d1d9] leading-relaxed">
        <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${styles.titleColor}`}>
          {styles.title}
        </div>
        {children}
      </div>
    </div>
  );
}

function detectCallout(text: string): 'info' | 'success' | 'warning' | 'error' | null {
  const t = text.trim();
  if (/^(?:warning|caution|⚠)/i.test(t)) return 'warning';
  if (/^(?:error|danger|❌)/i.test(t)) return 'error';
  if (/^(?:success|done|✅)/i.test(t)) return 'success';
  if (/^(?:info|note|tip|ℹ️)/i.test(t)) return 'info';
  return null;
}

export default function MarkdownContent({
  content,
  activeFile,
  onApply,
}: {
  content: string;
  activeFile: string | null;
  onApply: ApplyHandler;
}) {
  const applyPaths = useMemo(() => {
    const found: { path: string; code: string }[] = [];
    const re = /```([^\n`]*)\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const header = (m[1] || '').trim();
      const code = m[2] || '';
      const edit = header.match(/^edit:(\S+)/i);
      const pathMatch = header.match(/(?:file|path)[:=\s]+(\S+)/i) || header.match(/^([\w./\\-]+\.\w+)$/);
      const path = edit?.[1] || pathMatch?.[1] || null;
      if (path && !found.some((x) => x.path === path)) found.push({ path, code });
    }
    return found;
  }, [content]);

  const components = useMemo(
    () => ({
      h1: ({ children }: { children?: ReactNode }) => (
        <h1 className="text-[1.35rem] font-semibold text-[#f0f6fc] mt-4 mb-2 first:mt-0 leading-tight tracking-tight">
          {children}
        </h1>
      ),
      h2: ({ children }: { children?: ReactNode }) => (
        <h2 className="text-[1.15rem] font-semibold text-[#f0f6fc] mt-4 mb-2 pb-1 border-b border-[#21262d] leading-tight">
          {children}
        </h2>
      ),
      h3: ({ children }: { children?: ReactNode }) => (
        <h3 className="text-[1.05rem] font-semibold text-[#e6edf3] mt-3.5 mb-1.5 leading-snug">
          {children}
        </h3>
      ),
      h4: ({ children }: { children?: ReactNode }) => (
        <h4 className="text-[0.95rem] font-semibold text-[#e6edf3] mt-3 mb-1">{children}</h4>
      ),
      h5: ({ children }: { children?: ReactNode }) => (
        <h5 className="text-[0.875rem] font-semibold text-[#c9d1d9] mt-2.5 mb-1">{children}</h5>
      ),
      h6: ({ children }: { children?: ReactNode }) => (
        <h6 className="text-[0.8rem] font-semibold text-[#8b949e] mt-2 mb-1 uppercase tracking-wide">
          {children}
        </h6>
      ),
      p: ({ children }: { children?: ReactNode }) => {
        const text = typeof children === 'string' ? children : Array.isArray(children)
          ? children.map((c) => (typeof c === 'string' ? c : '')).join('')
          : '';
        const callout = typeof text === 'string' ? detectCallout(text) : null;
        if (callout && text.length < 280) {
          return <Callout type={callout}><p className="m-0">{children}</p></Callout>;
        }
        return (
          <p className="text-[13.5px] leading-[1.65] text-[#c9d1d9] mb-2.5 last:mb-0 break-words">
            {children}
          </p>
        );
      },
      strong: ({ children }: { children?: ReactNode }) => (
        <strong className="font-semibold text-[#f0f6fc]">{children}</strong>
      ),
      em: ({ children }: { children?: ReactNode }) => (
        <em className="italic text-[#c9d1d9]">{children}</em>
      ),
      del: ({ children }: { children?: ReactNode }) => (
        <del className="line-through text-[#8b949e]">{children}</del>
      ),
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        const safe = href && /^(https?:|mailto:|#|\/)/i.test(href) ? href : undefined;
        return (
          <a
            href={safe}
            target={safe?.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="text-[#58a6ff] hover:underline underline-offset-2 break-all focus:outline-none focus:ring-1 focus:ring-[#58a6ff] rounded-sm"
          >
            {children}
          </a>
        );
      },
      ul: ({ children }: { children?: ReactNode }) => (
        <ul className="my-2 pl-5 list-disc space-y-1 text-[13.5px] text-[#c9d1d9] marker:text-[#8b949e]">
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: ReactNode }) => (
        <ol className="my-2 pl-5 list-decimal space-y-1 text-[13.5px] text-[#c9d1d9] marker:text-[#8b949e]">
          {children}
        </ol>
      ),
      li: ({ children, className }: { children?: ReactNode; className?: string }) => {
        const isTask = className?.includes('task-list-item');
        return (
          <li className={`leading-relaxed ${isTask ? 'list-none -ml-5 flex items-start gap-2' : ''}`}>
            {children}
          </li>
        );
      },
      input: ({ checked, type }: { checked?: boolean; type?: string }) => {
        if (type === 'checkbox') {
          return (
            <input
              type="checkbox"
              checked={!!checked}
              readOnly
              className="mt-1 rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-0"
              aria-label={checked ? 'Completed' : 'Not completed'}
            />
          );
        }
        return null;
      },
      blockquote: ({ children }: { children?: ReactNode }) => (
        <blockquote className="my-3 border-l-[3px] border-[#388bfd] bg-[#161b22] rounded-r-md px-3 py-2 text-[13px] text-[#8b949e]">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-4 border-0 border-t border-[#30363d]" />,
      table: ({ children }: { children?: ReactNode }) => (
        <div className="my-3 w-full overflow-x-auto rounded-md border border-[#30363d]">
          <table className="min-w-full border-collapse text-[12.5px] text-left">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }: { children?: ReactNode }) => (
        <thead className="bg-[#161b22] text-[#f0f6fc]">{children}</thead>
      ),
      tbody: ({ children }: { children?: ReactNode }) => (
        <tbody className="divide-y divide-[#21262d]">{children}</tbody>
      ),
      tr: ({ children }: { children?: ReactNode }) => (
        <tr className="border-b border-[#21262d] last:border-0">{children}</tr>
      ),
      th: ({ children }: { children?: ReactNode }) => (
        <th className="px-3 py-2 font-semibold text-[12px] whitespace-nowrap border-b border-[#30363d]">
          {children}
        </th>
      ),
      td: ({ children }: { children?: ReactNode }) => (
        <td className="px-3 py-2 align-top text-[#c9d1d9] break-words max-w-[18rem]">
          {children}
        </td>
      ),
      code: ({
        className,
        children,
        ...props
      }: {
        className?: string;
        children?: ReactNode;
      }) => {
        const text = String(children ?? '').replace(/\n$/, '');
        const isBlock = Boolean(className?.startsWith('language-') || text.includes('\n'));
        if (isBlock) {
          const { lang, filePath } = parseFenceMeta(className);
          return (
            <CodeBlock
              code={text}
              language={lang}
              filePath={filePath || activeFile}
              onApply={onApply}
            />
          );
        }
        return (
          <code
            className="px-1.5 py-0.5 rounded text-[12px] font-mono bg-[#21262d] text-[#e6edf3] border border-[#30363d]/80"
            {...props}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        if (!src || !/^https?:\/\//i.test(src)) return null;
        return (
          <img
            src={src}
            alt={alt || ''}
            className="my-3 max-w-full h-auto rounded-md border border-[#30363d]"
            loading="lazy"
          />
        );
      },
    }),
    [activeFile, onApply]
  );

  return (
    <div className="markdown-body max-w-full overflow-x-hidden">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as never}>
        {content}
      </ReactMarkdown>
      {applyPaths.length > 1 && (
        <button
          type="button"
          onClick={() => {
            for (const item of applyPaths) onApply(item.path, item.code);
          }}
          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded border border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] hover:border-[#58a6ff]/50 transition"
        >
          <Wrench className="w-3.5 h-3.5" /> Apply all ({applyPaths.length} files)
        </button>
      )}
    </div>
  );
}
