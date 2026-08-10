import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { EventTimeline } from './components/timeline/EventTimeline.js';
import { fillEventLinks } from './components/event-details/eventLinks.js';

const W = 960;
const H = 720;
const MAX_PROVINCE_ZOOM = 12;
const VENUE_LOD_SCALE = 2.6;
const EVENT_LOD_SCALE = 6;

const CATEGORY_COLORS = {
  音乐剧: '#ff5d8f',
  综艺: '#42c9e8',
  晚会: '#f5bd4f',
  音乐会: '#9c7cff',
  其他: '#63d6a5'
};

const PROVINCE_COLORS = ['#173f5f', '#1b496b', '#205374', '#245c7d', '#2a6687', '#30708f'];

const AMBIENT_CITIES = [
  [116.41, 39.90], [121.47, 31.23], [113.26, 23.13], [114.06, 22.55],
  [104.07, 30.67], [106.55, 29.56], [114.31, 30.59], [112.94, 28.23],
  [118.80, 32.06], [120.16, 30.27], [117.20, 39.13], [108.94, 34.34],
  [123.43, 41.80], [126.64, 45.76], [87.62, 43.82], [91.13, 29.65],
  [102.71, 25.04], [106.63, 26.65], [110.20, 20.04], [119.30, 26.08]
];

function provinceColor(feature) {
  const key = String(feature.properties?.adcode || feature.properties?.name || '');
  const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PROVINCE_COLORS[hash % PROVINCE_COLORS.length];
}

function shortTitle(value, maxLength = 14) {
  const title = String(value || '未命名活动');
  return title.length > maxLength ? `${title.slice(0, maxLength)}…` : title;
}

function eventDates(event) {
  if (Array.isArray(event.dates) && event.dates.length) return event.dates.map((item) => item.date).filter(Boolean);
  return event.date ? [String(event.date).split('~')[0].trim()] : [];
}

export class ChinaMap {
  constructor({ container, events, backgroundImage, onBack }) {
    this.container = d3.select(container);
    this.events = (events || []).filter((event) => event.lon >= 73 && event.lon <= 135 && event.lat >= 17 && event.lat <= 54);
    this.filteredEvents = [...this.events];
    this.backgroundImage = backgroundImage;
    this.onBack = onBack;
    this.provinceFeatures = [];
    this.selectedEventId = null;
    this.selectedProvince = null;
    this.mapViewport = null;
    this.mapTitle = null;
    this.markerLayer = null;
    this.projection = null;
    this.zoomBehavior = null;
    this.zoomScale = 1;
    this.timeline = null;
  }

  setProvinceData(features) {
    this.provinceFeatures = features || [];
  }

  show() {
    if (!this.provinceFeatures.length) return;
    this.render();
  }

  render() {
    const c = this.container;
    c.html('');

    const svg = c.append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'china-map-svg');

    // ── 背景渐变（和地球星空一致） ──
    const defs = svg.append('defs');
    const bgGrad = defs.append('radialGradient').attr('id', 'cmBg');
    bgGrad.append('stop').attr('offset', '0%').attr('stop-color', '#132b45');
    bgGrad.append('stop').attr('offset', '100%').attr('stop-color', '#030914');
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#cmBg)');

    svg.append('image')
      .attr('class', 'china-background-image')
      .attr('href', this.backgroundImage)
      .attr('width', W)
      .attr('height', H)
      .attr('preserveAspectRatio', 'xMidYMid slice');
    svg.append('rect').attr('class', 'china-background-overlay').attr('width', W).attr('height', H).attr('fill', 'url(#cmBg)');

