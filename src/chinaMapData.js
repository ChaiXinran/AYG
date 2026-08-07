const LOCAL_MAP = './data/maps/china-provinces.geojson';

const FALLBACK_MAP =
  'https://cdn.jsdelivr.net/gh/yihong0618/running_page@1639f8b270fa2f74af0a9122dcf37bf110e2971a/src/assets/china-provinces.json';

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`map data load failed: ${response.status}`);
  }
  return response.json();
}

export async function loadChinaProvinces() {
  try {
    return await loadJson(LOCAL_MAP);
  } catch (_) {
    return await loadJson(FALLBACK_MAP);
  }
}
