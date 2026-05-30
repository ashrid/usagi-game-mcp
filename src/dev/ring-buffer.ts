const SINGLE_LINE_TRUNCATE = 10_240;
const BYTE_HEADROOM_FACTOR = 0.9;

export interface RingBufferOptions {
  maxLines?: number;
  maxBytes?: number;
}

export class RingBuffer {
  private _lines: string[] = [];
  private _byteCount = 0;
  private _truncated = false;
  private _total = 0;
  private readonly maxLines: number;
  private readonly maxBytes: number;

  constructor(opts: RingBufferOptions = {}) {
    this.maxLines = opts.maxLines ?? 500;
    this.maxBytes = opts.maxBytes ?? 1_048_576; // 1MB
  }

  get lines(): readonly string[] { return this._lines; }
  get truncated(): boolean { return this._truncated; }
  get totalLinesWritten(): number { return this._total; }

  append(raw: string): void {
    let line = raw.replace(/\r\n/g, '\n');
    if (line.length > SINGLE_LINE_TRUNCATE) {
      line = line.slice(0, SINGLE_LINE_TRUNCATE) + '[... line truncated]';
    }
    const bytes = Buffer.byteLength(line, 'utf8');
    this._lines.push(line);
    this._byteCount += bytes;
    this._total++;

    while (this._lines.length > this.maxLines || this._byteCount > this.maxBytes) {
      const evicted = this._lines.shift()!;
      this._byteCount -= Buffer.byteLength(evicted, 'utf8');
      this._truncated = true;
      if (this._lines.length <= this.maxLines && this._byteCount <= this.maxBytes * BYTE_HEADROOM_FACTOR) break;
    }
  }

  slice(sinceTotal: number, count: number): string[] {
    const bufStart = this._total - this._lines.length;
    const idx = Math.max(0, sinceTotal - bufStart);
    return this._lines.slice(idx, idx + count);
  }
}
