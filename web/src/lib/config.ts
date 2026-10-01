export type AppConfig = {
  userPoolId: string;
  userPoolClientId: string;
  userPoolDomain: string;
  region: string;
  apiUrl: string;
  proxyUrl: string;
};

let _config: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config;
  const res = await fetch('/config.json');
  if (!res.ok) throw new Error(`Failed to load config: ${res.status}`);
  _config = (await res.json()) as AppConfig;
  return _config;
}

export function getConfig(): AppConfig {
  if (!_config) throw new Error('Config not loaded. Call loadConfig() first.');
  return _config;
}
