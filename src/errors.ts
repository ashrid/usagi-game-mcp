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
  const escaped = projectPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped.replace(/\\\\/g, '[/\\\\]') + '[/\\\\]?([^\\s"\']*)', 'gi');
  return message.replace(pattern, (_, rest: string) => `<project>/${rest.replace(/\\/g, '/')}`);
}
