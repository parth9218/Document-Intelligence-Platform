export type EndpointMode = 'api' | 'mock';

export interface ApiRoutingConfig {
  session: EndpointMode;
  documents: EndpointMode;
  progress: EndpointMode;
  query: EndpointMode;
}

export function getDefaultApiMode(): 'api' | 'mock' | 'hybrid' {
  return (
    (typeof window !== 'undefined' && window.__APP_CONFIG__?.API_MODE) ||
    process.env.NEXT_PUBLIC_API_MODE ||
    'hybrid'
  ) as 'api' | 'mock' | 'hybrid';
}

const defaultMode = getDefaultApiMode();

// In hybrid mode, everything defaults to mock unless explicitly set
export const apiRouting: ApiRoutingConfig = {
  session: defaultMode === 'api' ? 'api' : defaultMode === 'mock' ? 'mock' : 'mock',
  documents: defaultMode === 'api' ? 'api' : defaultMode === 'mock' ? 'mock' : 'mock',
  progress: defaultMode === 'api' ? 'api' : defaultMode === 'mock' ? 'mock' : 'mock',
  query: defaultMode === 'api' ? 'api' : defaultMode === 'mock' ? 'mock' : 'mock',
};

// Check if we should override individually via localStorage (only in browser)
if (typeof window !== 'undefined') {
  const savedConfig = localStorage.getItem('api_routing_config');
  if (savedConfig) {
    try {
      const parsed = JSON.parse(savedConfig);
      Object.assign(apiRouting, parsed);
    } catch (e) {
      console.error('Failed to parse api_routing_config', e);
    }
  }
}
