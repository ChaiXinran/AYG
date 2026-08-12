import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { feature } from 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
import world from 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json/+esm';

const CATEGORY_COLORS = {
  音乐剧: '#ff5d8f',
  综艺: '#42c9e8',
  晚会: '#f5bd4f',
  音乐会: '#9c7cff',
  其他: '#63d6a5'
};

const MIN_GLOBE_SCALE = 160;
const MAX_GLOBE_SCALE = 1100;

export class EventGlobe {
  constructor({ svgElement, events, cityLights, provinceFeatures, backgroundImage, onEventSelect, onClusterSelect, onChinaClick }) {
    this.svg = d3.select(svgElement);
    this.events = events;
    this.cityLights = cityLights;
    this.provinceFeatures = provinceFeatures || [];
    this.backgroundImage = backgroundImage;
    this._hasProvinces = this.provinceFeatures.length > 0;
    this.filteredEvents = [...events];
    this.eventMarks = new Map();
    this.onEventSelect = onEventSelect;
    this.onClusterSelect = onClusterSelect;
    this.onChinaClick = onChinaClick;

    this.width = 900;
    this.height = 700;
    this.baseScale = 290;
    this.initialRotation = [-112, -28, 0];

    this.projection = d3
      .geoOrthographic()
      .translate([this.width / 2, this.height / 2])
      .scale(this.baseScale)
      .clipAngle(90)
      .precision(0.4)
      .rotate(this.initialRotation);

    this.path = d3.geoPath(this.projection);
    this.countries = feature(world, world.objects.countries);
    this.graticule = d3.geoGraticule10();

    this.autoRotate = true;
    this.dragging = false;
    this.showNight = true;
    this.showLights = true;
    this.selectedEventId = null;
    this._expandedClusterId = null;
    this.lastFrame = performance.now();
    this.pulsePhase = 0;

    this.build();
    this.bindInteractions();
    this.render();
    this.startAnimation();
  }

  build() {
    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);

    const defs = this.svg.append('defs');

    const spaceGradient = defs
      .append('radialGradient')
      .attr('id', 'spaceGradient')
      .attr('cx', '45%')
      .attr('cy', '40%');

    spaceGradient.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(13,32,55,0.55)');
    spaceGradient.append('stop').attr('offset', '55%').attr('stop-color', 'rgba(7,20,35,0.72)');
    spaceGradient.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(2,7,17,0.95)');

    const oceanGradient = defs
      .append('radialGradient')
      .attr('id', 'oceanGradient')
      .attr('cx', '34%')
      .attr('cy', '28%');

    oceanGradient.append('stop').attr('offset', '0%').attr('stop-color', '#174f75');
    oceanGradient.append('stop').attr('offset', '45%').attr('stop-color', '#0b3556');
    oceanGradient.append('stop').attr('offset', '80%').attr('stop-color', '#08263f');
    oceanGradient.append('stop').attr('offset', '100%').attr('stop-color', '#05192c');

    const atmosphereGradient = defs
      .append('radialGradient')
      .attr('id', 'atmosphereGradient');

    atmosphereGradient.append('stop').attr('offset', '72%').attr('stop-color', 'rgba(0,0,0,0)');
    atmosphereGradient.append('stop').attr('offset', '84%').attr('stop-color', 'rgba(81,187,255,0.10)');
    atmosphereGradient.append('stop').attr('offset', '92%').attr('stop-color', 'rgba(79,184,255,0.30)');
    atmosphereGradient.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(33,117,181,0)');

    const cityGlow = defs
      .append('filter')
      .attr('id', 'cityGlow')
      .attr('x', '-300%')
      .attr('y', '-300%')
      .attr('width', '700%')
      .attr('height', '700%');

    cityGlow.append('feGaussianBlur').attr('stdDeviation', 2.4).attr('result', 'blur');
    const cityMerge = cityGlow.append('feMerge');
    cityMerge.append('feMergeNode').attr('in', 'blur');
    cityMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const markerGlow = defs
      .append('filter')
      .attr('id', 'markerGlow')
      .attr('x', '-250%')
      .attr('y', '-250%')
      .attr('width', '600%')
      .attr('height', '600%');

