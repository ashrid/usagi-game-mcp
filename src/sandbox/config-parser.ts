import type { ParsedConfig, UsagiConfig } from '../types.js';
import { runLuaSandbox } from './lua-runner.js';

const KNOWN_CONFIG_KEYS = ['game_id', 'title', 'width', 'height', 'sprite_size', 'actions', 'palette'];

export async function parseConfig(luaSource: string, projectPath: string): Promise<ParsedConfig> {
  const result = await runLuaSandbox(luaSource);
  if (result.ok) {
    return {
      config: sanitizeConfigStrings(result.config) as UsagiConfig,
      config_parse_mode: 'sandbox',
    };
  }

  // Fallback to regex parsing
  const fallback = parseFallbackRegex(luaSource);
  return {
    ...fallback,
    config_parse_mode: 'fallback_regex',
  };
}

export function parseFallbackRegex(source: string): ParsedConfig {
  const config: Record<string, unknown> = {};

  // Match flat string literals: key = "value"
  for (const match of source.matchAll(/^\s*(\w+)\s*=\s*"([^"\\]*)"/gm)) {
    config[match[1]] = match[2];
  }
  // Match flat number literals: key = 123
  for (const match of source.matchAll(/^\s*(\w+)\s*=\s*(\d+(?:\.\d+)?)/gm)) {
    if (!(match[1] in config)) {
      config[match[1]] = parseFloat(match[2]);
    }
  }
  // Match flat boolean literals: key = true/false
  for (const match of source.matchAll(/^\s*(\w+)\s*=\s*(true|false)/gm)) {
    if (!(match[1] in config)) {
      config[match[1]] = match[2] === 'true';
    }
  }

  const missing_fields = KNOWN_CONFIG_KEYS.filter(k => !(k in config));
  return { config: config as UsagiConfig, config_parse_mode: 'fallback_regex', missing_fields };
}

export function sanitizeConfigStrings(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === 'string') {
      let s = v.slice(0, 1024);
      s = s.replace(/\x1b/g, '[non-printable stripped]');
      result[k] = s;
    } else if (v !== null && typeof v === 'object') {
      result[k] = sanitizeConfigStrings(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}
