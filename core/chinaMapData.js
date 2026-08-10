const LOCAL_MAP = new URL('./data/maps/china-provinces.geojson', import.meta.url);

const FALLBACK_MAP =
  'https://cdn.jsdelivr.net/gh/yihong0618/running_page@1639f8b270fa2f74af0a9122dcf37bf110e2971a/src/assets/china-provinces.json';

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`map data load failed: ${response.status}`);
  }
  return normalizeForD3(await response.json());
}

// GeoJSON 标准外环通常为逆时针，而 d3-geo 的球面多边形使用相反方向。
// 未转换时 d3 会把每个省解释成“除该省之外的整个世界”，最终整张图被填满。
function normalizeForD3(geojson) {
  const reversePolygon = (polygon) => polygon.map((ring) => [...ring].reverse());
  const features = (geojson.features || []).map((feature) => {
    const geometry = feature.geometry;
    if (!geometry) return feature;
    if (geometry.type === 'Polygon') {
      return { ...feature, geometry: { ...geometry, coordinates: reversePolygon(geometry.coordinates) } };
    }
    if (geometry.type === 'MultiPolygon') {
      return {
        ...feature,
        geometry: { ...geometry, coordinates: geometry.coordinates.map(reversePolygon) }
      };
    }
    return feature;
  });
  return { ...geojson, features };
}

export async function loadChinaProvinces() {
  try {
    return await loadJson(LOCAL_MAP);
  } catch (localError) {
    try {
      return await loadJson(FALLBACK_MAP);
    } catch (remoteError) {
      throw new Error(`省区数据加载失败（本地：${localError.message}；备用：${remoteError.message}）`);
    }
  }
}
