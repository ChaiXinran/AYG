import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { loadChinaProvinces } from './chinaMapData.js';
import { activePerson, personUrl } from './data/personRegistry.js?v=36';
import { defaultTourForPerson, toursForPerson } from './config/tours.js';

const W = 1100;
const H = 720;
const person = activePerson();
const tourThemes = {
  'monte-cristo': {
    title: '《基督山伯爵》', heading: '《基督山伯爵》巡演航路', mode: '航海图模式',
    titles: ['音乐剧《基督山伯爵》中文版'], icon: './assets/tour-icons/monte-cristo-ship.png',
    iconBox: { x: -21, y: -32, width: 42, height: 63 }, paper: ['#34230f', '#806437', '#29190a'],
  },
  'the-message': {
    title: '《风声》', heading: '《风声》巡演密线', mode: '谍报地图模式',
    titles: ['音乐剧《风声》', '音乐剧《风声》2.0'], icon: './assets/tour-icons/the-message-paper-crane.png',
    iconBox: { x: -30, y: -25, width: 60, height: 50 }, paper: ['#180304', '#6f090d', '#260305'],
  },
  'phantom-of-opera': {
    title: '《剧院魅影》', heading: '《剧院魅影》巡演夜航', mode: '暗夜歌剧院模式',
    titles: ['音乐剧《剧院魅影》中文版'], icon: './assets/tour-icons/phantom-of-opera-classic-mask-rose.png',
    iconBox: { x: -25, y: -25, width: 50, height: 50 }, paper: ['#061426', '#18527b', '#05111f'],
  },
  'on-the-road': {
    title: '《在远方》', heading: '《在远方》巡演路线', mode: '远方速递模式',
    titles: ['音乐剧《在远方》'], icon: './assets/tour-icons/on-the-road-parcel.png',
    iconBox: { x: -25, y: -25, width: 50, height: 50 }, paper: ['#0b2b42', '#2c7da8', '#103a58'],
  },
  'bring-in-the-wine': {
    title: '《将进酒》', heading: '《将进酒》巡演行迹', mode: '水墨江湖模式',
    titles: ['将进酒'], icon: './assets/tour-icons/bring-in-the-wine-ewer.png',
    iconBox: { x: -19, y: -27, width: 38, height: 54 }, paper: ['#f5f1e6', '#e8dcc1', '#f3ead8'],
  },
  'the-magic-hour': {
    title: '《魔幻时刻》', heading: '《魔幻时刻》巡演幕间', mode: '黄金剧场模式',
    titles: ['魔幻时刻'], categories: ['话剧'], categoryPage: 'drama', categoryLabel: '话剧',
    icon: './assets/tour-icons/the-magic-hour-hat.png', iconBox: { x: -29, y: -25, width: 58, height: 50 },
    paper: ['#4a170f', '#b54219', '#f0a33d'],
  },
};
const availableTours = toursForPerson(person.id);
const requestedWork = new URLSearchParams(window.location.search).get('work');
const activeTour = availableTours.find((tour) => tour.id === requestedWork) || defaultTourForPerson(person.id);
const activeWork = activeTour?.id || 'monte-cristo';
const theme = tourThemes[activeWork] || tourThemes['monte-cristo'];
document.body.dataset.tourTheme = activeWork;
if (requestedWork !== activeWork) {
  const canonicalUrl = new URL(window.location.href);
  canonicalUrl.searchParams.set('work', activeWork);
  window.history.replaceState(null, '', canonicalUrl);
}
const stops = person.events
  .filter((event) => theme.titles.includes(event.title) && (theme.categories || ['音乐剧']).includes(event.category))
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

document.title = `${theme.title}巡演地图 · ${person.name}`;

