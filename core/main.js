import { EventGlobe } from './globe.js?v=31';
import { loadChinaProvinces } from './chinaMapData.js';
import { activePerson, people, personUrl } from './data/personRegistry.js?v=35';
import { cityLights } from './data/cities.js';
import { EventTimeline } from './components/timeline/EventTimeline.js';
import { fillEventLinks } from './components/event-details/eventLinks.js';
import { NavigationRail } from './components/navigation/NavigationRail.js?v=31';
import { defaultTourForPerson } from './config/tours.js';

async function loadProvinceData() {
  try {
    const data = await loadChinaProvinces();
    return data.features || [];
  } catch (error) {
    console.warn(error.message);
    return [];
  }
}

function getEventDates(event) {
  if (Array.isArray(event.dates) && event.dates.length) return event.dates.map((item) => item.date).filter(Boolean);
  if (!event.date) return [];
  return [event.date.split('~')[0].trim()];
}

const person = activePerson();
const events = person.events;
const earthBackgroundUrl = new URL(person.backgrounds.earth, window.location.href).href;
document.documentElement.style.setProperty('--person-earth-background', `url("${earthBackgroundUrl}")`);
localStorage.setItem('event-earth-person', person.id);
document.title = `${person.name} · My Event Earth`;

const availableDates = events.flatMap(getEventDates).sort();
const defaultStartDate = availableDates[0] || '2024-01-01';
const defaultEndDate = availableDates.at(-1) || '2026-12-31';
const categories = [...new Set(events.map((event) => event.category))];
const locations = [...new Set(events.flatMap((event) => [event.country, event.city, event.venue]).filter(Boolean))].sort();
const categoryClass = (category) => ({ 音乐剧: 'musical', 综艺: 'variety', 晚会: 'gala', 音乐会: 'concert' }[category] || 'other');

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="app-shell sidebar-collapsed">
    <main class="globe-panel">
      <header class="topbar">
        <div class="brand">
          <div class="brand-title">MY EVENT EARTH</div>
          <div class="brand-subtitle">${person.subtitle}</div>
        </div>
        <div class="topbar-actions">
          <label class="person-switcher">
            <span>人物</span>
            <select id="personSelect" aria-label="切换人物">
              ${people.map((item) => `<option value="${item.id}"${item.id === person.id ? ' selected' : ''}>${item.name}</option>`).join('')}
            </select>
          </label>
          <button class="ui-button" type="button">+ 添加活动</button>
          <button class="ui-button" type="button">登录</button>
        </div>
      </header>

      <aside id="filterPanel" class="sidebar hidden-panel" aria-label="活动筛选">
        <div class="sidebar-header">
          <div>
            <h2>探索活动</h2>
            <div id="filterSummary" class="filter-summary">${events.length} 个节点 · ${new Set(events.map((event) => event.city)).size} 个城市</div>
          </div>
          <button id="closeSidebar" class="icon-button" type="button" aria-label="收起筛选面板">‹</button>
        </div>

        <div class="control-group">
          <label for="keywordFilter">关键词</label>
          <div class="input-with-icon">
            <span aria-hidden="true">⌕</span>
            <input id="keywordFilter" type="search" placeholder="剧目、演员、场馆……" />
          </div>
        </div>

        <div class="control-group">
          <label>时间范围</label>
          <div class="date-range">
            <input id="startDateFilter" type="date" value="${defaultStartDate}" aria-label="开始日期" />
            <span>—</span>
            <input id="endDateFilter" type="date" value="${defaultEndDate}" aria-label="结束日期" />
          </div>
        </div>

        <div class="control-group">
          <label for="locationFilter">地点</label>
          <input id="locationFilter" type="search" list="locationOptions" placeholder="国家、城市或场馆" />
          <datalist id="locationOptions">${locations.map((location) => `<option value="${location}"></option>`).join('')}</datalist>
        </div>

        <fieldset class="control-group category-fieldset">
          <legend>活动种类</legend>
          <div class="category-options">
            ${categories.map((category) => `
              <label class="category-option">
                <input type="checkbox" name="categoryFilter" value="${category}" checked />
                <span class="category-color category-${categoryClass(category)}"></span>
                <span>${category}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>

        <div class="filter-actions">
          <button id="applyFilters" class="ui-button primary-button" type="button">应用筛选</button>
          <button id="resetFilters" class="ui-button reset-button" type="button"><span aria-hidden="true">↺</span> Reset</button>
        </div>

        <div class="sidebar-divider"></div>

        <div class="switches">
          <label class="switch-row"><input id="rotateToggle" type="checkbox" checked /><span>自动缓慢旋转</span></label>
          <label class="switch-row"><input id="nightToggle" type="checkbox" checked /><span>昼夜明暗</span></label>
          <label class="switch-row"><input id="lightsToggle" type="checkbox" checked /><span>夜侧城市灯光</span></label>
        </div>

        <div class="legend compact-legend">
          ${categories.map((category) => `<div class="legend-row"><span class="legend-dot category-${categoryClass(category)}"></span>${category}</div>`).join('')}
        </div>
      </aside>

      <svg id="globe" aria-label="活动地球"></svg>

      <div id="activeFilterBar" class="active-filter-bar">全球 · ${defaultStartDate.slice(0, 4)}—${defaultEndDate.slice(0, 4)} · 全部类别</div>

      <section id="eventCard" class="event-card hidden" aria-live="polite">
        <div class="event-card-header">
          <div><div id="cardCategory" class="category-badge"></div><div id="cardTitle" class="event-title"></div></div>
          <button id="closeCard" class="close-button" type="button">×</button>
        </div>
        <div id="cardMeta" class="event-meta"></div>
        <div id="cardDescription" class="event-description"></div>
        <div id="cardLinks" class="event-detail-links" hidden></div>
      </section>
    </main>
  </div>
`;

const card = document.querySelector('#eventCard');
document.querySelector('#personSelect').addEventListener('change', (event) => {
  localStorage.setItem('event-earth-person', event.target.value);
  window.location.href = personUrl(event.target.value);
});
new NavigationRail({
  container: document.body,
  active: 'earth',
  actions: [
    { id: 'openTourMaps', label: '巡演地图', icon: '巡', href: personUrl(person.id, `./tour.html?work=${defaultTourForPerson(person.id)?.id || ''}`) },
    { id: 'openSidebar', label: '筛选活动', icon: '⌕', controls: 'filterPanel', expanded: false },
  ],
});
const shell = document.querySelector('.app-shell');
const sidebar = document.querySelector('#filterPanel');
const openSidebarButton = document.querySelector('#openSidebar');
const timeline = new EventTimeline({
  container: document.querySelector('.globe-panel'),
  dates: availableDates,
  onChange: ({ startDate, endDate }) => {
    document.querySelector('#startDateFilter').value = startDate;
    document.querySelector('#endDateFilter').value = endDate;
    applyFilters(false);
  }
});

function openEventCard(event) {
  document.querySelector('#cardCategory').textContent = event.category;
  document.querySelector('#cardTitle').textContent = event.title;
  document.querySelector('#cardMeta').textContent = `${event.dateLabel || event.date} · ${event.city} · ${event.venue}${event.role ? ' · ' + event.role : ''}`;
  document.querySelector('#cardDescription').textContent = event.description;
  fillEventLinks(document.querySelector('#cardLinks'), event);
  card.classList.remove('hidden');
}

function closeEventCard() {
  card.classList.add('hidden');
}

function setSidebarCollapsed(collapsed) {
  shell.classList.toggle('sidebar-collapsed', collapsed);
  sidebar.classList.toggle('hidden-panel', collapsed);
  openSidebarButton.classList.toggle('hidden', !collapsed);
  openSidebarButton.setAttribute('aria-expanded', String(!collapsed));
}

let globe;

(async () => {
  const provinceFeatures = await loadProvinceData();
  globe = new EventGlobe({
    svgElement: document.querySelector('#globe'),
    events,
    cityLights,
    provinceFeatures,
    backgroundImage: person.backgrounds.earth,
    onEventSelect: openEventCard,
    onClusterSelect: closeEventCard,
    onChinaClick: () => { window.location.href = personUrl(person.id, './china.html'); }
  });

  document.querySelector('#applyFilters').addEventListener('click', applyFilters);
  document.querySelector('#resetFilters').addEventListener('click', resetFilters);
  document.querySelector('#keywordFilter').addEventListener('keydown', (event) => { if (event.key === 'Enter') applyFilters(); });
  document.querySelector('#locationFilter').addEventListener('keydown', (event) => { if (event.key === 'Enter') applyFilters(); });
  document.querySelector('#closeSidebar').addEventListener('click', () => setSidebarCollapsed(true));
  document.querySelector('#openSidebar').addEventListener('click', () => setSidebarCollapsed(false));
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

function selectedCategories() {
  return [...document.querySelectorAll('input[name="categoryFilter"]:checked')].map((input) => input.value);
}

function applyFilters(syncTimeline = true) {
  if (!globe) return;
  const startDate = document.querySelector('#startDateFilter').value;
  const endDate = document.querySelector('#endDateFilter').value;
  const location = document.querySelector('#locationFilter').value.trim();
  const keyword = document.querySelector('#keywordFilter').value.trim();
  const categoriesSelected = selectedCategories();
  const filtered = globe.setFilters({ startDate, endDate, location, categories: categoriesSelected, keyword });
  const cityCount = new Set(filtered.map((event) => event.city)).size;
  document.querySelector('#filterSummary').textContent = `${filtered.length} 个节点 · ${cityCount} 个城市`;
  document.querySelector('#activeFilterBar').textContent = `${location || '全球'} · ${startDate.slice(0, 4)}—${endDate.slice(0, 4)} · ${categoriesSelected.length === categories.length ? '全部类别' : categoriesSelected.join('、') || '未选类别'}`;
  closeEventCard();
  if (syncTimeline) timeline.setRange(startDate, endDate, false);
}

function resetFilters() {
  document.querySelector('#keywordFilter').value = '';
  document.querySelector('#locationFilter').value = '';
  document.querySelector('#startDateFilter').value = defaultStartDate;
  document.querySelector('#endDateFilter').value = defaultEndDate;
  document.querySelectorAll('input[name="categoryFilter"]').forEach((input) => { input.checked = true; });
  document.querySelector('#rotateToggle').checked = true;
  document.querySelector('#nightToggle').checked = true;
  document.querySelector('#lightsToggle').checked = true;
  timeline.reset(false);
  globe.resetView();
  globe.setAutoRotate(true);
  globe.setShowNight(true);
  globe.setShowLights(true);
  const filtered = globe.setFilters({ startDate: defaultStartDate, endDate: defaultEndDate, location: '', categories, keyword: '' });
  document.querySelector('#filterSummary').textContent = `${filtered.length} 个节点 · ${new Set(filtered.map((event) => event.city)).size} 个城市`;
  document.querySelector('#activeFilterBar').textContent = `全球 · ${defaultStartDate.slice(0, 4)}—${defaultEndDate.slice(0, 4)} · 全部类别`;
  closeEventCard();
}
