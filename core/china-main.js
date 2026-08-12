import { ChinaMap } from './chinaMap.js?v=33';
import { loadChinaProvinces } from './chinaMapData.js';
import { activePerson, personUrl } from './data/personRegistry.js?v=36';
import { NavigationRail } from './components/navigation/NavigationRail.js?v=32';
import { loadEventCatalog } from './data/eventCatalog.js?v=2';
import { CommunityClient } from './components/community/communityClient.js?v=4';

async function init() {
  const person = activePerson();
  const communityClient = new CommunityClient();
  await communityClient.init().catch((error) => console.warn('社区账号初始化失败：', error.message));
  const events = await loadEventCatalog(communityClient, person.events);
  const eventMarks = await communityClient.getEventMarks(events).catch(() => new Map());
  const chinaBackgroundUrl = new URL(person.backgrounds.chinaMap, window.location.href).href;
  document.documentElement.style.setProperty('--person-china-background', `url("${chinaBackgroundUrl}")`);
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
    backgroundImage: person.backgrounds.chinaMap,
    eventMarks,
    onToggleEventMark: async (event, type, current) => {
      if (!communityClient.user) {
        window.location.href = './index.html?community=account';
        return current;
      }
      try {
        return await communityClient.toggleEventMark(event, type, current);
      } catch (error) {
        window.alert(error.message);
        return current;
      }
    },
    onToggleEventLike: async (event, current) => {
      if (!communityClient.user) {
        window.location.href = './index.html?community=account';
        return current;
      }
      try {
        return await communityClient.toggleEventLike(event, current);
      } catch (error) {
        window.alert(error.message);
        return current;
      }
    },
    onBack: () => {
      window.location.href = personUrl(person.id, './index.html');
    }
  });
  map.setProvinceData(features);
  map.show();
  new NavigationRail({
    container: document.body,
    active: 'earth',
    actions: [{ id: 'openChinaFilter', label: '筛选活动', icon: '⌕', controls: 'cmFilterPanel', expanded: false }],
  });
  document.querySelector('#openChinaFilter')?.addEventListener('click', () => map.setFilterOpen(true));
}

init();