const app = document.querySelector('#tourApp');
app.innerHTML = `
  <aside id="tourSwitcher" class="tour-switcher">
    <div class="tour-switcher-panel">
      <div class="tour-switcher-heading"><span>TOUR MAPS</span><strong>${person.name}的巡演地图</strong></div>
      <nav aria-label="巡演地图列表">
        ${availableTours.map((tour) => `<a class="tour-switcher-link${tour.id === activeWork ? ' is-active' : ''}" href="${personUrl(person.id, `./tour.html?work=${tour.id}`)}"><span>${tour.icon}</span><b>${tour.label}</b></a>`).join('')}
      </nav>
    </div>
  </aside>
  <header class="tour-header">
    <a class="tour-back" href="${personUrl(person.id, `./category.html?type=${theme.categoryPage || 'musical'}`)}">⬅︎ 返回${theme.categoryLabel || '音乐剧'}</a>
    <div><span>THE LIVING TOUR MAP</span><h1>${theme.heading}</h1><p>${person.name} · ${stops.length} 个巡演站点</p></div>
    <span class="tour-mode">${theme.mode}</span>
  </header>
  <section class="tour-stage" aria-label="${theme.title}巡演路线动画">
    <div class="tour-map-shadow"></div>
    <svg id="tourMap" viewBox="0 0 ${W} ${H}" role="img" aria-label="巡演城市与航行路线"></svg>
    <article id="tourStopCard" class="tour-stop-card" aria-live="polite">
      <span id="tourStopIndex"></span><h2 id="tourStopCity"></h2><p id="tourStopDate"></p><strong id="tourStopVenue"></strong>
    </article>
    <div class="tour-compass" aria-hidden="true"><b>N</b><span>✦</span></div>
  </section>
  <footer class="tour-controller">
    <button id="tourPlay" type="button" aria-label="播放巡演路线">▶</button>
    <div class="tour-progress-wrap"><div class="tour-progress-label"><strong id="tourCurrentLabel">准备启航</strong><span id="tourProgressText">0%</span></div><input id="tourProgress" type="range" min="0" max="1000" value="0" aria-label="巡演路线进度" /><div id="tourYears" class="tour-years"></div></div>
    <button id="tourSpeed" type="button" aria-label="切换播放速度">1×</button>
  </footer>`;

if (stops.length < 2) {
  document.querySelector('.tour-stage').innerHTML = `<div class="tour-empty">当前人物没有足够的${theme.title}巡演站点来生成路线。</div>`;
  document.querySelector('.tour-controller').hidden = true;
} else {
  initTour();
}

