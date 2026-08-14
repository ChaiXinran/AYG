export class AnnouncementCenter {
  constructor({ client, button, profileUrl = '/profile/?tab=notifications' }) {
    this.client = client;
    this.button = button;
    this.profileUrl = profileUrl;
    this.items = [];
    this.visibleItems = [];
    this.storageKey = `musical-atlas-read-announcements-v2:${client.config?.siteId || 'duo'}`;
    this.layer = null;
  }

  localReadIds() {
    try {
      const value = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      return new Set(Array.isArray(value) ? value : []);
    } catch {
      return new Set();
    }
  }

  isRead(item) {
    return Boolean(item.read_at) || (!this.client.user && this.localReadIds().has(item.id));
  }

  unreadItems() {
    return this.items.filter((item) => !this.isRead(item));
  }

  mount() {
    if (this.layer) return;
    document.querySelector('.app-shell')?.insertAdjacentHTML('beforeend', `
      <div class="announcement-layer" hidden>
        <div class="announcement-backdrop" data-announcement-close aria-hidden="true"></div>
        <section class="announcement-dialog" role="dialog" aria-modal="true" aria-labelledby="announcementTitle">
          <header><div><span>NOTICE CENTER</span><h2 id="announcementTitle">站内通知</h2></div><button type="button" data-announcement-close aria-label="关闭通知">×</button></header>
          <div class="announcement-list"></div>
          <footer class="announcement-footer">
            <a href="${this.profileUrl}">查看我的账号通知 →</a>
            <span class="announcement-read-hint">勾选通知后确认，才会标记为已读</span>
            <div class="announcement-footer-actions"><button type="button" data-announcement-close>稍后再看</button><button type="button" data-announcement-confirm disabled>确认已读</button></div>
          </footer>
        </section>
      </div>`);
    this.layer = document.querySelector('.announcement-layer');
    this.button?.addEventListener('click', () => this.open(false));
    this.layer?.addEventListener('click', (event) => {
      if (event.target.closest('[data-announcement-close]')) this.close();
      if (event.target.closest('[data-announcement-confirm]')) void this.markSelected();
    });
    this.layer?.addEventListener('change', () => this.updateConfirmState());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.layer && !this.layer.hidden) this.close();
    });
    window.addEventListener('focus', () => { void this.refresh(); });
    window.setInterval(() => { void this.refresh(); }, 60_000);
  }

  render(unreadOnly = false) {
    const audienceLabels = { guest: '游客通知', registered: '注册用户通知', banned: '封禁账号通知', all: '全体通知' };
    this.visibleItems = unreadOnly ? this.unreadItems() : this.items;
    const list = this.layer.querySelector('.announcement-list');
    list.innerHTML = this.visibleItems.length
      ? this.visibleItems.map((item) => {
        const read = this.isRead(item);
        return `<article class="announcement-item ${read ? 'is-read' : ''}">
          <div><span>${escapeHtml(audienceLabels[item.audience] || '站内通知')}</span><time>${escapeHtml(formatDate(item.published_at))}</time></div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.message)}</p>
          ${item.image_url ? `<img class="announcement-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}配图" loading="lazy" />` : ''}
          ${read ? '<div class="announcement-read-state">✓ 已读</div>' : `<label class="announcement-read-choice"><input type="checkbox" value="${escapeHtml(item.id)}" data-announcement-read /> <span>我已阅读，不再自动弹出</span></label>`}
        </article>`;
      }).join('')
      : '<div class="announcement-empty"><span>✓</span><h3>暂时没有未读通知</h3><p>新的站内通知会在进入活动地球后自动显示。</p></div>';
    const link = this.layer.querySelector('.announcement-footer > a');
    if (link) link.hidden = !this.client.user;
    this.updateConfirmState();
  }

  async refresh({ automatic = false } = {}) {
    try {
      const result = await this.client.listAnnouncements(100);
      this.items = result.items || [];
      if (automatic && this.unreadItems().length) this.open(true);
      await this.updateBadge();
    } catch (error) {
      console.warn('站内通知读取失败：', error.message);
    }
  }

  open(unreadOnly = false) {
    this.render(unreadOnly);
    this.layer.hidden = false;
    document.body.classList.add('announcement-open');
    this.layer.querySelector('[data-announcement-close]')?.focus();
  }

  close() {
    this.layer.hidden = true;
    document.body.classList.remove('announcement-open');
  }

  updateConfirmState() {
    const selected = this.layer?.querySelectorAll('[data-announcement-read]:checked').length || 0;
    const button = this.layer?.querySelector('[data-announcement-confirm]');
    if (button) {
      button.disabled = selected < 1;
      button.textContent = selected ? `确认已读（${selected}）` : '确认已读';
    }
  }

  async markSelected() {
    const ids = [...this.layer.querySelectorAll('[data-announcement-read]:checked')].map((input) => input.value);
    if (!ids.length) return;
    const button = this.layer.querySelector('[data-announcement-confirm]');
    button.disabled = true;
    button.textContent = '正在保存…';
    try {
      if (this.client.user) {
        const results = await Promise.all(ids.map((id) => this.client.markAnnouncementRead(id)));
        results.forEach((result) => {
          const item = this.items.find((entry) => entry.id === result.id);
          if (item) item.read_at = result.read_at;
        });
      } else {
        const readIds = this.localReadIds();
        ids.forEach((id) => readIds.add(id));
        localStorage.setItem(this.storageKey, JSON.stringify([...readIds].slice(-500)));
      }
      this.close();
      await this.updateBadge();
    } catch (error) {
      button.disabled = false;
      button.textContent = '保存失败，请重试';
      console.warn('通知已读状态保存失败：', error.message);
    }
  }

  async updateBadge() {
    if (!this.button) return;
    const announcementCount = this.unreadItems().length;
    let personalCount = 0;
    try {
      personalCount = this.client.user ? await this.client.unreadNotificationCount() : 0;
    } catch (error) {
      console.warn('账号通知数量读取失败：', error.message);
    }
    const count = announcementCount + personalCount;
    const badge = this.button.querySelector('em');
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count < 1;
    this.button.classList.toggle('has-unread', count > 0);
    this.button.setAttribute('aria-label', count > 0 ? `查看通知，${count}条未读` : '查看通知');
  }

  async init({ automatic = true } = {}) {
    this.mount();
    await this.refresh({ automatic });
  }
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}
