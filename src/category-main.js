import { events } from './data/allEvents.js?v=29';
import { NavigationRail } from './components/navigation/NavigationRail.js';
import { getCategoryPage } from './components/navigation/categories.js';
import { fillEventLinks } from './components/event-details/eventLinks.js';

const type = new URLSearchParams(window.location.search).get('type') || 'musical';
const category = getCategoryPage(type);
const matches = events.filter(category.match).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
document.title = `${category.label} · My Event Earth`;
new NavigationRail({ container: document.body, active: category.id });

const app = document.querySelector('#categoryApp');
app.innerHTML = `
  <header class="category-header"><a href="./index.html">← 返回地球</a><div><span>COLLECTION</span><h1>${category.label}</h1><p>${matches.length} 个相关活动 · ${new Set(matches.map((event) => event.city).filter(Boolean)).size} 个城市</p></div></header>
  <section class="category-toolbar"><input id="categorySearch" type="search" placeholder="搜索活动、城市或场馆" /><span id="categoryResultCount">${matches.length} 项</span></section>
  <section id="categoryGrid" class="category-grid"></section>`;

const grid = document.querySelector('#categoryGrid');
function render(items) {
  grid.replaceChildren();
  items.forEach((event) => {
    const card = document.createElement('article');
    card.className = 'category-card';
    card.innerHTML = `<div class="category-card-meta"><span>${event.category || '其他'}</span><time>${event.dateLabel || event.date || ''}</time></div><h2></h2><p class="category-card-location"></p><p class="category-card-description"></p><div class="event-detail-links" hidden></div>`;
    card.querySelector('h2').textContent = event.title;
    card.querySelector('.category-card-location').textContent = [event.city, event.venue].filter(Boolean).join(' · ');
    card.querySelector('.category-card-description').textContent = event.description || '';
    fillEventLinks(card.querySelector('.event-detail-links'), event);
    grid.append(card);
  });
}
render(matches);
document.querySelector('#categorySearch').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  const filtered = matches.filter((item) => [item.title, item.city, item.venue, item.description].filter(Boolean).join(' ').toLowerCase().includes(query));
  document.querySelector('#categoryResultCount').textContent = `${filtered.length} 项`;
  render(filtered);
});
