import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const W = 960;
const H = 720;

const CATEGORY_COLORS = {
  音乐剧: '#ff5d8f',
  综艺: '#42c9e8',
  晚会: '#f5bd4f'
};

export class ChinaMap {
  constructor({ container, events, onBack }) {
    this.container = d3.select(container);
    this.events = events || [];
    this.onBack = onBack;
    this.provinceFeatures = [];
    this.selectedEventId = null;
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
    bgGrad.append('stop').attr('offset', '0%').attr('stop-color', '#0d2037');
    bgGrad.append('stop').attr('offset', '100%').attr('stop-color', '#030914');
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#cmBg)');

    // 星点
    const pseudo = (s) => { const x = Math.sin(s * 999.91) * 43758.5453; return x - Math.floor(x); };
    const stars = d3.range(80).map((i) => ({ x: pseudo(i + 1) * W, y: pseudo(i + 1000) * H, r: 0.3 + pseudo(i + 2000) * 0.8, o: 0.1 + pseudo(i + 3000) * 0.4 }));
    svg.append('g').selectAll('circle').data(stars).join('circle')
      .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r).attr('fill', '#e7f5ff').attr('opacity', (d) => d.o);

    // ── 投影 ──
    const proj = d3.geoMercator().center([104, 36]).scale(560).translate([W / 2, H / 2 + 15]);
    const path = d3.geoPath(proj);

    // ── 省区 ──
    const pg = svg.append('g');
    pg.selectAll('path').data(this.provinceFeatures).join('path')
      .attr('d', path)
      .attr('fill', (_, i) => i % 2 === 0 ? '#1a4a68' : '#1e5278')
      .attr('stroke', '#4a80a0')
      .attr('stroke-width', 1.4)
      .append('title').text((d) => d.properties?.name || '');

    // 中国国界加粗轮廓（叠加在省区之上）
    pg.selectAll('path.outline').data(this.provinceFeatures).join('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#6aa8c8')
      .attr('stroke-width', 2.4)
      .attr('pointer-events', 'none');

    // 省名
    pg.selectAll('text').data(this.provinceFeatures).join('text')
      .attr('x', (d) => { const c = path.centroid(d); return c[0]; })
      .attr('y', (d) => { const c = path.centroid(d); return c[1] + 4; })
      .attr('text-anchor', 'middle').attr('fill', '#8aa8b8')
      .attr('font-size', (d) => (d.properties?.name || '').length > 4 ? 10 : 11)
      .attr('pointer-events', 'none')
      .text((d) => d.properties?.name || '');

    // ── 南海诸岛 ──
    this.renderSouthChinaSea(svg, proj, path);

    // ── 事件标点 ──
    this.renderMarkers(svg, proj);

    // ── 标题栏 ──
    const hdr = svg.append('g');
    hdr.append('text').attr('x', 30).attr('y', 40).attr('fill', '#eef6fb').attr('font-size', 20).attr('font-weight', 650).text('中国');
    const back = hdr.append('g').attr('transform', `translate(${W - 100}, 18)`).style('cursor', 'pointer').on('click', () => this.onBack?.());
    back.append('rect').attr('width', 76).attr('height', 32).attr('rx', 8).attr('fill', '#0d1e30').attr('stroke', '#2a5068').attr('stroke-width', 1);
    back.append('text').attr('x', 38).attr('y', 21).attr('text-anchor', 'middle').attr('fill', '#c0d0d8').attr('font-size', 13).text('← 返回');

    // ── 事件卡片 ──
    this.renderEventCard(svg);
  }

  // ═══ 事件标点 ═══
  renderMarkers(svg, proj) {
    const chinaEvents = this.events.filter((e) => e.lon >= 73 && e.lon <= 135 && e.lat >= 17 && e.lat <= 54);
    const mg = svg.append('g');
    const nodes = mg.selectAll('g').data(chinaEvents, (d) => d.id).join('g')
      .attr('transform', (d) => { const [x, y] = proj([d.lon, d.lat]); return `translate(${x},${y})`; })
      .style('cursor', 'pointer')
      .on('click', (ev, d) => { ev.stopPropagation(); this.selectEvent(d); });

    nodes.append('circle').attr('r', 8).attr('fill', (d) => CATEGORY_COLORS[d.category] || '#b9d2df').attr('opacity', 0.22);
    nodes.append('circle').attr('r', 5.5).attr('fill', (d) => CATEGORY_COLORS[d.category] || '#b9d2df').attr('stroke', '#06101c').attr('stroke-width', 2);
    nodes.append('text').attr('dx', 9).attr('dy', 4).attr('fill', '#eef6fb').attr('font-size', 11)
      .attr('paint-order', 'stroke').attr('stroke', '#06101c').attr('stroke-width', 4).attr('stroke-linejoin', 'round')
      .text((d) => d.city);
  }

  selectEvent(d) {
    this.selectedEventId = d.id;
    const card = this.container.select('#cmCard');
    card.classed('hidden', false);
    card.select('#cmCat').text(d.category);
    card.select('#cmTitle').text(d.title);
    card.select('#cmMeta').text(`${d.date} · ${d.city} · ${d.venue}`);
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