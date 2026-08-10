import { CATEGORY_PAGES } from './categories.js';

export class NavigationRail {
  constructor({ container = document.body, active = 'earth' } = {}) {
    this.element = document.createElement('nav');
    this.element.className = 'navigation-rail';
    this.element.setAttribute('aria-label', '内容分类导航');
    const items = [
      { id: 'earth', label: '活动地球', icon: '◎', href: './index.html' },
      ...CATEGORY_PAGES.map((item) => ({ ...item, href: `./category.html?type=${item.id}` }))
    ];
    items.forEach((item) => {
      const link = document.createElement('a');
      link.className = `navigation-rail-item${item.id === active ? ' is-active' : ''}`;
      link.href = item.href;
      link.setAttribute('aria-label', item.label);
      link.innerHTML = `<span class="navigation-rail-icon">${item.icon}</span><span class="navigation-rail-tooltip">${item.label}</span>`;
      this.element.append(link);
    });
    container.append(this.element);
  }
}
