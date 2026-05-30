export interface McpError {
  type: string;
  file?: string;
  line?: number;
  message: string;
  hint?: string;
  suggested_fix?: string;
  lua_error?: string;
  reason?: string;
  retry_after_ms?: number;
}

type ErrorOptions = Omit<McpError, 'type' | 'message'>;

export function makeError(type: string, message: string, opts: ErrorOptions = {}): McpError {
  return { type, message, ...opts };
}

export function isUsagiError(v: unknown): v is McpError {
  return typeof v === 'object' && v !== null && 'type' in v && 'message' in v;
}

export function redactAbsolutePaths(message: string, projectPath: string): string {
  // Normalize separators for comparison
  const normalized = projectPath.replace(/\\/g, '/');
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match Unix-style absolute paths starting with projectPath
  let result = message.replace(new RegExp(escaped.replace(/\//g, '[/\\\\]') + '[/\\\\]?([^\\s"\']*)', 'gi'),
    (_, rest) => `<project>/${rest}`);
  // Also match Windows-style with backslashes
  const winEscaped = projectPath.replace(/\\/g, '\\\\').replace(/[.*+?^${}()|[\]]/g, '\\$&');
  result = result.replace(new RegExp(winEscaped + '\\\\?([^\\s"\']*)', 'gi'),
    (_, rest) => `<project>/${rest.replace(/\\/g, '/')}`);
  return result;
}
