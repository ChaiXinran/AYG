import { ChinaMap } from './chinaMap.js?v=29';
import { loadChinaProvinces } from './chinaMapData.js';
import { activePerson, personUrl } from './data/personRegistry.js';
import { NavigationRail } from './components/navigation/NavigationRail.js';

async function init() {
  const person = activePerson();
  const events = person.events;
  // 显示加载中
  document.body.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#8aa8b8;font-family:system-ui,sans-serif;font-size:16px;">加载省区数据…</div>';

  let features = [];
  try {
    const data = await loadChinaProvinces();
    features = data.features || [];
    if (!features.length) throw new Error('GeoJSON 中没有省区数据');
  } catch (e) {
    document.body.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#c06060;font-family:system-ui,sans-serif;font-size:15px;">省区数据加载失败，请刷新重试<br><small>${e.message}</small></div>`;
    return;
  }

  const map = new ChinaMap({
    container: document.body,
    events,
    onBack: () => {
      window.location.href = personUrl(person.id, './index.html');
    }
  });
  map.setProvinceData(features);
  map.show();
  new NavigationRail({ container: document.body, active: 'earth' });
}

init();
