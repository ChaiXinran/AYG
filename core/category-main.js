import { activePerson, personUrl } from './data/personRegistry.js?v=36';
import { NavigationRail } from './components/navigation/NavigationRail.js?v=32';
import { getCategoryItems, getCategoryPage } from './components/navigation/categories.js';
import { fillEventLinks } from './components/event-details/eventLinks.js';

const type = new URLSearchParams(window.location.search).get('type') || 'musical';
const person = activePerson();
const category = getCategoryPage(type);
const categoryBackground = person.backgrounds.categories?.[category.id] || person.backgrounds.category;
const categoryBackgroundUrl = new URL(categoryBackground, window.location.href).href;
document.documentElement.style.setProperty('--person-category-background', `url("${categoryBackgroundUrl}")`);
const matches = getCategoryItems(person, category).sort((a, b) => String(b.date || b.year || '').localeCompare(String(a.date || a.year || '')));
const isEventCollection = category.collection === 'events';
document.title = `${person.name} · ${category.label} · My Event Earth`;
new NavigationRail({ container: document.body, active: category.id });

const app = document.querySelector('#categoryApp');
app.innerHTML = `
  <header class="category-header"><a class="category-back" href="${personUrl(person.id, './index.html')}" aria-label="返回${person.name}的活动地球" title="返回活动地球">⬅︎</a><div><span>${person.name.toUpperCase()} · COLLECTION</span><h1>${category.label}</h1><p>${matches.length} 项${isEventCollection ? ` · ${new Set(matches.map((item) => item.city).filter(Boolean)).size} 个城市` : ''}</p></div></header>
  <section class="category-toolbar"><input id="categorySearch" type="search" placeholder="搜索${category.label}内容" /><span id="categoryResultCount">${matches.length} 项</span></section>
  <section id="categoryGrid" class="category-grid"></section>`;

const grid = document.querySelector('#categoryGrid');
function render(items) {
  grid.replaceChildren();
  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'category-card';
    const label = item.category || item.type || item.workType || category.label;
    const date = item.dateLabel || item.date || item.year || '';
    const secondary = isEventCollection
      ? [item.city, item.venue, item.role].filter(Boolean).join(' · ')
      : [item.relatedWork, item.role, item.platform, item.placement].filter(Boolean).join(' · ');
    const description = item.description || item.notes || item.purpose || item.release || '';
    card.innerHTML = `<div class="category-card-meta"><span></span><time></time></div><h2></h2><p class="category-card-location"></p><p class="category-card-description"></p><div class="event-detail-links" hidden></div>`;
    card.querySelector('.category-card-meta span').textContent = label;
    card.querySelector('time').textContent = date;
    card.querySelector('h2').textContent = item.title;
    card.querySelector('.category-card-location').textContent = secondary;
    card.querySelector('.category-card-description').textContent = description;
    fillEventLinks(card.querySelector('.event-detail-links'), item);
    const tourWork = {
      '音乐剧《基督山伯爵》中文版': { id: 'monte-cristo', icon: '⛵', personId: 'ayanga' },
      '音乐剧《风声》': { id: 'the-message', icon: '◆', personId: 'ayanga' },
      '音乐剧《风声》2.0': { id: 'the-message', icon: '◆', personId: 'ayanga' },
      '音乐剧《剧院魅影》中文版': { id: 'phantom-of-opera', icon: '🎭', personId: 'ayanga' },
      '音乐剧《在远方》': { id: 'on-the-road', icon: '📦', personId: 'ayanga' },
    }[item.title];
    if (tourWork?.personId === person.id && isEventCollection) {
      const tourLink = document.createElement('a');
      tourLink.className = 'category-tour-link';
      tourLink.href = personUrl(person.id, `./tour.html?work=${tourWork.id}`);
      tourLink.textContent = `${tourWork.icon} 打开巡演地图`;
      card.append(tourLink);
    }
    grid.append(card);
  });
}
render(matches);
document.querySelector('#categorySearch').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  const filtered = matches.filter((item) => Object.values(item).flat().filter((value) => typeof value === 'string').join(' ').toLowerCase().includes(query));
  document.querySelector('#categoryResultCount').textContent = `${filtered.length} 项`;
  render(filtered);
});
