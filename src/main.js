import { EventGlobe } from './globe.js';
import { loadChinaProvinces } from './chinaMapData.js';
import { events } from './data/events.js';
import { cityLights } from './data/cities.js';

// 加载省区数据（球面渲染用）
async function loadProvinceData() {
  try {
    const data = await loadChinaProvinces();
    return data.features || [];
  } catch (error) {
    console.warn(error.message);
    return [];
  }
}

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="app-shell">
    <main class="globe-panel">
      <div class="brand">
        <div class="brand-title">MY EVENT EARTH</div>
        <div class="brand-subtitle">拖动旋转 · 滚轮缩放 · 点击聚合节点继续放大</div>
      </div>

      <svg id="globe" aria-label="活动地球"></svg>

      <section id="eventCard" class="event-card hidden" aria-live="polite">
        <div class="event-card-header">
          <div>
            <div id="cardCategory" class="category-badge"></div>
            <div id="cardTitle" class="event-title"></div>
          </div>
          <button id="closeCard" class="close-button" type="button">×</button>
        </div>

        <div id="cardMeta" class="event-meta"></div>
        <div id="cardDescription" class="event-description"></div>

        <div class="card-actions">
          <button type="button" class="ui-button">查看详情</button>
          <button type="button" class="ui-button">我参加过</button>
        </div>
      </section>
    </main>

    <aside class="sidebar">
      <h2>活动地球</h2>

      <div class="control-group">
        <label for="yearFilter">年份</label>
        <select id="yearFilter">
          <option value="all">全部年份</option>
          <option value="2026">2026</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
        </select>
      </div>

      <div class="control-group">
        <label for="categoryFilter">活动类别</label>
        <select id="categoryFilter">
          <option value="all">全部类别</option>
          <option value="音乐剧">音乐剧</option>
          <option value="综艺">综艺</option>
          <option value="晚会">晚会</option>
        </select>
      </div>

      <div class="switches">
        <label class="switch-row">
          <input id="rotateToggle" type="checkbox" checked />
          自动缓慢旋转
        </label>

        <label class="switch-row">
          <input id="nightToggle" type="checkbox" checked />
          昼夜明暗
        </label>

        <label class="switch-row">
          <input id="lightsToggle" type="checkbox" checked />
          夜侧城市灯光
        </label>
      </div>

      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">当前活动</div>
          <div id="eventCount" class="stat-value">${events.length}</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">涉及城市</div>
          <div id="cityCount" class="stat-value">${new Set(events.map((event) => event.city)).size}</div>
        </div>
      </div>

      <div class="legend">
        <div class="legend-title">节点颜色</div>
        <div class="legend-row"><span class="legend-dot legend-musical"></span>音乐剧</div>
        <div class="legend-row"><span class="legend-dot legend-variety"></span>综艺</div>
        <div class="legend-row"><span class="legend-dot legend-gala"></span>晚会</div>
      </div>

      <div class="note">
        当前地球已经包括深蓝海洋、绿色/土黄色大陆、高纬极地区域、实时昼夜近似、夜侧灯光、大气光晕、星空、活动节点脉冲和自动聚合/展开。<br /><br />
        城市灯光目前是视觉演示点，不是真实人口密度数据。
      </div>
    </aside>
  </div>
`;

const card = document.querySelector('#eventCard');

function openEventCard(event) {
  document.querySelector('#cardCategory').textContent = event.category;
  document.querySelector('#cardTitle').textContent = event.title;
  document.querySelector('#cardMeta').textContent = `${event.dateLabel || event.date} · ${event.city} · ${event.venue}${event.role ? ' · ' + event.role : ''}`;
  document.querySelector('#cardDescription').textContent = event.description;
  card.classList.remove('hidden');
}

function closeEventCard() {
  card.classList.add('hidden');
}

let globe;

(async () => {
  const provinceFeatures = await loadProvinceData();

  globe = new EventGlobe({
    svgElement: document.querySelector('#globe'),
    events,
    cityLights,
    provinceFeatures,
    onEventSelect: openEventCard,
    onClusterSelect: closeEventCard,
    onChinaClick: () => { window.location.href = './china.html'; }
  });

  // 绑定筛选和开关事件
  document.querySelector('#yearFilter').addEventListener('change', applyFilters);
  document.querySelector('#categoryFilter').addEventListener('change', applyFilters);
  document.querySelector('#rotateToggle').addEventListener('change', (event) => globe.setAutoRotate(event.target.checked));
  document.querySelector('#nightToggle').addEventListener('change', (event) => globe.setShowNight(event.target.checked));
  document.querySelector('#lightsToggle').addEventListener('change', (event) => globe.setShowLights(event.target.checked));
  document.querySelector('#closeCard').addEventListener('click', closeEventCard);
  document.querySelector('#globe').addEventListener('click', (event) => {
    if (event.target.closest('.map-node')) return;
    globe.clearExpanded();
    closeEventCard();
  });
})();

function applyFilters() {
  if (!globe) return;
  const year = document.querySelector('#yearFilter').value;
  const category = document.querySelector('#categoryFilter').value;
  const filtered = globe.setFilters({ year, category });

  document.querySelector('#eventCount').textContent = filtered.length;
  document.querySelector('#cityCount').textContent = new Set(filtered.map((event) => event.city)).size;
  closeEventCard();
}
