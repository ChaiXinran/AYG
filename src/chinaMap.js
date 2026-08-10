import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const W = 960;
const H = 720;

const CATEGORY_COLORS = {
  音乐剧: '#ff5d8f',
  综艺: '#42c9e8',
  晚会: '#f5bd4f'
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

export class ChinaMap {
  constructor({ container, events, onBack }) {
    this.container = d3.select(container);
    this.events = events || [];
    this.onBack = onBack;
    this.provinceFeatures = [];
    this.selectedEventId = null;
    this.selectedProvince = null;
    this.mapViewport = null;
    this.mapTitle = null;
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
      .attr('href', './background/ayg8.jpg')
      .attr('width', W)
      .attr('height', H)
      .attr('preserveAspectRatio', 'xMidYMid slice');
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#cmBg)').attr('opacity', 0.72);

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
    const path = d3.geoPath(proj);
    this.mapViewport = svg.append('g').attr('class', 'china-map-viewport');

    svg.on('click', () => this.resetProvinceZoom());

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
    this.renderMarkers(this.mapViewport, proj);

    // ── 标题栏 ──
    const hdr = svg.append('g');
    this.mapTitle = hdr.append('text').attr('x', 30).attr('y', 40).attr('fill', '#eef6fb').attr('font-size', 20).attr('font-weight', 650).text('中国');
    const back = hdr.append('g').attr('transform', `translate(${W - 100}, 18)`).style('cursor', 'pointer').on('click', (event) => {
      event.stopPropagation();
      this.onBack?.();
    });
    back.append('rect').attr('width', 76).attr('height', 32).attr('rx', 8).attr('fill', '#0d1e30').attr('stroke', '#2a5068').attr('stroke-width', 1);
    back.append('text').attr('x', 38).attr('y', 21).attr('text-anchor', 'middle').attr('fill', '#c0d0d8').attr('font-size', 13).text('← 返回');

    // ── 事件卡片 ──
    this.renderEventCard(svg);
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
    const scale = Math.min(3.8, Math.max(1.35, 0.72 / Math.max(width / W, height / H)));
    const centerX = (x0 + x1) / 2;
    const centerY = (y0 + y1) / 2;

    this.selectedProvince = name;
    this.mapTitle?.text(`中国 · ${name}`);
    this.mapViewport.classed('is-zoomed', true);
    this.mapViewport.style('--map-inverse-scale', 1 / scale);
    this.provinceLabels?.classed('is-selected', (item) => item.properties?.name === name);
    this.mapViewport
      .transition()
      .duration(720)
      .ease(d3.easeCubicInOut)
      .attr('transform', `translate(${W / 2},${H / 2}) scale(${scale}) translate(${-centerX},${-centerY})`);
  }

  resetProvinceZoom() {
    if (!this.selectedProvince) return;
    this.selectedProvince = null;
    this.mapTitle?.text('中国');
    this.mapViewport?.classed('is-zoomed', false);
    this.mapViewport?.style('--map-inverse-scale', 1);
    this.provinceLabels?.classed('is-selected', false);
    this.mapViewport
      ?.transition()
      .duration(620)
      .ease(d3.easeCubicInOut)
      .attr('transform', null);
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

  // ═══ 事件标点 ═══
  renderMarkers(svg, proj) {
    const chinaEvents = this.events.filter((e) => e.lon >= 73 && e.lon <= 135 && e.lat >= 17 && e.lat <= 54);
    const mg = svg.append('g');
    const nodes = mg.selectAll('g').data(chinaEvents, (d) => d.id).join('g')
      .attr('transform', (d) => { const [x, y] = proj([d.lon, d.lat]); return `translate(${x},${y})`; })
      .style('cursor', 'pointer')
      .on('click', (ev, d) => { ev.stopPropagation(); this.selectEvent(d); });

    const visuals = nodes.append('g').attr('class', 'event-node-visual');

    visuals.append('circle')
      .attr('class', 'event-node-pulse')
      .attr('r', 7)
      .attr('fill', 'none')
      .attr('stroke', (d) => CATEGORY_COLORS[d.category] || '#b9d2df')
      .attr('stroke-width', 2);
    visuals.append('circle')
      .attr('class', 'event-node-halo')
      .attr('r', 9)
      .attr('fill', (d) => CATEGORY_COLORS[d.category] || '#b9d2df');
    visuals.append('circle')
      .attr('class', 'event-node-core')
      .attr('r', 5.5)
      .attr('fill', (d) => CATEGORY_COLORS[d.category] || '#b9d2df')
      .attr('stroke', '#06101c')
      .attr('stroke-width', 2);
    visuals.append('text').attr('dx', 9).attr('dy', 4).attr('fill', '#eef6fb').attr('font-size', 11)
      .attr('paint-order', 'stroke').attr('stroke', '#06101c').attr('stroke-width', 4).attr('stroke-linejoin', 'round')
      .text((d) => d.city);
  }

  selectEvent(d) {
    this.selectedEventId = d.id;
    const card = this.container.select('#cmCard');
    card.classed('hidden', false);
    card.select('#cmCat').text(d.category);
    card.select('#cmTitle').text(d.title);
    card.select('#cmMeta').text(`${d.dateLabel || d.date} · ${d.city} · ${d.venue}${d.role ? ' · ' + d.role : ''}`);
    card.select('#cmDesc').text(d.description);
  }

  renderEventCard(svg) {
    const card = svg.append('foreignObject').attr('id', 'cmCard').attr('x', 20).attr('y', H - 130).attr('width', 340).attr('height', 110).attr('class', 'hidden');
    const div = card.append('xhtml:div').attr('style',
      'font-family:Inter,system-ui,sans-serif;background:rgba(6,18,31,0.94);border:1px solid rgba(155,192,216,0.16);border-radius:14px;padding:14px 16px;color:#eef6fb;backdrop-filter:blur(18px);box-shadow:0 20px 60px rgba(0,0,0,0.3);height:100%;box-sizing:border-box;');
    div.html(`<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><span id="cmCat" style="display:inline-block;padding:2px 8px;border-radius:99px;background:#173048;color:#a9d3e9;font-size:10px;margin-bottom:6px;"></span><div id="cmTitle" style="font-size:15px;font-weight:650;"></div></div><button id="cmClose" style="background:#11283c;border:1px solid #29465d;color:#91a7b8;width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:15px;">×</button></div><div id="cmMeta" style="font-size:12px;color:#8fa3b5;margin-top:6px;"></div><div id="cmDesc" style="font-size:12px;color:#d0dce5;margin-top:6px;"></div>`);
    svg.select('#cmClose').on('click', () => { this.selectedEventId = null; card.classed('hidden', true); });
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
