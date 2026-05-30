import * as lockfile from 'proper-lockfile';

const MAX_CONTENT_BYTES = 1_048_576; // 1MB
const RETRY_DELAYS_MS = [100, 200, 400];

export interface LockOptions {
  maxContentBytes?: number;
  content?: string;
}

export async function withFileLock<T>(
  filePath: string,
  callback: () => Promise<T>,
  opts: LockOptions = {}
): Promise<T> {
  if (opts.content !== undefined) {
    const limit = opts.maxContentBytes ?? MAX_CONTENT_BYTES;
    if (Buffer.byteLength(opts.content, 'utf8') > limit) {
      throw Object.assign(
        new Error('Content exceeds size limit'),
        { type: 'invalid_parameter', reason: 'content_too_large' }
      );
    }
  }

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const release = await lockfile.lock(filePath, { retries: 0, realpath: false });
      try {
        return await callback();
      } finally {
        await release().catch(() => {});
      }
    } catch (e: unknown) {
      const err = e as { code?: string };
      const isRetryable = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'ELOCKED';
      if (isRetryable && attempt < RETRY_DELAYS_MS.length) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw Object.assign(
          new Error('Could not acquire file lock after retries'),
          { type: 'lock_timeout' }
        );
      }
      throw e;
    }
  }
  // unreachable but satisfies TypeScript
  throw new Error('unreachable');
}

export async function withMultiLock<T>(
  filePaths: string[],
  callback: () => Promise<T>
): Promise<T> {
  const sorted = [...filePaths].sort();
  const releases: Array<() => Promise<void>> = [];
  try {
    for (const p of sorted) {
      const release = await lockfile.lock(p, { retries: 0, realpath: false });
      releases.push(release);
    }
    return await callback();
  } finally {
    // Release in reverse order
    for (const release of releases.reverse()) {
      await release().catch(() => {});
    }
  }
}
