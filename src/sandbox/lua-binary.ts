import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as https from 'https';
import { createWriteStream } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Platform } from '../types.js';

const execFileAsync = promisify(execFile);

const LUA_VERSION = '5.5.0-usagi1';
const CACHE_DIR = path.join(os.homedir(), '.usagi-mcp', 'lua-bin', LUA_VERSION);

// SHA-256 hashes keyed by platform — updated per release
const EXPECTED_SHA256: Record<Platform, string> = {
  'linux-x64':   'PLACEHOLDER_LINUX_X64_SHA256',
  'macos-arm64': 'PLACEHOLDER_MACOS_ARM64_SHA256',
  'macos-x64':   'PLACEHOLDER_MACOS_X64_SHA256',
  'win32-x64':   'PLACEHOLDER_WIN32_X64_SHA256',
};

const DOWNLOAD_URL_BASE =
  `https://github.com/usagi-engine/usagi/releases/download/lua-${LUA_VERSION}`;

function detectPlatform(): Platform {
  const p = process.platform;
  const a = process.arch;
  if (p === 'linux' && a === 'x64') return 'linux-x64';
  if (p === 'darwin' && a === 'arm64') return 'macos-arm64';
  if (p === 'darwin') return 'macos-x64';
  if (p === 'win32') return 'win32-x64';
  throw new Error(`Unsupported platform: ${p}/${a}`);
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function downloadFile(url: string, dest: string, redirectCount = 0): Promise<void> {
  if (redirectCount > 3) throw new Error('Too many redirects');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, { timeout: 60_000 }, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        const location = res.headers.location;
        if (!location || !location.startsWith('https://')) {
          reject(new Error(`Unsafe redirect: ${location}`));
          return;
        }
        const allowed = ['https://github.com/', 'https://objects.githubusercontent.com/'];
        if (!allowed.some(prefix => location.startsWith(prefix))) {
          reject(new Error(`Redirect to unexpected domain: ${location}`));
          return;
        }
        downloadFile(location, dest, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function removeQuarantine(binPath: string): Promise<void> {
  if (process.platform !== 'darwin') return;
  try {
    await execFileAsync('xattr', ['-d', 'com.apple.quarantine', binPath]);
  } catch {
    // Attribute may not be present — that's fine
  }
}

export async function getLuaBinary(): Promise<string> {
  // 1. Env override (for CI / development with system Lua)
  const envBinary = process.env['USAGI_LUA_BINARY'];
  if (envBinary) return envBinary;

  const platform = detectPlatform();
  const binaryName = platform === 'win32-x64' ? 'lua.exe' : 'lua';
  const cachedPath = path.join(CACHE_DIR, binaryName);

  // 2. Check cache
  try {
    await fs.access(cachedPath, fs.constants.X_OK);
    const hash = await sha256File(cachedPath);
    if (hash === EXPECTED_SHA256[platform]) {
      return cachedPath;
    }
    // Hash mismatch — re-download
    await fs.unlink(cachedPath);
  } catch {
    // Not cached or not executable
  }

  // 3. Download
  const fileName = `lua-${platform}${platform === 'win32-x64' ? '.exe' : ''}`;
  const url = `${DOWNLOAD_URL_BASE}/${fileName}`;
  const tempName = `lua_update_${crypto.randomBytes(8).toString('hex')}.tmp`;
  const tempPath = path.join(CACHE_DIR, tempName);

  await downloadFile(url, tempPath);

  // 4. Verify SHA-256 before placing
  const hash = await sha256File(tempPath);
  if (hash !== EXPECTED_SHA256[platform]) {
    await fs.unlink(tempPath);
    throw new Error(`SHA-256 mismatch for ${platform} Lua binary. Expected ${EXPECTED_SHA256[platform]}, got ${hash}`);
  }

  // 5. Atomic rename
  await fs.rename(tempPath, cachedPath);
  await fs.chmod(cachedPath, 0o500); // user read+execute only

  // 6. Remove macOS quarantine
  await removeQuarantine(cachedPath);

  return cachedPath;
}