async function initTour() {
  const geo = await loadChinaProvinces();
  const svg = d3.select('#tourMap');
  const svgElement = svg.node();
  const stageElement = document.querySelector('.tour-stage');
  const compactView = window.matchMedia('(max-width: 700px)').matches;
  const defaultView = { pitch: compactView ? 18 : 24, bearing: -2, scale: compactView ? 1.15 : 0.94, x: 0, y: 0 };
  const view = { ...defaultView };
  let dragState = null;

  function renderView() {
    svgElement.style.setProperty('--tour-pitch', `${view.pitch}deg`);
    svgElement.style.setProperty('--tour-bearing', `${view.bearing}deg`);
    svgElement.style.setProperty('--tour-scale', view.scale);
    svgElement.style.setProperty('--tour-pan-x', `${view.x}px`);
    svgElement.style.setProperty('--tour-pan-y', `${view.y}px`);
  }

  function zoomAndCenter(element, targetScale) {
    view.scale = Math.max(view.scale, targetScale);
    let centered = false;
    const centerElement = () => {
      if (centered) return;
      centered = true;
      const elementRect = element.getBoundingClientRect();
      const stageRect = stageElement.getBoundingClientRect();
      const elementX = elementRect.left + elementRect.width / 2;
      const elementY = elementRect.top + elementRect.height / 2;
      const targetX = stageRect.left + stageRect.width / 2;
      const targetY = stageRect.top + stageRect.height * .48;
      view.x += targetX - elementX;
      view.y += targetY - elementY;
      renderView();
    };
    svgElement.addEventListener('transitionend', centerElement, { once: true });
    renderView();
    window.setTimeout(centerElement, 260);
  }

  svgElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.button !== 1) return;
    dragState = { x: event.clientX, y: event.clientY, view: { ...view }, pan: event.shiftKey || event.button === 1 };
    svgElement.setPointerCapture(event.pointerId);
    stageElement.classList.add('is-dragging');
  });
  svgElement.addEventListener('pointermove', (event) => {
    if (!dragState) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    if (dragState.pan || event.shiftKey) {
      view.x = dragState.view.x + dx;
      view.y = dragState.view.y + dy;
    } else {
      view.bearing = dragState.view.bearing + dx * 0.16;
      view.pitch = Math.max(5, Math.min(58, dragState.view.pitch - dy * 0.14));
    }
    renderView();
  });
  const endDrag = (event) => {
    if (!dragState) return;
    dragState = null;
    stageElement.classList.remove('is-dragging');
    if (svgElement.hasPointerCapture(event.pointerId)) svgElement.releasePointerCapture(event.pointerId);
  };
  svgElement.addEventListener('pointerup', endDrag);
  svgElement.addEventListener('pointercancel', endDrag);
  svgElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    view.scale = Math.max(0.68, Math.min(2.2, view.scale * Math.exp(-event.deltaY * 0.001)));
    renderView();
  }, { passive: false });
  function resetView() { Object.assign(view, defaultView); renderView(); }
  svgElement.addEventListener('dblclick', resetView);
  renderView();
  const projection = d3.geoMercator().center([104, 35]).scale(690).translate([W / 2, H / 2 + 20]);
  const path = d3.geoPath(projection);
  const defs = svg.append('defs');
  const paper = defs.append('linearGradient').attr('id', 'tourPaper').attr('x2', '1').attr('y2', '1');
  paper.append('stop').attr('stop-color', theme.paper[0]);
  paper.append('stop').attr('offset', '.52').attr('stop-color', theme.paper[1]);
  paper.append('stop').attr('offset', '1').attr('stop-color', theme.paper[2]);
  const glow = defs.append('filter').attr('id', 'tourGlow').attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
  glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur');
  const merge = glow.append('feMerge'); merge.append('feMergeNode').attr('in', 'blur'); merge.append('feMergeNode').attr('in', 'SourceGraphic');
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#tourPaper)');

  const plane = svg.append('g').attr('class', 'tour-map-plane');
  const provincePaths = plane.selectAll('path.tour-province').data(geo.features || []).join('path')
    .attr('class', 'tour-province').attr('d', path)
    .on('pointerdown', (event) => event.stopPropagation())
    .on('click', (event, feature) => focusProvince(event.currentTarget, feature));
  provincePaths.append('title').text((feature) => `点击放大${feature.properties?.name || '该省区'}`);

  const points = stops.map((stop) => ({ ...stop, point: projection([stop.lon, stop.lat]) }));
  const segments = d3.pairs(points).map(([from, to], index) => {
    const [x1, y1] = from.point;
    const [x2, y2] = to.point;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const bend = Math.min(34, Math.hypot(dx, dy) * .12) * (index % 2 ? -1 : 1);
    const length = Math.max(1, Math.hypot(dx, dy));
    const control = [(x1 + x2) / 2 - dy / length * bend, (y1 + y2) / 2 + dx / length * bend];
    return { from, to, d: `M${x1},${y1} Q${control[0]},${control[1]} ${x2},${y2}` };
  });
  const routeLayer = plane.append('g').attr('class', 'tour-route-layer');
  routeLayer.selectAll('path.tour-route-ghost').data(segments).join('path').attr('class', 'tour-route-ghost').attr('d', (d) => d.d);
  routeLayer.selectAll('path.tour-route-flow').data(segments).join('path').attr('class', 'tour-route-flow').attr('d', (d) => d.d);
  const travelled = routeLayer.selectAll('path.tour-route-travelled').data(segments).join('path').attr('class', 'tour-route-travelled').attr('d', (d) => d.d);
  const segmentNodes = travelled.nodes();
  const segmentLengths = segmentNodes.map((node) => node.getTotalLength());
  travelled.each(function (_, index) {
    d3.select(this).attr('stroke-dasharray', segmentLengths[index]).attr('stroke-dashoffset', segmentLengths[index]);
  });

  const cityGroups = plane.append('g').selectAll('g').data(points).join('g')
    .attr('class', 'tour-city').attr('transform', (d) => `translate(${d.point[0]},${d.point[1]})`);
  cityGroups.append('circle').attr('class', 'tour-city-ring').attr('r', 12);
  cityGroups.append('circle').attr('class', 'tour-city-core').attr('r', 4);
  cityGroups.append('text').attr('class', 'tour-city-label').attr('x', 10).attr('y', -10).text((d) => d.city);
  cityGroups
    .on('pointerdown', (event) => event.stopPropagation())
    .on('click', (event, d) => focusStop(event.currentTarget, points.indexOf(d)));

  const ship = plane.append('g').attr('class', 'tour-ship');
  ship.append('ellipse').attr('class', 'tour-ship-shadow').attr('rx', 14).attr('ry', 5).attr('cy', 10);
  ship.append('image')
    .attr('class', 'tour-ship-image')
    .attr('href', theme.icon)
    .attr('x', theme.iconBox.x).attr('y', theme.iconBox.y).attr('width', theme.iconBox.width).attr('height', theme.iconBox.height)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const progressInput = document.querySelector('#tourProgress');
  const playButton = document.querySelector('#tourPlay');
  const speedButton = document.querySelector('#tourSpeed');
  const speeds = [0.5, 1, 2];
  let speedIndex = 1;
  let progress = 0;
  let playing = false;
  let lastFrame = 0;
  let activeStop = -1;
  let pauseUntil = 0;
  let iconFacing = 1;

  const years = [...new Set(points.map((item) => String(item.date).slice(0, 4)))];
  document.querySelector('#tourYears').innerHTML = years.map((year) => `<span>${year}</span>`).join('');

  function showStop(index) {
    if (index === activeStop) return;
    activeStop = index;
    const stop = points[index];
    cityGroups.classed('is-current', (_, itemIndex) => itemIndex === index).classed('is-visited', (_, itemIndex) => itemIndex <= index);
    document.querySelector('#tourStopIndex').textContent = `STOP ${String(index + 1).padStart(2, '0')} / ${points.length}`;
    document.querySelector('#tourStopCity').textContent = stop.city;
    document.querySelector('#tourStopDate').textContent = stop.dateLabel || stop.date;
    document.querySelector('#tourStopVenue').textContent = stop.venue;
    document.querySelector('#tourCurrentLabel').textContent = `${stop.city} · ${stop.tourBatch}`;
    document.querySelector('#tourStopCard').classList.remove('is-arriving');
    requestAnimationFrame(() => document.querySelector('#tourStopCard').classList.add('is-arriving'));
    if (playing) pauseUntil = performance.now() + 850;
  }

  function focusStop(markerElement, index) {
    playing = false;
    playButton.textContent = '▶';
    playButton.classList.remove('is-playing');
    setProgress(index / (points.length - 1), true);
    zoomAndCenter(markerElement, compactView ? 1.5 : 1.45);
  }

  function focusProvince(provinceElement) {
    playing = false;
    playButton.textContent = '▶';
    playButton.classList.remove('is-playing');
    provincePaths.classed('is-focused', function () { return this === provinceElement; });
    zoomAndCenter(provinceElement, compactView ? 1.9 : 1.75);
  }

  function setProgress(value, syncInput = false) {
    progress = Math.max(0, Math.min(1, value));
    const segmentPosition = progress * segments.length;
    const segmentIndex = Math.min(segments.length - 1, Math.floor(segmentPosition));
    const rawLocalProgress = progress >= 1 ? 1 : segmentPosition - segmentIndex;
    const localProgress = rawLocalProgress >= .995 ? 1 : rawLocalProgress;
    const segmentNode = segmentNodes[segmentIndex];
    const segmentLength = segmentLengths[segmentIndex];
    const distance = segmentLength * localProgress;
    const here = segmentNode.getPointAtLength(distance);
    const directionStart = segmentNode.getPointAtLength(Math.max(0, distance - 1));
    const directionEnd = segmentNode.getPointAtLength(Math.min(segmentLength, distance + 1));
    const horizontalMovement = directionEnd.x - directionStart.x;
    if (Math.abs(horizontalMovement) > .35) iconFacing = horizontalMovement < 0 ? -1 : 1;
    ship.attr('transform', `translate(${here.x},${here.y}) scale(${iconFacing},1)`);
    travelled.attr('stroke-dashoffset', (_, index) => {
      if (index < segmentIndex) return 0;
      if (index > segmentIndex) return segmentLengths[index];
      return segmentLength * (1 - localProgress);
    });
    const stopIndex = localProgress === 1 ? segmentIndex + 1 : segmentIndex;
    showStop(stopIndex);
    document.querySelector('#tourProgressText').textContent = `${Math.round(progress * 100)}%`;
    if (syncInput) progressInput.value = Math.round(progress * 1000);
  }

  function frame(time) {
    if (!playing) return;
    if (time < pauseUntil) { lastFrame = time; requestAnimationFrame(frame); return; }
    if (!lastFrame) lastFrame = time;
    progress += ((time - lastFrame) / 32000) * speeds[speedIndex];
    lastFrame = time;
    if (progress >= 1) { progress = 1; playing = false; playButton.textContent = '↺'; playButton.classList.remove('is-playing'); }
    setProgress(progress, true);
    if (playing) requestAnimationFrame(frame);
  }

  playButton.addEventListener('click', () => {
    if (progress >= 1) progress = 0;
    playing = !playing;
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.classList.toggle('is-playing', playing);
    lastFrame = 0;
    if (playing) requestAnimationFrame(frame);
  });
  progressInput.addEventListener('input', (event) => { playing = false; playButton.textContent = '▶'; playButton.classList.remove('is-playing'); setProgress(Number(event.target.value) / 1000); });
  speedButton.addEventListener('click', () => { speedIndex = (speedIndex + 1) % speeds.length; speedButton.textContent = `${speeds[speedIndex]}×`; });
  setProgress(0, true);
}