    markerGlow.append('feGaussianBlur').attr('stdDeviation', 3.4).attr('result', 'blur');
    const markerMerge = markerGlow.append('feMerge');
    markerMerge.append('feMergeNode').attr('in', 'blur');
    markerMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    this.svg
      .append('rect')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('fill', 'url(#spaceGradient)');

    // 背景图（降低透明度，铺满 SVG）
    this.svg
      .append('image')
      .attr('href', this.backgroundImage)
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .attr('opacity', 0.35);

    this.buildStars();

    this.svg
      .append('circle')
      .attr('class', 'atmosphere')
      .attr('cx', this.width / 2)
      .attr('cy', this.height / 2)
      .attr('r', this.baseScale + 34)
      .attr('fill', 'url(#atmosphereGradient)')
      .attr('pointer-events', 'none');

    this.sphereLayer = this.svg.append('g').attr('class', 'sphere-layer');
    this.landLayer = this.svg.append('g').attr('class', 'land-layer');
    this.chinaHighlightLayer = this.svg.append('g').attr('class', 'china-highlight-layer');
    this.nightLayer = this.svg.append('g').attr('class', 'night-layer');
    this.cityLayer = this.svg.append('g').attr('class', 'city-light-layer');
    this.provinceLayer = this.svg.append('g').attr('class', 'province-layer');
    this.pulseLayer = this.svg.append('g').attr('class', 'pulse-layer');
    this.markerLayer = this.svg.append('g').attr('class', 'marker-layer');

    this.sphereLayer
      .append('path')
      .datum({ type: 'Sphere' })
      .attr('class', 'ocean');

    this.landLayer
      .append('path')
      .datum(this.graticule)
      .attr('class', 'graticule');

    this.landLayer
      .selectAll('path.country')
      .data(this.countries.features)
      .join('path')
      .attr('class', 'country')
      .attr('fill', (country) => this.landColor(country));

    // 中国高亮层：hover 整块变亮，点击切换平面地图
    if (this.onChinaClick) {
      const chinaFeature = this.countries.features.find((f) => String(f.id) === '156');
      if (chinaFeature) {
        this.chinaHighlight = this.chinaHighlightLayer
          .append('path')
          .datum(chinaFeature)
          .attr('class', 'china-hover-area')
          .style('cursor', 'pointer')
          .on('click', (event) => {
            event.stopPropagation();
            this.onChinaClick();
          });
      }
    }

    this.nightPath = this.nightLayer
      .append('path')
      .attr('class', 'night-shade');

