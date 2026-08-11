import { CATEGORY_GROUPS, CATEGORY_PAGES } from './categories.js';
import { activePerson, personUrl } from '../../data/personRegistry.js?v=36';

export class NavigationRail {
  constructor({ container = document.body, active = 'earth', actions = [] } = {}) {
    const person = activePerson();
    this.element = document.createElement('nav');
    this.element.className = 'navigation-rail';
    this.element.setAttribute('aria-label', '内容分类导航');
    const categoryById = new Map(CATEGORY_PAGES.map((item) => [item.id, item]));
    const makeLink = (item, className = 'navigation-rail-item') => {
      const link = document.createElement('a');
      link.className = `${className}${item.id === active ? ' is-active' : ''}`;
      link.href = personUrl(person.id, item.id === 'earth' ? './index.html' : `./category.html?type=${item.id}`);
      link.setAttribute('aria-label', item.label);
      link.innerHTML = `<span class="navigation-rail-icon">${item.icon}</span><span class="navigation-rail-tooltip">${item.label}</span>`;
      return link;
    };

    this.element.append(makeLink({ id: 'earth', label: '活动地球', icon: '◎' }));
    const divider = document.createElement('span');
    divider.className = 'navigation-rail-divider';
    this.element.append(divider);

    CATEGORY_GROUPS.forEach((group) => {
      if (group.category) {
        const category = categoryById.get(group.category);
        this.element.append(makeLink({ ...category, label: group.label, icon: group.icon }));
        return;
      }
      const children = group.children.map((id) => categoryById.get(id)).filter(Boolean);
      const groupElement = document.createElement('div');
      groupElement.className = `navigation-rail-group${children.some((item) => item.id === active) ? ' is-active' : ''}`;
      groupElement.innerHTML = `<button class="navigation-rail-item" type="button" aria-label="${group.label}" aria-expanded="false"><span class="navigation-rail-icon">${group.icon}</span><span class="navigation-rail-tooltip">${group.label}</span></button><div class="navigation-rail-submenu" aria-label="${group.label}子分类"></div>`;
      const trigger = groupElement.querySelector('button');
      const submenu = groupElement.querySelector('.navigation-rail-submenu');
      children.forEach((item) => submenu.append(makeLink(item, 'navigation-rail-subitem')));
      trigger.addEventListener('click', () => {
        const willOpen = !groupElement.classList.contains('is-open');
        this.element.querySelectorAll('.navigation-rail-group.is-open').forEach((other) => {
          other.classList.remove('is-open');
          other.querySelector('button')?.setAttribute('aria-expanded', 'false');
        });
        groupElement.classList.toggle('is-open', willOpen);
        trigger.setAttribute('aria-expanded', String(willOpen));
      });
      this.element.append(groupElement);
    });
    if (actions.length) {
      const actionDivider = document.createElement('span');
      actionDivider.className = 'navigation-rail-divider navigation-rail-action-divider';
      this.element.append(actionDivider);
      actions.forEach((action) => {
        const control = document.createElement(action.href ? 'a' : 'button');
        control.id = action.id;
        control.className = 'navigation-rail-item navigation-rail-action';
        if (action.href) control.href = action.href;
        else control.type = 'button';
        control.setAttribute('aria-label', action.label);
        if (action.controls) control.setAttribute('aria-controls', action.controls);
        if (action.expanded != null) control.setAttribute('aria-expanded', String(action.expanded));
        control.innerHTML = `<span class="navigation-rail-icon">${action.icon}</span><span class="navigation-rail-tooltip">${action.label}</span>`;
        this.element.append(control);
      });
    }
    document.addEventListener('click', (event) => {
      if (this.element.contains(event.target)) return;
      this.element.querySelectorAll('.navigation-rail-group.is-open').forEach((group) => group.classList.remove('is-open'));
    });
    container.append(this.element);
  }
}
