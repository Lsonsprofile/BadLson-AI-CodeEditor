// src/ai/utils/sse.ts

export interface SSEParserOptions<T> {
  onData: (data: T) => void;
}

export class SSEParser<T> {
  private buffer = '';
  private readonly decoder = new TextDecoder();
  private readonly options: SSEParserOptions<T>;

  constructor(options: SSEParserOptions<T>) {
    this.options = options;
  }

  feed(value: Uint8Array): void {
    this.buffer += this.decoder.decode(value, {
      stream: true,
    });
    this.processBuffer();
  }

  flush(): void {
    this.buffer += this.decoder.decode();
    this.processBuffer(true);
  }

  private processBuffer(final = false): void {
    const lines = this.buffer.split('\n');

    if (!final) {
      this.buffer = lines.pop() ?? '';
    } else {
      this.buffer = '';
    }

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;

      const payload = line.replace(/^data:\s*/, '');
      if (!payload || payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload) as T;
        this.options.onData(parsed);
      } catch {
        // ignore invalid SSE payloads
      }
    }
  }
}