    this.terminatorPath = this.nightLayer
      .append('path')
      .attr('class', 'terminator-line');
  }

  buildStars() {
    const pseudoRandom = (seed) => {
      const x = Math.sin(seed * 999.91) * 43758.5453123;
      return x - Math.floor(x);
    };

    const stars = d3.range(180).map((i) => ({
      x: pseudoRandom(i + 1) * this.width,
      y: pseudoRandom(i + 1000) * this.height,
      radius: 0.35 + pseudoRandom(i + 2000) * 1.25,
      opacity: 0.16 + pseudoRandom(i + 3000) * 0.62
    }));

    this.svg
      .append('g')
      .attr('class', 'star-layer')
      .selectAll('circle')
      .data(stars)
      .join('circle')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('r', (d) => d.radius)
      .attr('fill', '#e7f5ff')
      .attr('opacity', (d) => d.opacity);
  }

  landColor(country) {
    const [, lat] = d3.geoCentroid(country);
    const absLat = Math.abs(lat);

    if (absLat > 68) return '#dce9e3';
    if (absLat > 57) return '#9cae88';
    if (absLat < 18) return '#3f7a45';
    if (absLat < 34) return '#688749';
    if (absLat < 48) return '#9c8952';
    return '#78835f';
  }

  bindInteractions() {
    const drag = d3
      .drag()
      .filter((event) => {
        // 点击活动节点时不触发拖拽，让 click 事件正常传递
        return !event.target.closest('.map-node');
      })
      .on('start', () => {
        this.dragging = true;
      })
      .on('drag', (event) => {
        const rotation = this.projection.rotate();
        const nextLat = Math.max(-78, Math.min(78, rotation[1] - event.dy * 0.26));

        this.projection.rotate([
          rotation[0] + event.dx * 0.26,
          nextLat,
          0
        ]);

        this.render();
      })
      .on('end', () => {
        this.dragging = false;
      });

    this.svg.call(drag);

    this.svg.on(
      'wheel',
      (event) => {
        event.preventDefault();

        const factor = event.deltaY > 0 ? 0.9 : 1.1;
        const nextScale = Math.max(
          MIN_GLOBE_SCALE,
          Math.min(MAX_GLOBE_SCALE, this.projection.scale() * factor)
        );
        this.projection.scale(nextScale);

        this.render();
      },
      { passive: false }
    );

    this.svg.on('click.focus', (event) => {
      if (event.target.closest?.('.map-node')) return;
      const [x, y] = d3.pointer(event, this.svg.node());
      const [centerX, centerY] = this.projection.translate();
      if (Math.hypot(x - centerX, y - centerY) > this.projection.scale()) return;
      const coordinate = this.projection.invert([x, y]);
      if (!coordinate || coordinate.some((value) => !Number.isFinite(value))) return;
      this.zoomToCoordinate(coordinate[0], coordinate[1]);
    });
  }

  render() {
    this.sphereLayer.selectAll('path').attr('d', this.path);
    this.landLayer.selectAll('path').attr('d', this.path);
    if (this.chinaHighlight) this.chinaHighlight.attr('d', this.path);

    this.renderNight();
    this.renderCityLights();
    this.renderMarkers();
    this.renderProvinces();
  }

  renderNight() {
    const night = this.nightHemisphere();

    this.nightPath
      .datum(night)
      .attr('d', this.path)
      .attr('display', this.showNight ? null : 'none');

    this.terminatorPath
      .datum({ type: 'LineString', coordinates: night.coordinates[0] })
      .attr('d', this.path)
      .attr('display', this.showNight ? null : 'none');
  }

  renderCityLights() {
    const visible = this.showLights
      ? this.cityLights.filter(
          (city) => this.isFront(city.lon, city.lat) && this.isNight(city.lon, city.lat)
        )
      : [];

    const lights = this.cityLayer
      .selectAll('g.city-light')
      .data(visible, (d) => d.id);

    lights.exit().remove();

    const enter = lights
      .enter()
      .append('g')
      .attr('class', 'city-light');

    enter.append('circle').attr('class', 'city-halo');
    enter.append('circle').attr('class', 'city-core');

    const merged = enter
      .merge(lights)
      .attr('transform', (d) => {
        const [x, y] = this.projection([d.lon, d.lat]);
        return `translate(${x}, ${y})`;
      });

    merged
      .select('.city-halo')
      .attr('r', (d) => 2.8 + d.intensity * 4.6);

    merged
      .select('.city-core')
      .attr('r', (d) => 0.7 + d.intensity * 0.9);
  }

  renderMarkers() {
    const visibleEvents = this.filteredEvents.filter((event) => this.isFront(event.lon, event.lat));
    this.markerLayer.classed('labels-visible', this.projection.scale() >= 520);
    const chinaGroups = new Map();
    const overseas = [];
    visibleEvents.forEach((event) => {
      if (!this.isChinaEvent(event)) {
        overseas.push({ id: String(event.id), lon: event.lon, lat: event.lat, events: [event], label: this.locationLabel(event) });
        return;
      }
      const city = this.normalizeCity(event.city);
      const key = city ? `china-city:${city}` : `china-event:${event.id}`;
      if (!chinaGroups.has(key)) chinaGroups.set(key, { id: key, events: [], label: city });
      chinaGroups.get(key).events.push(event);
    });

    const groupedChina = [...chinaGroups.values()].map((group) => ({
      ...group,
      lon: d3.mean(group.events, (event) => event.lon),
      lat: d3.mean(group.events, (event) => event.lat)
    }));
    const clusters = [...groupedChina, ...overseas].map((cluster) => {
      const point = this.projection([cluster.lon, cluster.lat]);
      return point ? { ...cluster, x: point[0], y: point[1] } : null;
    }).filter(Boolean);

    const groups = this.markerLayer
      .selectAll('g.map-node')
      .data(clusters, (d) => d.id);

    groups.exit().remove();

    const enter = groups
      .enter()
      .append('g')
      .attr('class', 'map-node');

    enter.append('circle').attr('class', 'node-body');
    enter.append('circle').attr('class', 'node-orbit');
    enter.append('circle').attr('class', 'node-core');
    enter.append('text').attr('class', 'node-count');
    enter.append('text').attr('class', 'node-label');

    const merged = enter
      .merge(groups)
      .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
      .classed('is-cluster', (d) => d.events.length > 1)
      .classed('is-china-light', (d) => this.isChinaEvent(d.events[0]))
      .classed('is-selected', (d) => d.events.length === 1 && d.events[0].id === this.selectedEventId)
      .classed('has-liked', (d) => d.events.some((item) => this.markState(item).liked))
      .style('cursor', 'pointer')
      .on('mouseenter', () => {
        // 悬停时暂停自动旋转，方便点击
        this._hoverPause = true;
      })
      .on('mouseleave', () => {
        this._hoverPause = false;
      })
      .on('mousedown', (event) => {
        // 阻止 mousedown 冒泡到 SVG，避免被 D3 drag 截获
        event.stopPropagation();
      })
      .on('click', (event, cluster) => {
        event.stopPropagation();

        if (cluster.events.length > 1) {
          this.zoomIntoCluster(cluster);
          this.onClusterSelect?.(cluster);
          return;
        }

        const selected = cluster.events[0];
        this.selectedEventId = selected.id;
        this._expandedClusterId = null;
        this.zoomToEvent(selected);
        this.renderMarkers();
        this.onEventSelect?.(selected);
      });

    merged
      .select('.node-body')
      .attr('r', (d) => this.isChinaEvent(d.events[0]) ? Math.min(14, 2.5 + Math.sqrt(d.events.length) * 1.35) : 6.2)
      .attr('fill', (d) =>
        this.isChinaEvent(d.events[0])
          ? '#ffffff'
          : d.events.length > 1
          ? 'rgba(5, 20, 34, 0.92)'
          : this.categoryColor(d.events[0].category)
      )
      .attr('stroke', (d) => this.isChinaEvent(d.events[0]) ? this.categoryColor(d.events[0].category) : (d.events.length > 1 ? this.categoryColor(d.events[0].category) : '#06101c'))
      .attr('stroke-width', (d) => this.isChinaEvent(d.events[0]) ? 0.8 : (d.events.length > 1 ? 1.2 : 2))
      .attr('filter', 'url(#markerGlow)');

    merged
      .select('.node-orbit')
      .attr('r', (d) => this.isChinaEvent(d.events[0]) ? Math.min(18, 5.5 + Math.sqrt(d.events.length) * 1.45) : 10.5)
      .attr('fill', 'none')
      .attr('stroke', (d) => this.categoryColor(d.events[0].category))
      .attr('stroke-width', (d) => this.isChinaEvent(d.events[0]) ? 0.55 : (d.events.length > 1 ? 1.1 : 0.85))
      .attr('stroke-dasharray', (d) => d.events.length > 1 ? '2.5 4.5' : 'none');

    merged
      .select('.node-core')
      .attr('r', (d) => this.isChinaEvent(d.events[0]) ? 0.9 : (d.events.length > 1 ? 0 : 1.8))
      .attr('fill', '#fff');

    merged
      .select('.node-count')
      .attr('display', (d) => (d.events.length > 1 ? null : 'none'))
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .text((d) => d.events.length);

    merged
      .select('.node-label')
      .attr('dx', (d) => (d.events.length > 1 ? 18 : 11))
      .attr('dy', 4)
      .text((d) => { const likes=d.events.reduce((sum,item)=>sum+Number(this.markState(item).like_count||0),0); const label=d.events.length>1&&d.label?`${d.label} · ${d.events.length} 场`:d.label; return likes?`${label||'活动'} · ♥ ${likes}`:label; });

    // 独立的脉冲圆圈图层，不影响 g.map-node 的边界框稳定性
    const pulseGroups = this.pulseLayer
      .selectAll('g.pulse-node')
      .data(clusters, (d) => d.id);

    pulseGroups.exit().remove();

    const pulseEnter = pulseGroups
      .enter()
      .append('g')
      .attr('class', 'pulse-node');

    pulseEnter.append('circle').attr('class', 'node-pulse');

    pulseEnter
      .merge(pulseGroups)
      .attr('transform', (d) => `translate(${d.x}, ${d.y})`);
  }

  zoomIntoCluster(cluster) {
    const startRotation = this.projection.rotate();
    const startScale = this.projection.scale();
    const targetRotation = [-cluster.lon, -cluster.lat, 0];
    const targetScale = Math.min(
      MAX_GLOBE_SCALE,
      Math.max(startScale * 1.7, 520)
    );

    const interpolateRotation = d3.interpolate(startRotation, targetRotation);
    const interpolateScale = d3.interpolateNumber(startScale, targetScale);

    d3.transition()
      .duration(650)
      .tween('cluster-zoom', () => (t) => {
        this.projection
          .rotate(interpolateRotation(t))
          .scale(interpolateScale(t));
        this.render();
      });
  }

  categoryColor(category) {
    return CATEGORY_COLORS[category] ?? '#b9d2df';
  }

  normalizeCity(value) {
    const city = String(value || '')
      .replace(/（[^）]*）/g, '')
      .replace(/\([^)]*\)/g, '')
      .trim();
    return city && !city.includes('未公开') ? city : '';
  }

  locationLabel(event) {
    const city = this.normalizeCity(event.city);
    if (city) return city;
    return this.isChinaEvent(event) ? '' : String(event.country || '').trim();
  }

  zoomToEvent(event) {
    this.zoomToCoordinate(event.lon, event.lat);
  }

  zoomToCoordinate(lon, lat) {
    const startRotation = this.projection.rotate();
    const startScale = this.projection.scale();
    const targetRotation = [-lon, -lat, 0];
    const targetScale = Math.min(
      MAX_GLOBE_SCALE,
      Math.max(startScale * 1.55, 620)
    );
    const interpolateRotation = d3.interpolate(startRotation, targetRotation);
    const interpolateScale = d3.interpolateNumber(startScale, targetScale);

    d3.transition()
      .duration(720)
      .ease(d3.easeCubicInOut)
      .tween('event-focus', () => (t) => {
        this.projection
          .rotate(interpolateRotation(t))
          .scale(interpolateScale(t));
        this.render();
      });
  }

  isChinaEvent(event) {
    return event.country === '中国'
      || (event.lon >= 73 && event.lon <= 135 && event.lat >= 17 && event.lat <= 54);
  }

  isFront(lon, lat) {
    const rotation = this.projection.rotate();
    const center = [-rotation[0], -rotation[1]];
    return d3.geoDistance([lon, lat], center) < Math.PI / 2;
  }

  solarPoint() {
    const now = new Date();
    const yearStart = Date.UTC(now.getUTCFullYear(), 0, 0);
    const dayOfYear = (now.getTime() - yearStart) / 86400000;

    const declination = 23.44 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const longitude = 180 - utcHours * 15;

    return [longitude, declination];
  }

  nightHemisphere() {
    const [sunLon, sunLat] = this.solarPoint();
    const antiSolar = [sunLon > 0 ? sunLon - 180 : sunLon + 180, -sunLat];

    return d3
      .geoCircle()
      .center(antiSolar)
      .radius(90)();
  }

  isNight(lon, lat) {
    return d3.geoDistance([lon, lat], this.solarPoint()) > Math.PI / 2;
  }

  setFilters({ startDate = '', endDate = '', location = '', categories = [], keyword = '' } = {}) {
    const normalizedLocation = location.toLocaleLowerCase();
    const normalizedKeyword = keyword.toLocaleLowerCase();
    this.filteredEvents = this.events.filter((event) => {
      const eventDates = Array.isArray(event.dates) && event.dates.length
        ? event.dates.map((item) => item.date).filter(Boolean)
        : event.date ? [event.date.split('~')[0].trim()] : [];
      const dateMatch = !eventDates.length || eventDates.some((date) => (!startDate || date >= startDate) && (!endDate || date <= endDate));
      const categoryMatch = !categories.length ? false : categories.includes(event.category);
      const locationText = [event.country, event.city, event.venue].filter(Boolean).join(' ').toLocaleLowerCase();
      const keywordText = [event.title, event.category, event.country, event.city, event.venue, event.role, event.description]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      return dateMatch && categoryMatch && (!normalizedLocation || locationText.includes(normalizedLocation)) && (!normalizedKeyword || keywordText.includes(normalizedKeyword));
    });

    this.selectedEventId = null;
    this._expandedClusterId = null;
    this.renderMarkers();
    return this.filteredEvents;
  }

  resetView() {
    this.projection.rotate([...this.initialRotation]).scale(this.baseScale);
    this.selectedEventId = null;
    this._expandedClusterId = null;
    this.render();
  }

  markState(event) { return this.eventMarks.get(String(event?.communityId || event?.id)) || {}; }
  setEventMarks(marks = new Map()) { this.eventMarks = marks; this.renderMarkers(); }

  setAutoRotate(value) {
    this.autoRotate = value;
  }

  setShowNight(value) {
    this.showNight = value;
    this.renderNight();
  }

  setShowLights(value) {
    this.showLights = value;
    this.renderCityLights();
  }

  clearExpanded() {
    if (this._expandedClusterId !== null) {
      this._expandedClusterId = null;
      this.renderMarkers();
    }
  }

  renderProvinces() {
    if (!this._hasProvinces || !this.provinceFeatures.length) return;

    // 缩放时显示省区
    const scale = this.projection.scale();
    const showProvinces = scale >= 290;

    const paths = this.provinceLayer
      .selectAll('path.province')
      .data(showProvinces ? this.provinceFeatures : [], (d) => d.properties?.adcode || d.properties?.name);

    paths.exit().remove();

    const enter = paths
      .enter()
      .append('path')
      .attr('class', 'province');

    enter
      .merge(paths)
      .attr('d', this.path)
      .append('title')
      .text((d) => d.properties?.name || '');
  }

  startAnimation() {
    d3.timer((now) => {
      const dt = Math.min(40, now - this.lastFrame);
      this.lastFrame = now;
      this.pulsePhase += dt * 0.004;

      this.pulseLayer
        .selectAll('.node-pulse')
        .attr('r', (d) => {
          const offset = [...String(d.id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.17;
          const pulse = 0.5 + 0.5 * Math.sin(this.pulsePhase + offset);
          return this.isChinaEvent(d.events[0])
            ? Math.min(18, 4 + Math.sqrt(d.events.length) * 1.45) + pulse * 4
            : 12 + pulse * 4;
        })
        .attr('opacity', (d) => {
          const offset = [...String(d.id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.17;
          const pulse = 0.5 + 0.5 * Math.sin(this.pulsePhase + offset);
          return this.isChinaEvent(d.events[0]) ? 0.08 + pulse * 0.48 : 0.08 + pulse * 0.26;
        })
        .attr('fill', (d) =>
          d.events.length > 1
            ? '#dff4ff'
            : this.categoryColor(d.events[0].category)
        );

      if (!this.autoRotate || this.dragging || this._hoverPause) return;

      const rotation = this.projection.rotate();
      this.projection.rotate([
        rotation[0] + dt * 0.0024,
        rotation[1],
        0
      ]);

      this.render();
    });
  }
}
