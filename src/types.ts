export type Platform = 'linux-x64' | 'macos-arm64' | 'macos-x64' | 'win32-x64';

export interface UsagiConfig {
  game_id?: string;
  title?: string;
  width?: number;
  height?: number;
  sprite_size?: number;
  actions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParsedConfig {
  config: UsagiConfig;
  config_parse_mode: 'sandbox' | 'fallback_regex';
  missing_fields?: string[];
}

export interface AllowedRoots {
  roots: string[];
}

export interface ProjectResourceParams {
  projectPath: string;
}
