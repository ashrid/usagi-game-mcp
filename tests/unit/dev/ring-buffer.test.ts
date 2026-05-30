import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../../../src/dev/ring-buffer.js';

describe('RingBuffer', () => {
  it('appends lines and tracks total', () => {
    const buf = new RingBuffer();
    buf.append('line 1');
    buf.append('line 2');
    expect(buf.totalLinesWritten).toBe(2);
    expect(buf.lines.length).toBe(2);
    expect(buf.truncated).toBe(false);
  });

  it('evicts oldest lines when line cap exceeded', () => {
    const buf = new RingBuffer({ maxLines: 3, maxBytes: 10_000_000 });
    buf.append('a');
    buf.append('b');
    buf.append('c');
    buf.append('d');
    expect(buf.lines).toEqual(['b', 'c', 'd']);
    expect(buf.truncated).toBe(true);
    expect(buf.totalLinesWritten).toBe(4);
  });

  it('evicts lines when byte cap exceeded', () => {
    const buf = new RingBuffer({ maxLines: 500, maxBytes: 20 });
    buf.append('12345678901'); // 11 bytes
    buf.append('12345678901'); // 11 bytes (22 total → exceeds 20)
    expect(buf.lines.length).toBe(1);
    expect(buf.truncated).toBe(true);
  });

  it('truncates a single huge line to 10KB', () => {
    const buf = new RingBuffer({ maxLines: 500, maxBytes: 1_048_576 });
    buf.append('x'.repeat(20_000));
    expect(buf.lines[0].endsWith('[... line truncated]')).toBe(true);
    expect(buf.lines[0].length).toBeLessThanOrEqual(10_240 + '[... line truncated]'.length);
  });

  it('slice returns lines from offset into totalLinesWritten', () => {
    const buf = new RingBuffer();
    buf.append('a');
    buf.append('b');
    buf.append('c');
    const result = buf.slice(1, 2);
    expect(result).toEqual(['b', 'c']);
  });
});
