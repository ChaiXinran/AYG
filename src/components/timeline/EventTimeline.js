function monthIndex(date) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})/);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function monthValue(index, endOfMonth = false) {
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  if (!endOfMonth) return `${year}-${String(month).padStart(2, '0')}-01`;
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${day}`;
}

export class EventTimeline {
  constructor({ container, dates, onChange, playbackInterval = 1100 }) {
    this.container = container;
    this.onChange = onChange;
    this.playbackInterval = playbackInterval;
    this.timer = null;
    const indices = dates.map(monthIndex).filter(Number.isFinite);
    this.min = Math.min(...indices);
    this.max = Math.max(...indices);
    if (!Number.isFinite(this.min) || !Number.isFinite(this.max)) return;
    this.render();
  }

  render() {
    const minYear = Math.floor(this.min / 12);
    const maxYear = Math.floor(this.max / 12);
    const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
    this.element = document.createElement('div');
    this.element.className = 'event-timeline';
    this.element.innerHTML = `
      <button class="event-timeline-play" type="button" aria-label="播放时间轴">▶</button>
      <div class="event-timeline-main">
        <div class="event-timeline-top"><strong>时间轴</strong><span class="event-timeline-range"></span></div>
        <div class="event-timeline-slider">
          <div class="event-timeline-base"></div><div class="event-timeline-fill"></div>
          <input class="event-timeline-start" type="range" min="${this.min}" max="${this.max}" value="${this.min}" aria-label="时间轴开始月份" />
          <input class="event-timeline-end" type="range" min="${this.min}" max="${this.max}" value="${this.max}" aria-label="时间轴结束月份" />
        </div>
        <div class="event-timeline-years">${years.map((year) => `<span>${year}</span>`).join('')}</div>
      </div>`;
    this.container.append(this.element);
    this.startInput = this.element.querySelector('.event-timeline-start');
    this.endInput = this.element.querySelector('.event-timeline-end');
    this.fill = this.element.querySelector('.event-timeline-fill');
    this.rangeLabel = this.element.querySelector('.event-timeline-range');
    this.playButton = this.element.querySelector('.event-timeline-play');
    this.element.addEventListener('click', (event) => event.stopPropagation());
    this.element.addEventListener('mousedown', (event) => event.stopPropagation());
    this.element.addEventListener('wheel', (event) => event.stopPropagation());
    this.startInput.addEventListener('input', () => this.update(true, 'start'));
    this.endInput.addEventListener('input', () => this.update(true, 'end'));
    this.playButton.addEventListener('click', () => this.togglePlayback());
    this.update(false);
  }

  update(notify = true, active = '') {
    let start = Number(this.startInput.value);
    let end = Number(this.endInput.value);
    if (start > end) {
      if (active === 'start') start = end;
      else end = start;
      this.startInput.value = start;
      this.endInput.value = end;
    }
    const denominator = Math.max(1, this.max - this.min);
    const left = ((start - this.min) / denominator) * 100;
    const right = ((end - this.min) / denominator) * 100;
    this.fill.style.left = `${left}%`;
    this.fill.style.width = `${right - left}%`;
    this.rangeLabel.textContent = `${monthValue(start).slice(0, 7).replace('-', '.')} — ${monthValue(end).slice(0, 7).replace('-', '.')}`;
    if (notify) this.onChange?.({ startDate: monthValue(start), endDate: monthValue(end, true) });
  }

  setRange(startDate, endDate, notify = false) {
    const start = monthIndex(startDate);
    const end = monthIndex(endDate);
    if (Number.isFinite(start)) this.startInput.value = Math.max(this.min, Math.min(this.max, start));
    if (Number.isFinite(end)) this.endInput.value = Math.max(this.min, Math.min(this.max, end));
    this.update(notify);
  }

  reset(notify = true) {
    this.startInput.value = this.min;
    this.endInput.value = this.max;
    this.update(notify);
  }

  togglePlayback() {
    if (this.timer) return this.stopPlayback();
    let year = Math.floor(Number(this.endInput.value) / 12);
    const minYear = Math.floor(this.min / 12);
    const maxYear = Math.floor(this.max / 12);
    if (year >= maxYear) year = minYear - 1;
    this.startInput.value = this.min;
    this.playButton.textContent = 'Ⅱ';
    this.playButton.classList.add('is-playing');
    const advance = () => {
      year += 1;
      this.endInput.value = Math.min(this.max, year * 12 + 11);
      this.update(true);
      if (year >= maxYear) this.stopPlayback();
    };
    advance();
    if (year < maxYear) this.timer = setInterval(advance, this.playbackInterval);
  }

  stopPlayback() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playButton.textContent = '▶';
    this.playButton.classList.remove('is-playing');
  }
}
