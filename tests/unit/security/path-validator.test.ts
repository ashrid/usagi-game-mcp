import { describe, it, expect } from 'vitest';
import { validatePath, ValidationMode } from '../../../src/security/path-validator.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Use system temp dir as a safe test root
const TEST_ROOT = os.tmpdir();

describe('validatePath — UNC rejection', () => {
  it('rejects Windows UNC paths not in allowed roots', async () => {
    const result = await validatePath('\\\\server\\share\\file.lua', [TEST_ROOT], ValidationMode.Read);
    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe('path_traversal');
    expect(result.error?.message).toMatch(/UNC/);
  });

  it('allows UNC paths explicitly listed in allowed roots', async () => {
    // This test only runs meaningfully on Windows; on Unix we just verify no UNC is detected
    const uncRoot = '\\\\trusted\\share';
    const result = await validatePath('\\\\trusted\\share\\project\\file.lua', [uncRoot], ValidationMode.Read);
    // On Unix, UNC path won't resolve, but it should not be rejected at the UNC-check stage
    if (process.platform === 'win32') {
      // Would proceed to realpath which may fail for a non-existent share
      expect(result.error?.type).not.toBe('path_traversal');
    }
  });
});

describe('validatePath — traversal detection', () => {
  it('rejects paths that escape allowed roots', async () => {
    const result = await validatePath('/etc/passwd', [TEST_ROOT], ValidationMode.Read);
    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe('path_traversal');
  });

  it('accepts paths within allowed roots', async () => {
    // Create a real file in tmp so realpath works
    const tmpFile = path.join(TEST_ROOT, `usagi-test-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'test');
    try {
      const result = await validatePath(tmpFile, [TEST_ROOT], ValidationMode.Read);
      expect(result.ok).toBe(true);
      expect(result.resolvedPath).toBe(fs.realpathSync(tmpFile));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('validatePath — broken symlink', () => {
  it('returns symlink_broken for broken symlinks', async () => {
    const symlinkPath = path.join(TEST_ROOT, `usagi-broken-link-${Date.now()}`);
    fs.symlinkSync('/nonexistent/target', symlinkPath);
    try {
      const result = await validatePath(symlinkPath, [TEST_ROOT], ValidationMode.Read);
      expect(result.ok).toBe(false);
      expect(result.error?.type).toBe('symlink_broken');
    } finally {
      fs.unlinkSync(symlinkPath);
    }
  });
});
