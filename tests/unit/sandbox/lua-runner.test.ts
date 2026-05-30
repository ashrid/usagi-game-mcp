import { describe, it, expect } from 'vitest';
import { runLuaSandbox, type SandboxResult } from '../../../src/sandbox/lua-runner.js';

// These tests mock getLuaBinary to use the system 'lua' command.
// Requires lua5.4 or lua5.5 installed, OR set USAGI_LUA_BINARY=lua in env.
// If no Lua is available, tests are skipped.
const LUA_AVAILABLE = !!process.env['USAGI_LUA_BINARY'] ||
  (() => { try { require('child_process').execSync('lua -v', {stdio:'pipe'}); return true; } catch { return false; } })();

describe.skipIf(!LUA_AVAILABLE)('runLuaSandbox', () => {
  it('executes a simple _config() and returns parsed table', async () => {
    const result = await runLuaSandbox('return { game_id = "test", width = 320 }');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config['game_id']).toBe('test');
      expect(result.config['width']).toBe(320);
    }
  });

  it('returns error on syntax error', async () => {
    const result = await runLuaSandbox('return { invalid syntax }}}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorType).toBe('syntax');
  });

  it('times out after USAGI_SANDBOX_TIMEOUT_MS (test uses 500ms)', async () => {
    const result = await runLuaSandbox(
      'while true do end',
      { timeoutMs: 500 }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorType).toBe('timeout');
  }, 3000);

  it('blocks access to os module', async () => {
    const result = await runLuaSandbox('return { val = os and os.execute("echo pwned") or "blocked" }');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config['val']).toBe('blocked');
  });

  it('blocks access to io module', async () => {
    const result = await runLuaSandbox('if io then return { escape = true } end return { escape = false }');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config['escape']).toBe(false);
  });
});
