import { COMMUNITY_CONFIG } from './community.js';

export const DEFAULT_SITE_BACKGROUND_URL = new URL('../../background/global/site-background.jpg', import.meta.url).href;
export const SITE_BACKGROUND_CSS_VARIABLE = '--site-background-image';

let currentBackgroundUrl = DEFAULT_SITE_BACKGROUND_URL;
let backgroundRequest = null;

function cssUrl(url) {
  return `url("${String(url).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/[\r\n]/g, '')}")`;
}

export function setSiteBackground(url = DEFAULT_SITE_BACKGROUND_URL) {
  currentBackgroundUrl = url || DEFAULT_SITE_BACKGROUND_URL;
  document.documentElement.style.setProperty(SITE_BACKGROUND_CSS_VARIABLE, cssUrl(currentBackgroundUrl));
  return currentBackgroundUrl;
}

export async function loadSiteBackground({ force = false } = {}) {
  if (!force && backgroundRequest) return backgroundRequest;
  backgroundRequest = fetch(`${COMMUNITY_CONFIG.apiBaseUrl}/v1/site-settings/background?site_id=${encodeURIComponent(COMMUNITY_CONFIG.siteId)}`, {
    headers: { Accept: 'application/json' },
    cache: force ? 'reload' : 'no-cache',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('site background unavailable');
      const payload = await response.json();
      return payload?.data?.background_url || DEFAULT_SITE_BACKGROUND_URL;
    })
    .catch(() => DEFAULT_SITE_BACKGROUND_URL)
    .then(setSiteBackground);
  return backgroundRequest;
}

export async function applySiteBackground(options) {
  setSiteBackground(currentBackgroundUrl);
  return loadSiteBackground(options);
}

setSiteBackground(DEFAULT_SITE_BACKGROUND_URL);
