import { ChinaMap } from './chinaMap.js';
import { events } from './data/events.js';

async function init() {
  // 显示加载中
  document.body.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#8aa8b8;font-family:system-ui,sans-serif;font-size:16px;">加载省区数据…</div>';

  let features = [];
  try {
    const resp = await fetch(
      'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    features = data.features || [];
  } catch (e) {
    document.body.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#c06060;font-family:system-ui,sans-serif;font-size:15px;">省区数据加载失败，请刷新重试<br><small>${e.message}</small></div>`;
    return;
  }

  const map = new ChinaMap({
    container: document.body,
    events,
    onBack: () => {
      window.location.href = '/index.html';
    }
  });
  map.setProvinceData(features);
  map.show();
}

init();