    const mapGlow = defs.append('filter').attr('id', 'cmMapGlow').attr('x', '-40%').attr('y', '-40%').attr('width', '180%').attr('height', '180%');
    mapGlow.append('feGaussianBlur').attr('stdDeviation', 5).attr('result', 'blur');
    const glowMerge = mapGlow.append('feMerge');
    glowMerge.append('feMergeNode').attr('in', 'blur');
    glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // 星点
    const pseudo = (s) => { const x = Math.sin(s * 999.91) * 43758.5453; return x - Math.floor(x); };
    const stars = d3.range(80).map((i) => ({ x: pseudo(i + 1) * W, y: pseudo(i + 1000) * H, r: 0.3 + pseudo(i + 2000) * 0.8, o: 0.1 + pseudo(i + 3000) * 0.4 }));
    svg.append('g').selectAll('circle').data(stars).join('circle')
      .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r).attr('fill', '#e7f5ff').attr('opacity', (d) => d.o);

    // ── 投影 ──
    const proj = d3.geoMercator().center([104, 36]).scale(560).translate([W / 2, H / 2 + 15]);
    this.projection = proj;
    const path = d3.geoPath(proj);
    this.mapViewport = svg.append('g').attr('class', 'china-map-viewport');

    svg.on('click', (event) => {
      if (!event.target.closest?.('.lod-node')) this.closeDrawer();
    });

    const chinaClip = defs.append('clipPath').attr('id', 'chinaShapeClip');
    chinaClip.selectAll('path').data(this.provinceFeatures).join('path').attr('d', path);

    // ── 省区 ──
    const pg = this.mapViewport.append('g').attr('class', 'province-map-layer');
    pg.selectAll('path').data(this.provinceFeatures).join('path')
      .attr('class', 'china-province')
      .attr('d', path)
      .attr('fill', provinceColor)
      .attr('stroke', '#70a9c5')
      .attr('stroke-width', 0.62)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('cursor', 'pointer')
      .on('click', (event, feature) => {
        event.stopPropagation();
        this.zoomToProvince(feature, path);
      })
      .append('title').text((d) => d.properties?.name || '');

    // 中国国界加粗轮廓（叠加在省区之上）
    pg.selectAll('path.outline').data(this.provinceFeatures).join('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#6aa8c8')
      .attr('stroke-width', 1.15)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('pointer-events', 'none');

    this.provinceLabels = pg.selectAll('text.province-label').data(this.provinceFeatures).join('text')
      .attr('class', 'province-label')
      .attr('x', (feature) => path.centroid(feature)[0])
      .attr('y', (feature) => path.centroid(feature)[1] + 3)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .text((feature) => feature.properties?.name || '');

    this.renderAmbientFlow(this.mapViewport);
    this.renderCityGlow(this.mapViewport, proj);

    // ── 南海诸岛 ──
    this.renderSouthChinaSea(svg, proj, path);

    // ── 事件标点 ──
    this.markerLayer = this.mapViewport.append('g').attr('class', 'lod-marker-layer');
    this.renderMarkers();

    // ── 标题栏 ──
    const hdr = svg.append('g');
    this.mapTitle = hdr.append('text').attr('x', 30).attr('y', 40).attr('fill', '#eef6fb').attr('font-size', 20).attr('font-weight', 650).text('中国');
    const back = hdr.append('g').attr('transform', `translate(${W - 100}, 18)`).style('cursor', 'pointer').on('click', (event) => {
      event.stopPropagation();
      this.onBack?.();
    });
    back.append('rect').attr('width', 76).attr('height', 32).attr('rx', 8).attr('fill', '#0d1e30').attr('stroke', '#2a5068').attr('stroke-width', 1);
    back.append('text').attr('x', 38).attr('y', 21).attr('text-anchor', 'middle').attr('fill', '#c0d0d8').attr('font-size', 13).text('⬅︎ 返回');

    // ── 事件卡片 ──
    this.renderEventCard(svg);

    this.zoomBehavior = d3.zoom()
      .scaleExtent([1, MAX_PROVINCE_ZOOM])
      .on('zoom', (event) => {
        this.zoomScale = event.transform.k;
        this.mapViewport
          .attr('transform', event.transform)
          .classed('is-zoomed', event.transform.k > 1.05)
          .style('--map-inverse-scale', 1 / event.transform.k);
        this.renderMarkers();
      });
    svg.call(this.zoomBehavior).on('dblclick.zoom', null);
    this.renderFilterPanel();
    this.timeline = new EventTimeline({
      container: this.container.node(),
      dates: this.events.flatMap(eventDates),
      onChange: ({ startDate, endDate }) => {
        this.container.select('#cmFilterStart').property('value', startDate);
        this.container.select('#cmFilterEnd').property('value', endDate);
        this.applyFilters(false);
      }
    });
    this.renderProvinceSidebar();
  }

  zoomToProvince(feature, path) {
    const name = feature.properties?.name || '省区';
    if (this.selectedProvince === name) {
      this.resetProvinceZoom();
      return;
    }

    const [[x0, y0], [x1, y1]] = path.bounds(feature);
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    const scale = Math.min(
      EVENT_LOD_SCALE - 0.4,
      Math.max(VENUE_LOD_SCALE + 0.4, 1.05 / Math.max(width / W, height / H))
    );
    const centerX = (x0 + x1) / 2;
    const centerY = (y0 + y1) / 2;

    this.selectedProvince = name;
    this.mapTitle?.text(`中国 · ${name}`);
    this.openProvinceSidebar(feature);
    this.provinceLabels?.classed('is-selected', (item) => item.properties?.name === name);
    const transform = d3.zoomIdentity
      .translate(W / 2 - scale * centerX, H / 2 - scale * centerY)
      .scale(scale);
    this.container.select('svg')
      .transition()
      .duration(720)
      .ease(d3.easeCubicInOut)
      .call(this.zoomBehavior.transform, transform);
  }

  resetProvinceZoom() {
    if (!this.selectedProvince) return;
    this.selectedProvince = null;
    this.mapTitle?.text('中国');
    this.closeProvinceSidebar();
    this.provinceLabels?.classed('is-selected', false);
    this.container.select('svg')
      .transition()
      .duration(620)
      .ease(d3.easeCubicInOut)
      .call(this.zoomBehavior.transform, d3.zoomIdentity);
  }

  renderProvinceSidebar() {
    const sidebar = this.container.append('aside').attr('class', 'cm-province-sidebar');
    sidebar.html(`
      <div class="cm-province-sidebar-header">
        <div><strong id="cmProvinceSidebarTitle">省区活动</strong><span id="cmProvinceSidebarCount"></span></div>
        <button id="cmProvinceSidebarCollapse" type="button" aria-label="收起省区活动列表">›</button>
      </div>
      <div id="cmProvinceEventList" class="cm-province-event-list"></div>
    `);
    sidebar.on('click wheel mousedown', (event) => event.stopPropagation());
    sidebar.select('#cmProvinceSidebarCollapse').on('click', () => {
      sidebar.classed('is-collapsed', !sidebar.classed('is-collapsed'));
    });
  }

  openProvinceSidebar(feature) {
    const name = feature.properties?.name || '省区';
    const events = this.filteredEvents
      .filter((event) => d3.geoContains(feature, [event.lon, event.lat]))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const sidebar = this.container.select('.cm-province-sidebar');
    sidebar.classed('is-open', true).classed('is-collapsed', false);
    sidebar.select('#cmProvinceSidebarTitle').text(name);
    sidebar.select('#cmProvinceSidebarCount').text(`${events.length} 个活动`);
    const list = sidebar.select('#cmProvinceEventList');
    list.html('');

    if (!events.length) {
      list.append('div').attr('class', 'cm-province-empty').text('当前筛选条件下暂无活动');
      return;
    }

    events.forEach((event) => {
      const item = list.append('article').attr('class', 'cm-province-event-item');
      const button = item.append('button').attr('class', 'cm-province-event-title').attr('type', 'button').text(event.title || '未命名活动');
      const detail = item.append('div').attr('class', 'cm-province-event-detail').attr('hidden', true);
      detail.append('div').attr('class', 'cm-province-event-meta').text(event.dateLabel || event.date || '日期待补充');
      detail.append('div').attr('class', 'cm-province-event-meta').text([event.city, event.venue].filter(Boolean).join(' · '));
      if (event.description) detail.append('p').text(event.description);
      const links = detail.append('div').attr('class', 'event-detail-links').attr('hidden', true).node();
      fillEventLinks(links, event);
      button.on('click', () => {
        const willOpen = detail.attr('hidden') !== null;
        detail.attr('hidden', willOpen ? null : true);
        item.classed('is-expanded', willOpen);
      });
    });
  }

  closeProvinceSidebar() {
    this.container.select('.cm-province-sidebar').classed('is-open', false).classed('is-collapsed', false);
  }

  renderAmbientFlow(svg) {
    const flow = svg.append('g').attr('clip-path', 'url(#chinaShapeClip)').attr('class', 'ambient-flow-layer');
    const lines = [
      'M250,430 C390,300 540,300 730,205',
      'M300,500 C420,430 555,420 710,320',
      'M320,245 C450,335 590,330 735,410'
    ];
    flow.selectAll('path').data(lines).join('path')
      .attr('class', (_, i) => `ambient-flow ambient-flow-${i + 1}`)
      .attr('d', (d) => d)
      .attr('fill', 'none')
      .attr('stroke', '#7ed8ff')
      .attr('stroke-width', (_, i) => 1.2 + i * 0.35)
      .attr('filter', 'url(#cmMapGlow)');
  }

  renderCityGlow(svg, proj) {
    const cities = AMBIENT_CITIES.map(([lon, lat], index) => {
      const [x, y] = proj([lon, lat]);
      return { x, y, index };
    });
    const layer = svg.append('g').attr('class', 'ambient-city-layer').attr('pointer-events', 'none');
    const city = layer.selectAll('g').data(cities).join('g')
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .style('--city-delay', (d) => `${-(d.index % 7) * 0.38}s`);
    city.append('circle').attr('class', 'ambient-city-halo').attr('r', 4.5);
    city.append('circle').attr('class', 'ambient-city-core').attr('r', 1.15);
  }

  // ═══ 三层 LOD 标点：城市 → 场馆 → 活动 ═══
  renderMarkers() {
    if (!this.markerLayer || !this.projection) return;
    const events = this.filteredEvents.filter((e) => e.lon >= 73 && e.lon <= 135 && e.lat >= 17 && e.lat <= 54);
    const level = this.zoomScale < VENUE_LOD_SCALE ? 'city' : this.zoomScale < EVENT_LOD_SCALE ? 'venue' : 'event';
    const data = this.aggregateEvents(events, level);

    const nodes = this.markerLayer.selectAll('g.lod-node').data(data, (d) => d.key).join(
      (enter) => {
        const node = enter.append('g').attr('class', 'lod-node').style('cursor', 'pointer');
        const visual = node.append('g').attr('class', 'event-node-visual');
        visual.append('circle').attr('class', 'event-node-pulse').attr('r', 7).attr('fill', 'none').attr('stroke-width', 2);
        visual.append('circle').attr('class', 'event-node-halo').attr('r', 9);
        visual.append('circle').attr('class', 'event-node-core').attr('r', 5.5).attr('stroke', '#06101c').attr('stroke-width', 2);
        visual.append('text').attr('class', 'lod-node-count').attr('text-anchor', 'middle').attr('dy', 3.5);
        visual.append('text').attr('class', 'lod-hover-label').attr('dx', 10).attr('dy', 4);
        return node;
      },
      (update) => update,
      (exit) => exit.remove()
    )
      .attr('data-lod', level)
      .attr('transform', (d) => { const [x, y] = this.projection([d.lon, d.lat]); return `translate(${x},${y})`; })
      .on('click', (event, d) => {
        event.stopPropagation();
        if (d.level === 'event') this.selectEvent(d.events[0]);
        else this.zoomToLodNode(d);
      });

    nodes.select('.event-node-pulse').attr('stroke', (d) => d.color);
    nodes.select('.event-node-halo').attr('fill', (d) => d.color);
    nodes.select('.event-node-core').attr('fill', (d) => d.color);
    nodes.select('.lod-node-count').text((d) => d.level === 'event' ? '' : d.events.length);
    nodes.select('.lod-hover-label').text((d) => d.shortLabel);
  }

  aggregateEvents(events, level) {
    if (level === 'event') {
      return events.map((event) => ({
        key: `event:${event.id}`, level, events: [event], lon: event.lon, lat: event.lat,
        shortLabel: shortTitle(event.title), color: CATEGORY_COLORS[event.category] || '#b9d2df'
      }));
    }
    const groups = d3.group(events, (event) => level === 'city' ? event.city : `${event.city}|${event.venue}`);
    return [...groups].map(([key, members]) => ({
      key: `${level}:${key}`,
      level,
      events: members,
      lon: d3.mean(members, (event) => event.lon),
      lat: d3.mean(members, (event) => event.lat),
      shortLabel: [members[0].city, members[0].venue].some((value) => String(value || '').includes('未公开'))
        ? ''
        : shortTitle(level === 'city' ? `${members[0].city} · ${members.length}项` : `${members[0].venue} · ${members.length}项`),
      color: CATEGORY_COLORS[members[0].category] || '#b9d2df'
    }));
  }

  zoomToLodNode(d) {
    this.closeDrawer();
    const targetScale = d.level === 'city' ? Math.max(VENUE_LOD_SCALE + 0.4, this.zoomScale * 1.8) : Math.max(EVENT_LOD_SCALE + 0.5, this.zoomScale * 1.55);
    const scale = Math.min(MAX_PROVINCE_ZOOM, targetScale);
    const [x, y] = this.projection([d.lon, d.lat]);
    const transform = d3.zoomIdentity.translate(W / 2 - scale * x, H / 2 - scale * y).scale(scale);
    this.container.select('svg').transition().duration(650).ease(d3.easeCubicInOut).call(this.zoomBehavior.transform, transform);
  }

  renderFilterPanel() {
    const dates = this.events.flatMap(eventDates).sort();
    const start = dates[0] || '2024-01-01';
    const end = dates.at(-1) || '2026-12-31';
    const categories = [...new Set(this.events.map((event) => event.category).filter(Boolean))];
    const panel = this.container.append('div').attr('id', 'cmFilterPanel').attr('class', 'cm-filter-panel');
    panel.html(`
      <div class="cm-filter-header"><div><strong>筛选活动</strong><span id="cmFilterCount">${this.filteredEvents.length} 个活动</span></div><button id="cmFilterCollapse" type="button" aria-label="收起筛选面板" title="收起筛选">‹</button></div>
      <div class="cm-filter-content">
        <label>关键词<input id="cmFilterKeyword" type="search" placeholder="活动、场馆、人物" /></label>
        <label>地点<input id="cmFilterLocation" type="search" placeholder="城市或场馆" /></label>
        <div class="cm-filter-dates"><label>开始<input id="cmFilterStart" type="date" value="${start}" /></label><label>结束<input id="cmFilterEnd" type="date" value="${end}" /></label></div>
        <fieldset><legend>活动种类</legend>${categories.map((category) => `<label class="cm-filter-check"><input type="checkbox" name="cmCategory" value="${category}" checked /><span>${category}</span></label>`).join('')}</fieldset>
        <div class="cm-filter-actions"><button id="cmApplyFilters" type="button">应用筛选</button><button id="cmResetFilters" type="button">Reset</button></div>
      </div>
    `);
    panel.on('click wheel mousedown', (event) => event.stopPropagation());
    panel.select('#cmFilterCollapse').on('click', () => this.setFilterOpen(false));
    panel.select('#cmApplyFilters').on('click', () => this.applyFilters());
    panel.select('#cmResetFilters').on('click', () => this.resetFilters(start, end));
    panel.selectAll('input[type="search"]').on('keydown', (event) => { if (event.key === 'Enter') this.applyFilters(); });
  }

  setFilterOpen(open) {
    this.container.select('#cmFilterPanel').classed('is-open', open);
    const trigger = document.querySelector('#openChinaFilter');
    trigger?.classList.toggle('hidden', open);
    trigger?.setAttribute('aria-expanded', String(open));
  }

  applyFilters(syncTimeline = true) {
    const keyword = this.container.select('#cmFilterKeyword').property('value').trim().toLowerCase();
    const location = this.container.select('#cmFilterLocation').property('value').trim().toLowerCase();
    const start = this.container.select('#cmFilterStart').property('value');
    const end = this.container.select('#cmFilterEnd').property('value');
    const categories = new Set(this.container.selectAll('input[name="cmCategory"]:checked').nodes().map((node) => node.value));
    this.filteredEvents = this.events.filter((event) => {
      const dates = eventDates(event);
      const inDateRange = !dates.length || dates.some((date) => (!start || date >= start) && (!end || date <= end));
      const locationText = [event.country, event.city, event.venue].filter(Boolean).join(' ').toLowerCase();
      const keywordText = [event.title, event.description, event.role, event.artist, event.tourBatch, event.venue, event.city].filter(Boolean).join(' ').toLowerCase();
      return inDateRange
        && categories.has(event.category)
        && (!location || locationText.includes(location))
        && (!keyword || keywordText.includes(keyword));
    });
    this.container.select('#cmFilterCount').text(`${this.filteredEvents.length} 个活动`);
    this.closeDrawer();
    this.renderMarkers();
    const selectedFeature = this.provinceFeatures.find((feature) => feature.properties?.name === this.selectedProvince);
    if (selectedFeature) this.openProvinceSidebar(selectedFeature);
    if (syncTimeline) this.timeline?.setRange(start, end, false);
  }

  resetFilters(start, end) {
    this.container.select('#cmFilterKeyword').property('value', '');
    this.container.select('#cmFilterLocation').property('value', '');
    this.container.select('#cmFilterStart').property('value', start);
    this.container.select('#cmFilterEnd').property('value', end);
    this.container.selectAll('input[name="cmCategory"]').property('checked', true);
    this.timeline?.reset(false);
    this.filteredEvents = [...this.events];
    this.container.select('#cmFilterCount').text(`${this.filteredEvents.length} 个活动`);
    this.closeDrawer();
    this.renderMarkers();
    const selectedFeature = this.provinceFeatures.find((feature) => feature.properties?.name === this.selectedProvince);
    if (selectedFeature) this.openProvinceSidebar(selectedFeature);
  }

  selectEvent(d) {
    this.selectedEventId = d.id;
    this.closeProvinceSidebar();
    const drawer = this.container.select('#cmDrawer');
    drawer.classed('is-open', true).attr('pointer-events', 'all');
    drawer.select('#cmCat').text(d.category || '其他');
    drawer.select('#cmTitle').text(d.title || '未命名活动');
    drawer.select('#cmDate').text(d.dateLabel || d.date || '日期待补充');
    drawer.select('#cmLocation').text(`${d.city || ''}${d.venue ? ` · ${d.venue}` : ''}`);
    drawer.select('#cmRole').text(d.role || d.artist || '');
    drawer.select('#cmDesc').text(d.description || '暂无活动描述');
    drawer.select('#cmTour').text(d.tourSummary || '');
    fillEventLinks(this.container.select('#cmLinks').node(), d);
  }

  renderEventCard(svg) {
    const drawer = svg.append('foreignObject')
      .attr('id', 'cmDrawer').attr('x', W - 360).attr('y', 16).attr('width', 344).attr('height', H - 32)
      .attr('class', 'cm-drawer').attr('pointer-events', 'none');
    drawer.append('xhtml:div').attr('class', 'cm-drawer-panel').html(`
      <div class="cm-drawer-head"><span id="cmCat" class="cm-drawer-category"></span><button id="cmClose" class="cm-drawer-close" type="button">×</button></div>
      <h2 id="cmTitle" class="cm-drawer-title"></h2>
      <div class="cm-drawer-section"><span>时间</span><strong id="cmDate"></strong></div>
      <div class="cm-drawer-section"><span>地点</span><strong id="cmLocation"></strong></div>
      <div class="cm-drawer-section"><span>参与</span><strong id="cmRole"></strong></div>
      <div class="cm-drawer-divider"></div>
      <p id="cmDesc" class="cm-drawer-description"></p>
      <p id="cmTour" class="cm-drawer-tour"></p>
      <div id="cmLinks" class="event-detail-links" hidden></div>
    `);
    svg.select('#cmClose').on('click', (event) => { event.stopPropagation(); this.closeDrawer(); });
  }

  closeDrawer() {
    this.selectedEventId = null;
    this.container.select('#cmDrawer').classed('is-open', false).attr('pointer-events', 'none');
  }

  // ═══ 南海诸岛 ═══
  renderSouthChinaSea(svg, proj) {
    const g = svg.append('g').attr('transform', `translate(${W - 140},${H - 120})`);
    g.append('rect').attr('width', 120).attr('height', 105).attr('rx', 4).attr('fill', '#0a1628').attr('stroke', '#4a80a0').attr('stroke-width', 0.5);
    const scs = d3.geoMercator().center([115, 12]).scale(220).translate([60, 52]);
    const sp = d3.geoPath(scs);
    const names = ['海南省', '广东省', '广西壮族自治区', '台湾省', '福建省'];
    g.selectAll('path').data(this.provinceFeatures.filter((f) => names.includes(f.properties?.name)))
      .join('path').attr('d', sp).attr('fill', '#1a4a68').attr('stroke', '#4a80a0').attr('stroke-width', 0.5);
    g.append('text').attr('x', 60).attr('y', 98).attr('text-anchor', 'middle').attr('fill', '#8aa8b8').attr('font-size', 9).text('南海诸岛');
  }
}
