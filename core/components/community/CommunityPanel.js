const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatDate = (value) => {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};

const initials = (name) => [...String(name || 'M')][0]?.toUpperCase() || 'M';

const maskEmail = (email = '') => {
  const [name = '', domain = ''] = String(email).split('@');
  if (!domain) return email;
  const visible = name.length <= 2 ? name[0] || '' : `${name.slice(0, 2)}${'*'.repeat(Math.min(name.length - 2, 4))}`;
  return `${visible}@${domain}`;
};

const ACCOUNT_STATUS_LABELS = {
  pending: '等待审核',
  active: '已通过审核',
  rejected: '审核未通过',
  suspended: '已暂停',
  deleted: '已停用',
};

const GUEST_SESSION_KEY = 'musical-community-guest-access';

export class CommunityPanel {
  constructor({ client, container = document.body, onStateChange = () => {}, onFavoriteChange = () => {}, onEventMarkChange = () => {} }) {
    this.client = client;
    this.onStateChange = onStateChange;
    this.onFavoriteChange = onFavoriteChange;
    this.onEventMarkChange = onEventMarkChange;
    this.activeTab = 'discussion';
    this.currentEvent = null;
    this.comments = [];
    this.replyTarget = null;
    this.editingCommentId = null;
    this.renderVersion = 0;
    this.authView = 'signin';
    this.adminSection = 'applications';
    this.pendingEmail = '';
    this.resendAvailableAt = 0;
    this.turnstileWidgetIds = new Map();
    this.turnstileLoadPromise = null;
    this.signupQuestion = null;
    this.signupQuestionLoading = false;
    this.signupQuestionError = '';

    this.root = document.createElement('div');
    this.root.className = 'community-layer';
    this.root.hidden = true;
    this.root.innerHTML = `
      <button class="community-backdrop" type="button" data-action="close" aria-label="关闭社区面板"></button>
      <aside id="communityPanel" class="community-panel" aria-label="双人站社区" aria-modal="true" role="dialog">
        <header class="community-header">
          <div>
            <div class="community-kicker"><span class="community-live-dot"></span> MUSICAL COMMUNITY</div>
            <h2>双人站社区</h2>
          </div>
          <div class="community-header-actions">
            <span class="community-mode-badge">${client.isDemo() ? '演示模式' : '已连接'}</span>
            <button class="community-close" type="button" data-action="close" aria-label="关闭">×</button>
          </div>
        </header>
        <nav class="community-tabs" aria-label="社区功能">
          <button type="button" data-tab="discussion">讨论</button>
          <button type="button" data-tab="favorites">收藏</button>
          <button type="button" data-tab="account">登录</button>
        </nav>
        <div class="community-content"></div>
        <div class="community-toast" role="status" aria-live="polite"></div>
      </aside>
    `;
    container.append(this.root);
    this.content = this.root.querySelector('.community-content');
    this.toastElement = this.root.querySelector('.community-toast');
    this.bindEvents();
  }

  async init() {
    await this.client.init();
    if (this.client.user) sessionStorage.removeItem(GUEST_SESSION_KEY);
    this.updateAdminNavigation();
    this.onStateChange(this.client.user);
    const requestedTab = new URLSearchParams(window.location.search).get('community');
    const callback = this.client.getAuthCallbackResult();
    if (callback) {
      if (this.client.user && callback.status === 'recovery') {
        this.authView = 'reset-password';
        this.open('account');
        window.setTimeout(() => this.toast(callback.message), 220);
        return;
      }
      if (this.client.user && callback.status !== 'error') {
        window.location.replace('/profile/?confirmed=1');
        return;
      }
      this.open('account');
      window.setTimeout(() => this.toast(callback.message, callback.status === 'error'), 220);
    } else if (['discussion', 'favorites', 'submit', 'account', 'admin'].includes(requestedTab)) {
      if (requestedTab === 'submit') {
        window.location.replace('/submission/');
        return;
      }
      this.open(requestedTab);
    } else if (!this.client.user && sessionStorage.getItem(GUEST_SESSION_KEY) !== '1') {
      this.open('account');
    }
  }

  bindEvents() {
    this.root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      const tab = event.target.closest('[data-tab]')?.dataset.tab;
      const adminSection = event.target.closest('[data-admin-section]')?.dataset.adminSection;
      if (action === 'close') this.close();
      if (action === 'continue-as-guest') {
        sessionStorage.setItem(GUEST_SESSION_KEY, '1');
        this.close();
      }
      if (tab) {
        if (tab === 'submit') {
          window.location.href = '/submission/';
          return;
        }
        this.activeTab = tab;
        await this.render();
      }
      if (adminSection) {
        this.adminSection = adminSection;
        await this.renderAdmin();
      }
      if (action === 'signout') {
        await this.client.signOut();
        this.authView = 'signin';
        this.updateAdminNavigation();
        this.onStateChange(null);
        this.toast('已退出当前账号');
        await this.render();
      }
      const authView = event.target.closest('[data-auth-view]')?.dataset.authView;
      if (authView) {
        this.authView = authView;
        if (authView !== 'confirm-sent') this.pendingEmail = '';
        this.renderAccount();
      }
      if (action === 'resend-confirmation') await this.resendConfirmation();
      if (action === 'like-comment') {
        const comment = this.comments.find((item) => item.id === event.target.closest('[data-comment-id]')?.dataset.commentId);
        if (!comment) return;
        try {
          await this.client.toggleCommentLike(comment);
          await this.renderDiscussion();
        } catch (error) {
          this.requireAccount(error.message);
        }
      }
      if (action === 'reply-comment') {
        if (!this.client.user) {
          this.requireAccount('登录后可以回复评论');
          return;
        }
        const requested = this.comments.find((item) => item.id === event.target.closest('[data-comment-id]')?.dataset.commentId);
        if (!requested) return;
        this.replyTarget = requested.parent_id
          ? this.comments.find((item) => item.id === requested.parent_id) || requested
          : requested;
        this.editingCommentId = null;
        await this.renderDiscussion();
        this.content.querySelector('.community-composer textarea')?.focus();
      }
      if (action === 'cancel-reply') {
        this.replyTarget = null;
        await this.renderDiscussion();
      }
      if (action === 'edit-comment') {
        const comment = this.comments.find((item) => item.id === event.target.closest('[data-comment-id]')?.dataset.commentId);
        if (!comment || comment.user_id !== this.client.user?.id) return;
        this.editingCommentId = comment.id;
        this.replyTarget = null;
        await this.renderDiscussion();
        this.content.querySelector('[data-form="edit-comment"] textarea')?.focus();
      }
      if (action === 'cancel-edit-comment') {
        this.editingCommentId = null;
        await this.renderDiscussion();
      }
      if (action === 'delete-comment') await this.deleteComment(event.target.closest('[data-comment-id]')?.dataset.commentId);
      if (action === 'event-mark-current') await this.toggleCurrentEventMark(event.target.closest('[data-event-mark]')?.dataset.eventMark);
      if (action === 'favorite-current') {
        await this.toggleFavoriteCurrent();
      }
      if (action === 'review-account' || action === 'review-submission') {
        await this.handleAdminReview(event.target.closest('[data-action]'), action === 'review-account' ? 'account' : 'submission');
      }
      if (action === 'review-report') await this.handleAdminReview(event.target.closest('[data-action]'), 'report');
      if (action === 'review-question') await this.handleAdminReview(event.target.closest('[data-action]'), 'question');
      if (action === 'edit-question') await this.handleQuestionEdit(event.target.closest('[data-action]'));
      if (action === 'delete-question') await this.handleQuestionDelete(event.target.closest('[data-action]'));
      if (action === 'save-management-level') await this.handleManagementLevel(event.target.closest('[data-action]'));
      if (action === 'reload-review-question') {
        this.signupQuestion = null;
        await this.loadSignupQuestion();
      }
      if (action === 'report-comment') await this.reportComment(event.target.closest('[data-comment-id]')?.dataset.commentId);
      if (action === 'report-user') await this.reportUser(event.target.closest('[data-user-id]')?.dataset.userId);
    });

    this.root.addEventListener('input', (event) => {
      if (event.target.matches('textarea[name="reviewAnswer"]')) {
        const count = [...event.target.value.trim()].length;
        const counter = this.content.querySelector('[data-answer-count]');
        if (counter) counter.textContent = `${count} / 200 字`;
      }
    });

    this.root.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const submitButton = event.submitter;
      if (form.matches('[data-form="comment"]')) await this.submitComment(form);
      if (form.matches('[data-form="edit-comment"]')) await this.submitCommentEdit(form);
      if (form.matches('[data-form="auth"]')) await this.submitAuth(form, submitButton?.value || 'signin');
      if (form.matches('[data-form="password-reset-request"]')) await this.submitPasswordResetRequest(form);
      if (form.matches('[data-form="new-password"]')) await this.submitNewPassword(form);
      if (form.matches('[data-form="submission"]')) await this.submitEvent(form);
      if (form.matches('[data-form="review-question"]')) await this.submitReviewQuestion(form);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.root.hidden) this.close();
    });
  }

  selectEvent(event) {
    if (this.currentEvent && this.currentEvent.id !== event?.id) {
      this.replyTarget = null;
      this.editingCommentId = null;
    }
    this.currentEvent = event;
    if (!this.root.hidden && this.activeTab === 'discussion') this.renderDiscussion();
  }

  open(tab = 'discussion', event = undefined) {
    if (tab === 'submit') {
      window.location.href = '/submission/';
      return;
    }
    if (tab === 'admin' && this.client.user) {
      window.location.href = this.client.isAdmin() ? '/profile/?tab=admin' : '/profile/';
      return;
    }
    if (tab === 'admin') tab = 'account';
    if (tab === 'account' && this.client.user) {
      window.location.href = '/profile/';
      return;
    }
    if (event && this.currentEvent?.id !== event.id) {
      this.replyTarget = null;
      this.editingCommentId = null;
    }
    if (event) this.currentEvent = event;
    this.activeTab = tab;
    this.root.classList.toggle('is-auth-modal', tab === 'account' && !this.client.user);
    this.root.hidden = false;
    document.body.classList.add('community-open');
    this.render();
    requestAnimationFrame(() => this.root.classList.add('is-open'));
  }

  close() {
    this.root.classList.remove('is-open');
    document.body.classList.remove('community-open');
    window.setTimeout(() => { this.root.hidden = true; }, 180);
  }

  async render() {
    if (this.activeTab === 'admin' && !this.client.isAdmin()) this.activeTab = this.client.user ? 'discussion' : 'account';
    this.root.classList.toggle('is-auth-modal', this.activeTab === 'account' && !this.client.user);
    this.root.querySelectorAll('[data-tab]').forEach((button) => {
      const active = button.dataset.tab === this.activeTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (this.activeTab === 'discussion') await this.renderDiscussion();
    if (this.activeTab === 'favorites') await this.renderFavorites();
    if (this.activeTab === 'submit') this.renderSubmission();
    if (this.activeTab === 'account') this.renderAccount();
  }

  updateAdminNavigation() {
    const accountButton = this.root.querySelector('[data-tab="account"]');
    if (accountButton) accountButton.hidden = Boolean(this.client.user);
    this.root.querySelector('.community-tabs')?.classList.remove('has-admin');
    this.root.querySelector('.community-tabs')?.classList.toggle('is-signed-in', Boolean(this.client.user));
  }

  async renderDiscussion() {
    const version = ++this.renderVersion;
    if (!this.currentEvent) {
      this.content.innerHTML = `
        <div class="community-empty community-empty-map">
          <span>◎</span><h3>先从地球上选择一场活动</h3>
          <p>点击活动节点，在详情卡片中进入讨论。不同网站拥有各自的讨论氛围。</p>
        </div>`;
      return;
    }
    this.content.innerHTML = '<div class="community-loading">正在打开讨论现场…</div>';
    try {
      const [comments, eventMarks] = await Promise.all([
        this.client.listComments(this.currentEvent),
        this.client.getEventMarks([this.currentEvent]),
      ]);
      if (version !== this.renderVersion) return;
      this.comments = comments;
      const marks = eventMarks.get(String(this.currentEvent.communityId || this.currentEvent.id)) || {};
      this.content.innerHTML = `
        <section class="community-event-context">
          <div class="community-event-topline"><span>${escapeHtml(this.currentEvent.category)}</span><span>${escapeHtml(this.currentEvent.dateLabel || this.currentEvent.date || '')}</span></div>
          <h3>${escapeHtml(this.currentEvent.title)}</h3>
          <p>${escapeHtml([this.currentEvent.city, this.currentEvent.venue].filter(Boolean).join(' · '))}</p>
          <div class="community-event-mark-list">
            ${this.eventMarkButton('watched', marks.watched)}
            ${this.eventMarkButton('recommended', marks.recommended)}
            ${this.eventMarkButton('favorite', marks.favorite)}
          </div>
        </section>
        <section class="community-thread" aria-label="活动讨论">
          <div class="community-section-heading"><h3>现场讨论</h3><span>${comments.length} 条</span></div>
          <div class="community-comment-list">
            ${comments.length ? comments.map((comment) => this.commentMarkup(comment)).join('') : '<div class="community-empty-inline">还没有人留言，来成为第一个吧。</div>'}
          </div>
          ${this.commentComposerMarkup()}
        </section>`;
    } catch (error) {
      this.content.innerHTML = `<div class="community-error"><h3>讨论加载失败</h3><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  commentMarkup(comment) {
    const liked = Boolean(comment.liked_by_me);
    const isOwner = this.client.user?.id === comment.user_id;
    const isDeleted = comment.status === 'deleted';
    const parent = comment.parent_id ? this.comments.find((item) => item.id === comment.parent_id) : null;
    if (this.editingCommentId === comment.id && isOwner && !isDeleted) {
      return `
        <article class="community-comment${comment.parent_id ? ' is-reply' : ''}" data-comment-id="${escapeHtml(comment.id)}">
          <div class="community-avatar">${comment.avatar_url ? `<img src="${escapeHtml(comment.avatar_url)}" alt="" />` : escapeHtml(initials(comment.display_name))}</div>
          <form class="community-comment-edit" data-form="edit-comment">
            <textarea name="content" maxlength="2000" rows="4" required>${escapeHtml(comment.content)}</textarea>
            <div><button type="button" data-action="cancel-edit-comment">取消</button><button type="submit">保存修改</button></div>
          </form>
        </article>`;
    }
    return `
      <article class="community-comment${comment.parent_id ? ' is-reply' : ''}${isDeleted ? ' is-deleted' : ''}" data-comment-id="${escapeHtml(comment.id)}">
        ${isOwner || !this.client.user ? `<div class="community-avatar">${comment.avatar_url ? `<img src="${escapeHtml(comment.avatar_url)}" alt="" />` : escapeHtml(initials(comment.display_name))}</div>` : `<button class="community-avatar community-avatar-report" type="button" data-action="report-user" data-user-id="${escapeHtml(comment.user_id)}" aria-label="举报${escapeHtml(comment.display_name)}">${comment.avatar_url ? `<img src="${escapeHtml(comment.avatar_url)}" alt="" />` : escapeHtml(initials(comment.display_name))}</button>`}
        <div class="community-comment-body">
          <div class="community-comment-meta"><strong>${escapeHtml(comment.display_name)}</strong>${parent ? `<span>回复 ${escapeHtml(parent.display_name)}</span>` : ''}<time>${escapeHtml(formatDate(comment.created_at))}${comment.updated_at && comment.updated_at !== comment.created_at ? ' · 已编辑' : ''}</time></div>
          <p>${escapeHtml(comment.content)}</p>
          ${isDeleted ? '' : `<div class="community-comment-actions"><button type="button" class="community-like${liked ? ' is-active' : ''}" data-action="like-comment" data-comment-id="${escapeHtml(comment.id)}" aria-label="点赞评论">${liked ? '👍 已赞' : '👍 点赞'} <span>${Number(comment.like_count || 0)}</span></button>${!comment.parent_id ? `<button type="button" data-action="reply-comment" data-comment-id="${escapeHtml(comment.id)}">↩ 回复</button>` : ''}${isOwner ? `<button type="button" data-action="edit-comment" data-comment-id="${escapeHtml(comment.id)}">✎ 编辑</button><button type="button" class="is-danger" data-action="delete-comment" data-comment-id="${escapeHtml(comment.id)}">删除</button>` : this.client.user ? `<button type="button" class="community-report-link" data-action="report-comment" data-comment-id="${escapeHtml(comment.id)}" aria-label="举报评论">⚑</button>` : ''}</div>`}
        </div>
      </article>`;
  }

  eventMarkButton(type, active) {
    const labels = {
      watched: [active ? '◉' : '○', active ? '看过' : '标记看过'],
      recommended: [active ? '★' : '☆', active ? '已推荐' : '推荐'],
      favorite: [active ? '♥' : '♡', active ? '已收藏' : '收藏'],
    };
    const [icon, label] = labels[type];
    return `<button class="community-event-mark${active ? ' is-active' : ''}" type="button" data-action="event-mark-current" data-event-mark="${type}" aria-pressed="${Boolean(active)}"><span>${icon}</span>${label}</button>`;
  }

  commentComposerMarkup() {
    if (!this.client.user) {
      return `<button class="community-login-prompt" type="button" data-tab="account"><span>登录后参与讨论</span><span>→</span></button>`;
    }
    if (!this.client.isApproved()) {
      return `<button class="community-login-prompt community-review-pending" type="button" data-tab="account"><span>账号审核通过后可参与讨论</span><span>查看状态 →</span></button>`;
    }
    const name = this.client.user.display_name || this.client.user.user_metadata?.display_name || this.client.user.email?.split('@')[0] || '社区用户';
    return `
      <form class="community-composer" data-form="comment">
        <div class="community-avatar is-me">${escapeHtml(initials(name))}</div>
        <div class="community-composer-main">
          ${this.replyTarget ? `<div class="community-replying-to"><span>回复 ${escapeHtml(this.replyTarget.display_name)}</span><button type="button" data-action="cancel-reply" aria-label="取消回复">×</button></div><input type="hidden" name="parentId" value="${escapeHtml(this.replyTarget.id)}" />` : ''}
          <textarea name="content" maxlength="2000" rows="3" required placeholder="${this.replyTarget ? `回复 ${escapeHtml(this.replyTarget.display_name)}…` : '写下你对这场活动的记忆或期待…'}"></textarea>
          <div><span>文明交流，共同维护讨论氛围</span><button type="submit">发布</button></div>
        </div>
      </form>`;
  }

  async renderFavorites() {
    this.content.innerHTML = '<div class="community-loading">正在整理你的收藏…</div>';
    if (!this.client.user) {
      this.content.innerHTML = this.accountRequiredMarkup('登录后，三个网站的活动收藏会汇总在这里。');
      return;
    }
    try {
      const favorites = await this.client.listFavorites();
      this.content.innerHTML = `
        <div class="community-page-intro"><span class="community-page-icon">♡</span><div><h3>我的活动收藏</h3><p>收藏活动本体，在三个网站之间共享。</p></div></div>
        <div class="community-favorite-list">
          ${favorites.length ? favorites.map((item) => `
            <article class="community-favorite-card">
              <div><span>${escapeHtml(item.category || '活动')}</span><time>${escapeHtml(item.date || '')}</time></div>
              <h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.city || '')}</p>
            </article>`).join('') : '<div class="community-empty"><span>♡</span><h3>收藏夹还是空的</h3><p>从地球上选择活动，点击“收藏活动”即可加入这里。</p></div>'}
        </div>`;
    } catch (error) {
      this.content.innerHTML = `<div class="community-error"><h3>收藏加载失败</h3><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  renderSubmission() {
    void this.renderAdvancedSubmission();
    return;
    if (!this.client.user) {
      this.content.innerHTML = this.accountRequiredMarkup('登录后可以提交遗漏的演出和活动线索。');
      return;
    }
    if (!this.client.isApproved()) {
      this.content.innerHTML = this.reviewRequiredMarkup('管理员审核通过账号后，即可提交活动线索。');
      return;
    }
    this.content.innerHTML = `
      <div class="community-page-intro"><span class="community-page-icon">＋</span><div><h3>提交活动线索</h3><p>投稿先进入审核队列，通过后才会出现在地图。</p></div></div>
      <form class="community-form" data-form="submission">
        <label><span>活动名称</span><input name="title" maxlength="200" required placeholder="例如：某音乐剧上海场" /></label>
        <div class="community-form-grid">
          <label><span>活动类别</span><select name="category"><option>音乐剧</option><option>演唱会</option><option>晚会</option><option>综艺</option><option>商务活动</option><option>其他</option></select></label>
          <label><span>活动日期</span><input name="date" type="date" required /></label>
        </div>
        <div class="community-form-grid">
          <label><span>城市</span><input name="city" maxlength="100" placeholder="上海" /></label>
          <label><span>场馆</span><input name="venue" maxlength="200" placeholder="剧院或活动地点" /></label>
        </div>
        <label><span>可核验来源</span><input name="source_url" type="url" required placeholder="https://" /></label>
        <label><span>补充说明</span><textarea name="description" maxlength="10000" rows="4" placeholder="时间、卡司或其他有助于审核的信息"></textarea></label>
        <fieldset class="community-site-choice"><legend>建议展示在</legend>
          <label><input type="checkbox" name="proposed_sites" value="duo" checked /> 双人站</label>
          <label><input type="checkbox" name="proposed_sites" value="ayg" /> 阿云嘎站</label>
          <label><input type="checkbox" name="proposed_sites" value="zyl" /> 郑云龙站</label>
        </fieldset>
        ${this.client.isDemo() ? '<p class="community-demo-note">演示模式：提交内容仅保存在当前浏览器，不会进入正式审核。</p>' : '<div id="communityTurnstile" class="community-turnstile">正在加载安全验证…</div><input type="hidden" name="turnstile_token" />'}
        <button class="community-submit" type="submit">提交审核 <span>→</span></button>
      </form>`;
    if (!this.client.isDemo()) this.renderTurnstile({ action: 'event_submission' });
  }

  async renderAdvancedSubmission() {
    if (!this.client.user) {
      this.content.innerHTML = this.accountRequiredMarkup('登录后可以添加私人活动或提交公开活动资料。');
      return;
    }
    if (!this.client.isApproved()) {
      this.content.innerHTML = this.reviewRequiredMarkup('管理员审核通过账号后，即可使用投稿和个人地球。');
      return;
    }
    const privateCategories = ['音乐剧', '话剧', '歌剧', '戏曲', '演唱会', 'Gala', '晚会', '其它线下活动'];
    const publicCategories = ['音乐剧', '话剧', '演唱会/Gala', '影视作品', '晚会', '综艺', 'OST', '单曲', '商务活动'];
    this.content.innerHTML = `
      <div class="community-page-intro submission-intro"><span class="community-page-icon">＋</span><div><h3>添加活动</h3><p>私人活动立即保存到个人地球；公开活动审核通过后同步到双人站及对应个人站。</p></div></div>
      <form class="community-form advanced-submission-form" data-form="submission">
        <div class="submission-mode-switch" role="group" aria-label="投稿可见范围">
          <label><input type="radio" name="submission_scope" value="private" checked /><span><strong>私人投稿</strong><small>仅自己可见 · 无需审核</small></span></label>
          <label><input type="radio" name="submission_scope" value="public" /><span><strong>公开投稿</strong><small>审核后所有人可见</small></span></label>
        </div>
        <div class="public-submission-options" data-public-only hidden>
          <div class="submission-kind-switch">
            <label><input type="radio" name="submission_kind" value="create" checked /> 添加公开活动</label>
            <label><input type="radio" name="submission_kind" value="edit" /> 申请编辑已有活动</label>
          </div>
          <label data-edit-only hidden><span>选择要编辑的公开活动</span><select name="target_event_id"><option value="">正在载入公开活动…</option></select></label>
          <fieldset class="community-site-choice"><legend>活动人物（自动同步到双人站和对应个人站）</legend>
            <label><input type="checkbox" name="person_ids" value="ayg" /> 阿云嘎</label>
            <label><input type="checkbox" name="person_ids" value="zyl" /> 郑云龙</label>
          </fieldset>
        </div>
        <label><span>活动名称</span><input name="title" maxlength="200" required placeholder="活动、演出或作品名称" /></label>
        <div class="community-form-grid">
          <label><span>活动分类</span><select name="category" required>${privateCategories.map((value) => `<option>${value}</option>`).join('')}</select></label>
          <label><span>日期</span><input name="date" type="date" required /></label>
        </div>
        <div class="community-form-grid">
          <label><span>具体时间</span><input name="time" type="time" required /></label>
          <label><span>结束时间（可选）</span><input name="end_time" type="datetime-local" /></label>
        </div>
        <div class="community-form-grid">
          <label><span>国家</span><input name="country" maxlength="100" value="中国" required /></label>
          <label><span>城市</span><input name="city" maxlength="100" required placeholder="上海" /></label>
        </div>
        <label><span>场馆</span><input name="venue" maxlength="200" list="submissionVenueOptions" required placeholder="输入或从该城市已有场馆中选择" /><datalist id="submissionVenueOptions"></datalist><small data-venue-hint>选择已有场馆会自动填写经纬度；自定义场馆请自行填写。</small></label>
        <div class="community-form-grid">
          <label><span>纬度</span><input name="latitude" type="number" min="-90" max="90" step="0.000001" required /></label>
          <label><span>经度</span><input name="longitude" type="number" min="-180" max="180" step="0.000001" required /></label>
        </div>
        <label><span>活动简介</span><textarea name="description" maxlength="10000" rows="5" placeholder="活动内容、角色、场次或其它补充信息"></textarea></label>
        <label><span>媒体链接（每行一个，可添加多个）</span><textarea name="media_links" rows="4" placeholder="https://…"></textarea></label>
        <label><span>图片（可多选，第一张将作为结点详情和活动卡片背景）</span><input name="images" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple /></label>
        <input type="hidden" name="source_url" />
        ${this.client.isDemo() ? '<p class="community-demo-note">演示模式：内容只保存在当前浏览器。</p>' : '<div id="communityTurnstile" class="community-turnstile">正在加载安全验证…</div><input type="hidden" name="turnstile_token" />'}
        <button class="community-submit" type="submit"><span data-submission-button-label>保存到个人地球</span> <span>→</span></button>
      </form>`;

    const form = this.content.querySelector('[data-form="submission"]');
    const scopeInputs = [...form.querySelectorAll('[name="submission_scope"]')];
    const kindInputs = [...form.querySelectorAll('[name="submission_kind"]')];
    const categorySelect = form.elements.category;
    const publicOnly = form.querySelector('[data-public-only]');
    const editOnly = form.querySelector('[data-edit-only]');
    const targetSelect = form.elements.target_event_id;
    let publicEvents = [];
    let venues = [];

    const setCategoryOptions = (values, selected = '') => {
      const options = selected && !values.includes(selected) ? [selected, ...values] : values;
      categorySelect.innerHTML = options.map((value) => `<option${value === selected ? ' selected' : ''}>${value}</option>`).join('');
    };
    const syncMode = () => {
      const isPublic = form.elements.submission_scope.value === 'public';
      const isEdit = isPublic && form.elements.submission_kind.value === 'edit';
      publicOnly.hidden = !isPublic;
      editOnly.hidden = !isEdit;
      targetSelect.required = isEdit;
      setCategoryOptions(isPublic ? publicCategories : privateCategories, categorySelect.value);
      form.querySelector('[data-submission-button-label]').textContent = isPublic ? '提交管理员审核' : '保存到个人地球';
    };
    const prefillFromEvent = () => {
      const event = publicEvents.find((item) => item.communityId === targetSelect.value);
      if (!event) return;
      form.elements.title.value = event.title || '';
      setCategoryOptions(publicCategories, event.category || '');
      form.elements.date.value = event.date || '';
      form.elements.time.value = event.startTime?.slice(11, 16) || '19:30';
      form.elements.country.value = event.country || '';
      form.elements.city.value = event.city || '';
      form.elements.venue.value = event.venue || '';
      form.elements.latitude.value = event.lat ?? '';
      form.elements.longitude.value = event.lon ?? '';
      form.elements.description.value = event.description || '';
      form.elements.media_links.value = (event.sourceUrls || []).join('\n');
      form.querySelectorAll('[name="person_ids"]').forEach((input) => { input.checked = (event.personIds || []).includes(input.value === 'ayg' ? 'ayanga' : 'zhengyunlong'); });
    };
    scopeInputs.forEach((input) => input.addEventListener('change', syncMode));
    kindInputs.forEach((input) => input.addEventListener('change', () => { syncMode(); if (form.elements.submission_kind.value === 'edit') prefillFromEvent(); }));
    targetSelect.addEventListener('change', prefillFromEvent);
    form.elements.city.addEventListener('change', async () => {
      venues = await this.client.listVenues(form.elements.city.value).catch(() => []);
      form.querySelector('#submissionVenueOptions').innerHTML = venues.map((venue) => `<option value="${escapeHtml(venue.name)}">${escapeHtml([venue.city, venue.address].filter(Boolean).join(' · '))}</option>`).join('');
    });
    form.elements.venue.addEventListener('change', () => {
      const venue = venues.find((item) => item.name === form.elements.venue.value);
      if (!venue) return;
      form.elements.country.value = venue.country || form.elements.country.value;
      form.elements.city.value = venue.city || form.elements.city.value;
      form.elements.latitude.value = venue.latitude ?? '';
      form.elements.longitude.value = venue.longitude ?? '';
      form.querySelector('[data-venue-hint]').textContent = '已从场馆资料自动填写经纬度。';
    });
    publicEvents = await this.client.listEvents().catch(() => []);
    targetSelect.innerHTML = '<option value="">请选择活动</option>' + publicEvents.map((event) => `<option value="${escapeHtml(event.communityId)}">${escapeHtml([event.date, event.title, event.city].filter(Boolean).join(' · '))}</option>`).join('');
    syncMode();
    if (!this.client.isDemo()) this.renderTurnstile({ action: 'event_submission' });
  }

  async renderAdmin() {
    if (!this.client.isAdmin()) {
      this.content.innerHTML = this.accountRequiredMarkup('需要管理员权限才能进入审核工作台。');
      return;
    }
    this.content.innerHTML = '<div class="community-loading">正在加载审核队列…</div>';
    try {
      const { applications, submissions, reports, questions, users } = await this.client.listAdminQueues();
      const level = this.client.managementLevel();
      const pendingQuestions = questions.filter((item) => item.status === 'pending');
      const approvedQuestions = questions.filter((item) => item.status === 'approved' && item.is_active);
      const sections = [
        this.client.can('review_accounts') ? { id: 'applications', label: '账号审核', count: applications.length } : null,
        this.client.can('review_submissions') ? { id: 'submissions', label: '投稿审核', count: submissions.length } : null,
        this.client.can('handle_reports') ? { id: 'reports', label: '举报处理', count: reports.length } : null,
        this.client.can('submit_questions') ? { id: 'questions', label: '问题库', count: pendingQuestions.length } : null,
        this.client.can('manage_roles') ? { id: 'users', label: '用户权限', count: users.length } : null,
      ].filter(Boolean);
      if (!sections.some((item) => item.id === this.adminSection)) this.adminSection = sections[0]?.id || 'submissions';

      const sectionMarkup = {
        applications: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>账号申请</h3><span>${applications.length} 个待处理</span></div><div class="community-review-list">${applications.length ? applications.map((item) => this.accountApplicationMarkup(item)).join('') : '<div class="community-empty-inline">当前没有待审核账号。</div>'}</div></section>`,
        submissions: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>投稿申请</h3><span>${submissions.length} 个待处理</span></div><div class="community-review-list">${submissions.length ? submissions.map((item) => this.submissionReviewMarkup(item)).join('') : '<div class="community-empty-inline">当前没有待审核投稿。</div>'}</div></section>`,
        reports: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>举报处理</h3><span>${reports.length} 个待处理</span></div><div class="community-review-list">${reports.length ? reports.map((item) => this.reportReviewMarkup(item)).join('') : '<div class="community-empty-inline">当前没有待处理举报。</div>'}</div></section>`,
        questions: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>添加审核问题</h3><span>${level === 1 ? '直接进入题库' : '需一级管理员审核'}</span></div><form class="community-form community-question-form" data-form="review-question"><textarea name="prompt" minlength="10" maxlength="500" required rows="3" placeholder="输入注册者需要回答的问题（10—500 字）"></textarea><button class="community-submit" type="submit">${level === 1 ? '添加到备选题库' : '提交问题提案'} <span>→</span></button></form><div class="community-question-group"><div class="community-review-heading"><h3>待审核问题</h3><span>${pendingQuestions.length} 个</span></div><div class="community-review-list">${pendingQuestions.length ? pendingQuestions.map((item) => this.questionReviewMarkup(item)).join('') : '<div class="community-empty-inline">当前没有待审核问题。</div>'}</div></div><div class="community-question-group"><div class="community-review-heading"><h3>已通过问题</h3><span>${approvedQuestions.length} 个可用</span></div><div class="community-review-list">${approvedQuestions.length ? approvedQuestions.map((item) => this.questionReviewMarkup(item)).join('') : '<div class="community-empty-inline">当前没有已通过问题。</div>'}</div></div></section>`,
        users: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>全部账号与权限</h3><span>${users.length} 个账号</span></div><div class="community-review-list">${users.length ? users.map((item) => this.userManagementMarkup(item)).join('') : '<div class="community-empty-inline">没有账号数据。</div>'}</div></section>`,
      }[this.adminSection] || '';
      this.content.innerHTML = `
        <div class="community-page-intro community-admin-intro"><span class="community-page-icon">${level}</span><div><h3>${level}级管理员工作台</h3><p>${level === 1 ? '账号、权限、问题库及全部审核功能。' : level === 2 ? '账号与投稿审核、举报处理及问题提案。' : '投稿审核与举报处理。'}</p></div></div>
        <nav class="community-admin-categories" aria-label="审核分类">${sections.map((item) => `<button type="button" data-admin-section="${item.id}" class="${this.adminSection === item.id ? 'is-active' : ''}"><span>${escapeHtml(item.label)}</span><em>${item.count}</em></button>`).join('')}</nav>
        ${sectionMarkup}`;
    } catch (error) {
      this.content.innerHTML = `<div class="community-error"><h3>审核队列加载失败</h3><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  accountApplicationMarkup(item) {
    return `
      <article class="community-review-card" data-review-card="account">
        <div class="community-review-card-top"><span>${item.user_group === 'cloud' ? '☁ 云朵 · 阿云嘎站' : item.user_group === 'star' ? '⭐ 小星星 · 郑云龙站' : '云女 · 三站权限'}</span><time>${escapeHtml(formatDate(item.created_at))}</time></div>
        <h4>${escapeHtml(item.display_name || '新用户')}</h4>
        <p>${escapeHtml(item.email || '邮箱信息不可用')}</p>
        <div class="community-application-answer"><strong>审核问题</strong><p>${escapeHtml(item.question_snapshot)}</p><strong>注册理由 · ${[...String(item.answer || '')].length} 字</strong><p>${escapeHtml(item.answer)}</p></div>
        <textarea class="community-review-note" maxlength="2000" placeholder="审核备注（可选）"></textarea>
        <div class="community-review-actions">
          <button type="button" data-action="review-account" data-review-id="${escapeHtml(item.user_id)}" data-decision="approved">通过</button>
          <button class="is-danger" type="button" data-action="review-account" data-review-id="${escapeHtml(item.user_id)}" data-decision="rejected">拒绝</button>
        </div>
      </article>`;
  }

  submissionReviewMarkup(item) {
    return this.advancedSubmissionReviewMarkup(item);
    /* legacy review card retained below */
    const place = [item.city, item.venue].filter(Boolean).join(' · ');
    return `
      <article class="community-review-card" data-review-card="submission">
        <div class="community-review-card-top"><span>${escapeHtml(item.category || '活动')}</span><time>${escapeHtml(formatDate(item.created_at))}</time></div>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.submitter_name || '社区用户')} · ${escapeHtml(item.start_time?.slice(0, 10) || '')}${place ? ` · ${escapeHtml(place)}` : ''}</p>
        ${item.description ? `<div class="community-review-description">${escapeHtml(item.description)}</div>` : ''}
        ${item.source_url ? `<a class="community-review-source" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">查看核验来源 ↗</a>` : ''}
        <div class="community-review-sites">同步到：${(item.proposed_sites || []).map((site) => escapeHtml(site)).join(' · ')}</div>
        <textarea class="community-review-note" maxlength="2000" placeholder="审核备注（可选）"></textarea>
        <div class="community-review-actions">
          <button type="button" data-action="review-submission" data-review-id="${escapeHtml(item.id)}" data-decision="approved">通过并发布</button>
          <button class="is-danger" type="button" data-action="review-submission" data-review-id="${escapeHtml(item.id)}" data-decision="rejected">拒绝</button>
        </div>
      </article>`;
  }

  advancedSubmissionReviewMarkup(item) {
    const before = item.before_snapshot || null;
    const beforeVenue = Array.isArray(before?.venue) ? before.venue[0]?.name : before?.venue?.name;
    const rows = [
      ['活动名称', before?.title, item.title],
      ['分类', before?.category, item.category],
      ['开始时间', before?.start_time, item.start_time],
      ['结束时间', before?.end_time, item.end_time],
      ['国家', before?.country, item.country],
      ['城市', before?.city, item.city],
      ['场馆', beforeVenue, item.venue],
      ['纬度', before?.latitude, item.latitude],
      ['经度', before?.longitude, item.longitude],
      ['简介', before?.description, item.description],
      ['主要来源', before?.source_url, item.source_url],
    ];
    const diff = rows.map(([label, oldValue, newValue]) => {
      const changed = String(oldValue ?? '') !== String(newValue ?? '');
      return `<div class="submission-diff-row${changed ? ' is-changed' : ''}"><strong>${escapeHtml(label)}</strong>${before ? `<div><small>修改前</small><span>${escapeHtml(oldValue ?? '—')}</span></div>` : ''}<div><small>${before ? '修改后' : '投稿内容'}</small><span>${escapeHtml(newValue ?? '—')}</span></div></div>`;
    }).join('');
    const images = (item.images || []).map((url) => `<img src="${escapeHtml(url)}" alt="投稿图片" loading="lazy" />`).join('');
    const kindLabel = item.submission_kind === 'edit' ? '编辑公开活动' : '新增公开活动';
    return `<article class="community-review-card submission-review-card" data-review-card="submission">
      <div class="community-review-card-top"><span>${kindLabel} · ${escapeHtml(item.category || '活动')}</span><time>${escapeHtml(formatDate(item.created_at))}</time></div>
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.submitter_name || '社区用户')} · 人物：${(item.person_ids || []).map((id) => id === 'ayg' ? '阿云嘎' : '郑云龙').join('、')}</p>
      <div class="submission-diff">${diff}</div>
      ${(item.media_links || []).length ? `<div class="submission-review-links"><strong>新增/提交链接</strong>${item.media_links.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`).join('')}</div>` : ''}
      ${images ? `<div class="submission-review-images">${images}</div>` : ''}
      <textarea class="community-review-note" maxlength="2000" placeholder="审核备注（可选）"></textarea>
      <div class="community-review-actions"><button type="button" data-action="review-submission" data-review-id="${escapeHtml(item.id)}" data-decision="approved">通过并发布</button><button class="is-danger" type="button" data-action="review-submission" data-review-id="${escapeHtml(item.id)}" data-decision="rejected">拒绝</button></div>
    </article>`;
  }

  reportReviewMarkup(item) {
    const comment = Array.isArray(item.comment) ? item.comment[0] : item.comment;
    return `<article class="community-review-card" data-review-card="report"><div class="community-review-card-top"><span>REPORT · ${escapeHtml(item.reason)}</span><time>${escapeHtml(formatDate(item.created_at))}</time></div><h4>${escapeHtml(item.reporter_name || '社区用户')} 举报 ${escapeHtml(item.reported_user_name || '社区用户')}</h4>${comment?.content ? `<div class="community-review-description">被举报评论：${escapeHtml(comment.content)}</div>` : ''}${item.details ? `<p>${escapeHtml(item.details)}</p>` : ''}<textarea class="community-review-note" maxlength="2000" placeholder="处理备注（可选）"></textarea><div class="community-review-actions"><button type="button" data-action="review-report" data-review-id="${escapeHtml(item.id)}" data-decision="upheld">举报成立并永久封禁</button><button class="is-danger" type="button" data-action="review-report" data-review-id="${escapeHtml(item.id)}" data-decision="dismissed">驳回并恢复</button></div></article>`;
  }

  questionReviewMarkup(item) {
    const labels = { pending: '待一级审核', approved: '已进入备选题库', rejected: '未通过' };
    const reviewActions = item.status === 'pending' && this.client.can('review_questions')
      ? `<textarea class="community-review-note" maxlength="2000" placeholder="审核备注（可选）"></textarea><div class="community-review-actions"><button type="button" data-action="review-question" data-review-id="${escapeHtml(item.id)}" data-decision="approved">通过并入库</button><button class="is-danger" type="button" data-action="review-question" data-review-id="${escapeHtml(item.id)}" data-decision="rejected">拒绝</button></div>`
      : '';
    const managementActions = item.status === 'approved' && item.is_active && this.client.can('review_questions')
      ? `<textarea class="community-question-prompt" minlength="10" maxlength="500">${escapeHtml(item.prompt)}</textarea><div class="community-review-actions community-question-actions"><button type="button" data-action="edit-question" data-question-id="${escapeHtml(item.id)}">保存编辑</button><button class="is-danger" type="button" data-action="delete-question" data-question-id="${escapeHtml(item.id)}">删除问题</button></div>`
      : `<div class="community-review-description">${escapeHtml(item.prompt)}</div>`;
    return `<article class="community-review-card" data-review-card="question"><div class="community-review-card-top"><span>QUESTION</span><span>${escapeHtml(labels[item.status] || item.status)}</span></div>${managementActions}${reviewActions}</article>`;
  }

  userManagementMarkup(item) {
    const ownAccount = item.id === this.client.user?.id;
    return `<article class="community-review-card community-user-card" data-user-card><div class="community-review-card-top"><span>${item.email_confirmed_at ? 'EMAIL VERIFIED' : 'EMAIL PENDING'}</span><span>${escapeHtml(ACCOUNT_STATUS_LABELS[item.status] || item.status || '未知')}</span></div><h4>${escapeHtml(item.display_name || '新用户')}</h4><p>${escapeHtml(item.email || '邮箱信息不可用')}</p><div class="community-role-control"><select data-management-select ${ownAccount || item.management_level === 1 ? 'disabled' : ''}><option value="" ${item.management_level == null ? 'selected' : ''}>普通用户</option><option value="2" ${item.management_level === 2 ? 'selected' : ''}>二级管理员</option><option value="3" ${item.management_level === 3 ? 'selected' : ''}>三级管理员</option><option value="1" ${item.management_level === 1 ? 'selected' : ''} disabled>一级管理员</option></select>${ownAccount || item.management_level === 1 ? '<span>一级管理员账号受保护</span>' : `<button type="button" data-action="save-management-level" data-user-id="${escapeHtml(item.id)}">保存权限</button>`}</div></article>`;
  }

  async handleAdminReview(button, kind) {
    if (!button || !this.client.isAdmin()) return;
    const card = button.closest('[data-review-card]');
    const note = card?.querySelector('.community-review-note')?.value.trim() || '';
    const decision = button.dataset.decision;
    const id = button.dataset.reviewId;
    if (!id || !decision) return;
    card?.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    try {
      if (kind === 'account') await this.client.reviewAccountApplication(id, decision, note);
      if (kind === 'submission') await this.client.reviewSubmission(id, decision, note);
      if (kind === 'report') await this.client.reviewReport(id, decision, note);
      if (kind === 'question') await this.client.reviewQuestion(id, decision, note);
      const successMessages = { account: '账号审核已完成', submission: '投稿审核已完成', report: '举报处理已完成', question: '问题审核已完成' };
      this.toast(successMessages[kind] || '操作已完成');
      await this.renderAdmin();
    } catch (error) {
      card?.querySelectorAll('button').forEach((item) => { item.disabled = false; });
      this.toast(error.message, true);
    }
  }

  async handleManagementLevel(button) {
    if (!button || !this.client.can('manage_roles')) return;
    const card = button.closest('[data-user-card]');
    const raw = card?.querySelector('[data-management-select]')?.value ?? '';
    const level = raw ? Number(raw) : null;
    button.disabled = true;
    try {
      await this.client.setManagementLevel(button.dataset.userId, level);
      this.toast(level ? `已设置为${level}级管理员` : '已恢复为普通用户');
      await this.renderAdmin();
    } catch (error) {
      button.disabled = false;
      this.toast(error.message, true);
    }
  }

  async handleQuestionEdit(button) {
    if (!button || !this.client.can('review_questions')) return;
    const card = button.closest('[data-review-card="question"]');
    const prompt = card?.querySelector('.community-question-prompt')?.value.trim() || '';
    if ([...prompt].length < 10) return this.toast('审核问题至少需要 10 字', true);
    card?.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    try {
      await this.client.editReviewQuestion(button.dataset.questionId, prompt);
      this.toast('审核问题已更新');
      await this.renderAdmin();
    } catch (error) {
      card?.querySelectorAll('button').forEach((item) => { item.disabled = false; });
      this.toast(error.message, true);
    }
  }

  async handleQuestionDelete(button) {
    if (!button || !this.client.can('review_questions')) return;
    if (!window.confirm('确定删除这道审核问题吗？历史申请中的问题快照会保留。')) return;
    const card = button.closest('[data-review-card="question"]');
    card?.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    try {
      await this.client.deleteReviewQuestion(button.dataset.questionId);
      this.toast('审核问题已删除');
      await this.renderAdmin();
    } catch (error) {
      card?.querySelectorAll('button').forEach((item) => { item.disabled = false; });
      this.toast(error.message, true);
    }
  }

  async submitReviewQuestion(form) {
    const prompt = String(new FormData(form).get('prompt') || '').trim();
    if ([...prompt].length < 10) return this.toast('审核问题至少需要 10 字', true);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await this.client.submitReviewQuestion(prompt);
      this.toast(this.client.managementLevel() === 1 ? '问题已加入备选题库' : '问题已提交一级管理员审核');
      await this.renderAdmin();
    } catch (error) {
      button.disabled = false;
      this.toast(error.message, true);
    }
  }

  async reportComment(commentId) {
    const comment = this.comments.find((item) => item.id === commentId);
    if (!comment) return;
    try {
      const result = await this.client.reportComment(comment, '快捷举报');
      this.toast(result.automatic_action ? '管理员举报已生效：评论删除、账号永久封禁' : '举报成功：评论已隐藏、账号已冻结');
      await this.renderDiscussion();
    } catch (error) {
      if (this.client.user && this.client.isApproved()) this.toast(error.message, true);
      else this.requireAccount(error.message);
    }
  }

  async reportUser(userId) {
    if (!userId || userId === this.client.user?.id) return;
    try {
      const result = await this.client.reportUser(userId, '头像快捷举报');
      this.toast(result.automatic_action ? '管理员举报已生效：账号永久封禁' : '举报成功：该账号已进入冻结状态');
    } catch (error) {
      if (this.client.user && this.client.isApproved()) this.toast(error.message, true);
      else this.requireAccount(error.message);
    }
  }

  async ensureTurnstile() {
    if (window.turnstile) return;
    if (!this.turnstileLoadPromise) {
      this.turnstileLoadPromise = new Promise((resolve, reject) => {
        let script = document.querySelector('script[data-community-turnstile]');
        if (!script) {
          script = document.createElement('script');
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          script.async = true;
          script.defer = true;
          script.dataset.communityTurnstile = 'true';
          document.head.append(script);
        }
        const startedAt = Date.now();
        const timer = window.setInterval(() => {
          if (window.turnstile) {
            window.clearInterval(timer);
            resolve();
          } else if (Date.now() - startedAt > 15_000) {
            window.clearInterval(timer);
            reject(new Error('Turnstile load timeout'));
          }
        }, 100);
        script.addEventListener('error', () => {
          window.clearInterval(timer);
          reject(new Error('Turnstile script failed'));
        }, { once: true });
      }).catch((error) => {
        this.turnstileLoadPromise = null;
        throw error;
      });
    }
    await this.turnstileLoadPromise;
  }

  async renderTurnstile({ containerId = 'communityTurnstile', tokenInputName = 'turnstile_token', action = 'community_action' } = {}) {
    try {
      await this.ensureTurnstile();
      const container = this.content.querySelector(`#${containerId}`);
      const tokenInput = this.content.querySelector(`input[name="${tokenInputName}"]`);
      if (!container || !tokenInput) return;
      container.textContent = '';
      const previousWidget = this.turnstileWidgetIds.get(containerId);
      if (previousWidget) {
        try { window.turnstile.remove(previousWidget.id); } catch { /* the previous form was already removed */ }
        this.turnstileWidgetIds.delete(containerId);
      }
      const widgetId = window.turnstile.render(container, {
        sitekey: this.client.config.turnstileSiteKey,
        theme: 'dark',
        action,
        retry: 'auto',
        callback: (token) => { tokenInput.value = token; },
        'expired-callback': () => { tokenInput.value = ''; },
        'error-callback': (code) => {
          tokenInput.value = '';
          container.textContent = code === '110200'
            ? '当前域名未授权安全验证，请在正式域名打开'
            : '安全验证暂时不可用，请刷新后重试';
          return true;
        },
      });
      this.turnstileWidgetIds.set(containerId, { id: widgetId, element: container });
    } catch {
      const container = this.content.querySelector(`#${containerId}`);
      if (container) container.textContent = '安全验证加载失败，请刷新后重试';
    }
  }

  resetTurnstile(containerId = 'communityAuthTurnstile') {
    const widget = this.turnstileWidgetIds.get(containerId);
    if (widget?.element?.isConnected && window.turnstile) {
      try { window.turnstile.reset(widget.id); } catch { /* the form may have been replaced */ }
    }
    const tokenInput = this.content.querySelector('input[name="captchaToken"]');
    if (tokenInput) tokenInput.value = '';
  }

  async loadSignupQuestion() {
    if (this.signupQuestionLoading) return;
    this.signupQuestionLoading = true;
    this.signupQuestionError = '';
    try {
      this.signupQuestion = await this.client.getReviewQuestion();
    } catch (error) {
      this.signupQuestionError = error.message;
    } finally {
      this.signupQuestionLoading = false;
      if (this.activeTab === 'account' && this.authView === 'signup' && !this.root.hidden) this.renderAccount();
    }
  }

  renderAccount() {
    if (this.authView === 'reset-password' && this.client.user) {
      this.content.innerHTML = `<section class="community-confirmation"><span class="community-mail-icon">🔒</span><span class="community-auth-eyebrow">PASSWORD RECOVERY</span><h3>设置新密码</h3><p>身份验证已经完成。请输入新的登录密码。</p><form class="community-form community-auth-form" data-form="new-password"><label><span>新密码</span><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="至少 8 位" /></label><label><span>确认新密码</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="再次输入新密码" /></label><button class="community-auth-submit" type="submit">保存新密码 <span>→</span></button></form></section>`;
      return;
    }
    if (this.client.user) {
      const name = this.client.user.display_name || this.client.user.user_metadata?.display_name || this.client.user.email?.split('@')[0] || '社区用户';
      const accountStatus = this.client.access.status;
      const avatarUrl = this.client.avatarUrl(this.client.user.avatar_key);
      const statusLabel = this.client.isDemo() ? '演示账号' : ACCOUNT_STATUS_LABELS[accountStatus] || '状态未知';
      const reviewMessage = this.client.isApproved()
        ? '账号已解锁评论和投稿功能。'
        : accountStatus === 'pending'
          ? '邮箱已确认，管理员审核通过后将解锁评论和投稿。'
          : accountStatus === 'rejected'
            ? '账号申请未通过，如有疑问请联系管理员。'
            : '账号当前不可参与评论和投稿。';
      this.content.innerHTML = `
        <section class="community-profile-hero">
          <div class="community-profile-avatar">${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}的头像" />` : escapeHtml(initials(name))}</div>
          <div><span>${this.client.isAdmin() ? 'COMMUNITY ADMIN' : 'COMMUNITY MEMBER'}</span><h3>${this.client.access.user_group === 'yunv' ? '<img class="community-group-icon" src="/assets/icons/yunv-cloud-star.svg" alt="" />' : this.client.access.user_group === 'cloud' ? '☁ ' : '⭐ '}${escapeHtml(name)}</h3><p>${escapeHtml(this.client.user.email || '')}</p><small>${this.client.access.user_group === 'yunv' ? '云女 · 三站权限' : this.client.access.user_group === 'cloud' ? '云朵 · 阿云嘎个人站' : '小星星 · 郑云龙个人站'}</small></div>
        </section>
        <div class="community-account-status is-${escapeHtml(accountStatus)}"><span>${escapeHtml(statusLabel)}</span><p>${escapeHtml(reviewMessage)}</p></div>
        <div class="community-profile-stats"><div><strong>${readableCount(this.client.isDemo() ? 3 : 0)}</strong><span>收藏活动</span></div><div><strong>${readableCount(this.client.isDemo() ? 6 : 0)}</strong><span>参与讨论</span></div><div><strong>${readableCount(this.client.isDemo() ? 1 : 0)}</strong><span>活动投稿</span></div></div>
        <div class="community-account-note"><span>◉</span><p><strong>一个账号，三个网站</strong><br />个人资料、活动收藏和投稿记录由统一后端共享。</p></div>
        <a class="community-primary-button community-profile-link" href="/profile/">打开完整个人主页 <span>→</span></a>
        ${this.client.isAdmin() ? '<button class="community-primary-button community-open-admin" type="button" data-tab="admin">打开审核工作台</button>' : ''}
        <button class="community-secondary-button" type="button" data-action="signout">退出登录</button>`;
      return;
    }
    if (this.authView === 'confirm-sent') {
      const remaining = Math.max(0, Math.ceil((this.resendAvailableAt - Date.now()) / 1000));
      this.content.innerHTML = `
        <section class="community-confirmation">
          <span class="community-mail-icon">✉</span>
          <span class="community-auth-eyebrow">CHECK YOUR INBOX</span>
          <h3>确认邮件已发送</h3>
          <p>我们已向 <strong>${escapeHtml(maskEmail(this.pendingEmail))}</strong> 发送账号确认邮件。确认邮箱后，账号会进入管理员审核队列。</p>
          <ol><li>检查收件箱和垃圾邮件目录</li><li>点击“确认邮箱并加入社区”</li><li>等待管理员审核后解锁评论和投稿</li></ol>
          <button class="community-primary-button" type="button" data-action="resend-confirmation" ${remaining ? 'disabled' : ''}>${remaining ? `${remaining} 秒后可重新发送` : '重新发送确认邮件'}</button>
          <button class="community-text-button" type="button" data-auth-view="signup">邮箱写错了？返回修改</button>
          <button class="community-text-button" type="button" data-auth-view="signin">已经确认？返回登录</button>
          <button class="community-guest-button" type="button" data-action="continue-as-guest">暂不注册，游客访问</button>
        </section>`;
      return;
    }
    if (this.authView === 'forgot-password') {
      this.content.innerHTML = `<section class="community-confirmation"><span class="community-mail-icon">✉</span><span class="community-auth-eyebrow">PASSWORD RECOVERY</span><h3>找回密码</h3><p>输入注册邮箱，我们会发送密码重置邮件。</p><form class="community-form community-auth-form" data-form="password-reset-request"><label><span>注册邮箱</span><input name="email" type="email" autocomplete="email" required placeholder="name@example.com" /></label>${this.client.isDemo() ? '' : '<div id="communityAuthTurnstile" class="community-turnstile community-auth-turnstile">正在加载安全验证…</div><input type="hidden" name="captchaToken" />'}<button class="community-auth-submit" type="submit">发送重置邮件 <span>→</span></button></form><button class="community-text-button" type="button" data-auth-view="signin">返回登录</button></section>`;
      if (!this.client.isDemo()) this.renderTurnstile({ containerId: 'communityAuthTurnstile', tokenInputName: 'captchaToken', action: 'password_recovery' });
      return;
    }

    const isSignup = this.authView === 'signup';
    const questionMarkup = !isSignup ? '' : this.signupQuestion
      ? `<div class="community-review-question"><span>${this.signupQuestion.fallback ? '默认审核问题' : '随机审核问题'}</span><strong>${escapeHtml(this.signupQuestion.prompt)}</strong>${this.signupQuestion.fallback ? '<p class="community-question-fallback-note">随机问题加载异常，已自动使用默认问题，不影响注册。</p>' : ''}<input type="hidden" name="reviewQuestionId" value="${escapeHtml(this.signupQuestion.id)}" /><label><span>注册理由与回答</span><textarea name="reviewAnswer" minlength="200" maxlength="5000" rows="8" required placeholder="请认真回答问题并说明申请加入社区的理由，不少于 200 字"></textarea><small data-answer-count>0 / 200 字</small></label></div>`
      : this.signupQuestionError
        ? `<div class="community-question-error"><p>${escapeHtml(this.signupQuestionError)}</p><button type="button" data-action="reload-review-question">重新获取问题</button></div>`
        : '<div class="community-question-loading">正在随机抽取审核问题…</div>';
    this.content.innerHTML = `
      <div class="community-auth-hero">
        <span class="community-page-icon">${isSignup ? '＋' : '人'}</span>
        <span class="community-auth-eyebrow">ONE ACCOUNT · THREE SITES</span>
        <h3>${isSignup ? '创建社区账号' : '继续你的剧场地图'}</h3>
        <p>${isSignup ? '确认邮箱并通过管理员审核后，即可参与评论和投稿。' : '登录后查看账号审核状态，并继续你留下的舞台足迹。'}</p>
      </div>
      <div class="community-auth-switch" role="tablist" aria-label="账号入口">
        <button type="button" role="tab" data-auth-view="signin" aria-selected="${!isSignup}" class="${!isSignup ? 'is-active' : ''}">登录</button>
        <button type="button" role="tab" data-auth-view="signup" aria-selected="${isSignup}" class="${isSignup ? 'is-active' : ''}">注册</button>
      </div>
      <form class="community-form community-auth-form" data-form="auth">
        ${isSignup ? '<label><span>社区昵称</span><input name="displayName" autocomplete="nickname" maxlength="80" required placeholder="大家将看到这个名字" /></label>' : ''}
        <label><span>邮箱</span><input name="email" type="email" autocomplete="email" required placeholder="name@example.com" /></label>
        <label><span>密码</span><input name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" minlength="8" required placeholder="至少 8 位" /></label>
        ${isSignup ? `<label><span>确认密码</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="再次输入密码" /></label>${questionMarkup}<label class="community-terms"><input name="terms" type="checkbox" required /><span>我已阅读并同意社区公约与隐私说明</span></label>` : ''}
        ${this.client.isDemo() ? '<p class="community-demo-note">演示模式不会发送真实账号、密码或邮件。</p>' : '<div id="communityAuthTurnstile" class="community-turnstile community-auth-turnstile">正在加载安全验证…</div><input type="hidden" name="captchaToken" />'}
        <button class="community-auth-submit" type="submit" value="${isSignup ? 'signup' : 'signin'}">${this.client.isDemo() && !isSignup ? '进入演示账号' : isSignup ? '注册并发送确认邮件' : '登录社区'} <span>→</span></button>
        <p class="community-auth-footnote">${isSignup ? '确认邮件可能需要几分钟；确认后还需等待管理员审核。' : '邮箱确认后可以登录，评论和投稿需管理员审核通过。'}</p>
      </form>
      ${isSignup ? '' : '<button class="community-text-button" type="button" data-auth-view="forgot-password">忘记密码？通过邮件重置</button>'}
      <button class="community-guest-button" type="button" data-action="continue-as-guest">暂不注册，游客访问</button>`;
    if (!this.client.isDemo()) {
      this.renderTurnstile({
        containerId: 'communityAuthTurnstile',
        tokenInputName: 'captchaToken',
        action: isSignup ? 'auth_signup' : 'auth_signin',
      });
    }
    if (isSignup && !this.signupQuestion && !this.signupQuestionError) this.loadSignupQuestion();
  }

  accountRequiredMarkup(message) {
    return `<div class="community-empty community-account-required"><span>人</span><h3>需要先登录</h3><p>${escapeHtml(message)}</p><button type="button" data-tab="account">打开登录</button></div>`;
  }

  reviewRequiredMarkup(message) {
    return `<div class="community-empty community-review-required"><span>⌛</span><h3>账号正在审核</h3><p>${escapeHtml(message)}</p><button type="button" data-tab="account">查看账号状态</button></div>`;
  }

  async submitComment(form) {
    const input = form.querySelector('textarea[name="content"]');
    const content = input.value.trim();
    const parentId = String(new FormData(form).get('parentId') || '') || null;
    if (!content) return;
    try {
      await this.client.addComment(this.currentEvent, content, parentId);
      input.value = '';
      this.replyTarget = null;
      this.toast(parentId ? '回复已发布' : '评论已发布');
      await this.renderDiscussion();
    } catch (error) {
      this.requireAccount(error.message);
    }
  }

  async submitCommentEdit(form) {
    const card = form.closest('[data-comment-id]');
    const comment = this.comments.find((item) => item.id === card?.dataset.commentId);
    const content = form.querySelector('textarea[name="content"]')?.value.trim() || '';
    if (!comment || !content) return;
    try {
      await this.client.updateComment(comment, content);
      this.editingCommentId = null;
      this.toast('评论已更新');
      await this.renderDiscussion();
    } catch (error) {
      this.requireAccount(error.message);
    }
  }

  async deleteComment(commentId) {
    const comment = this.comments.find((item) => item.id === commentId);
    if (!comment || comment.user_id !== this.client.user?.id) return;
    if (!window.confirm('确定删除这条评论吗？已有回复会保留。')) return;
    try {
      await this.client.deleteComment(comment);
      this.editingCommentId = null;
      this.toast('评论已删除');
      await this.renderDiscussion();
    } catch (error) {
      this.requireAccount(error.message);
    }
  }

  async submitAuth(form, action) {
    const fields = Object.fromEntries(new FormData(form));
    fields.email = String(fields.email || '').trim().toLowerCase();
    const button = form.querySelector('button[type="submit"]');
    if (action === 'signup' && fields.password !== fields.confirmPassword) {
      this.toast('两次输入的密码不一致', true);
      return;
    }
    if (action === 'signup') {
      if (!fields.reviewQuestionId || !fields.reviewAnswer) {
        this.toast('请先获取并回答注册审核问题', true);
        return;
      }
      if ([...String(fields.reviewAnswer).trim()].length < 200) {
        this.toast('注册理由和问题回答不能少于 200 字', true);
        return;
      }
    }
    if (!this.client.isDemo() && !fields.captchaToken) {
      this.toast('请先完成安全验证', true);
      return;
    }
    const originalButton = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.textContent = action === 'signup' ? '正在创建账号…' : '正在登录…';
    }
    try {
      if (action === 'signup') {
        const result = await this.client.signUp(fields);
        if (result.confirmationRequired) {
          this.pendingEmail = fields.email;
          this.authView = 'confirm-sent';
          this.onStateChange(null);
          this.renderAccount();
          this.toast('确认邮件已发送，请前往邮箱完成激活');
          return;
        }
        this.onStateChange(result.user);
        this.updateAdminNavigation();
        sessionStorage.removeItem(GUEST_SESSION_KEY);
        this.toast('注册成功，账号已经登录');
      } else {
        const user = await this.client.signIn(fields);
        this.updateAdminNavigation();
        this.onStateChange(user);
        sessionStorage.removeItem(GUEST_SESSION_KEY);
        this.toast(this.client.isDemo() ? '演示账号已启用' : '登录成功');
      }
      window.location.href = '/profile/';
    } catch (error) {
      if (error.code === 'email_not_confirmed') {
        this.pendingEmail = fields.email;
        this.authView = 'confirm-sent';
        this.renderAccount();
      } else {
        this.resetTurnstile();
      }
      this.toast(error.message, true);
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.innerHTML = originalButton;
      }
    }
  }

  async submitPasswordResetRequest(form) {
    const fields = Object.fromEntries(new FormData(form));
    if (!this.client.isDemo() && !fields.captchaToken) return this.toast('请先完成安全验证', true);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await this.client.sendPasswordReset(fields.email, fields.captchaToken);
      this.toast('密码重置邮件已发送，请检查收件箱');
      this.authView = 'signin';
      this.renderAccount();
    } catch (error) {
      button.disabled = false;
      this.resetTurnstile();
      this.toast(error.message, true);
    }
  }

  async submitNewPassword(form) {
    const fields = Object.fromEntries(new FormData(form));
    if (fields.password !== fields.confirmPassword) return this.toast('两次输入的新密码不一致', true);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await this.client.updatePassword(fields.password);
      this.authView = 'signin';
      this.toast('密码已更新');
      window.location.href = '/profile/?password=updated';
    } catch (error) {
      button.disabled = false;
      this.toast(error.message, true);
    }
  }

  async resendConfirmation() {
    if (!this.pendingEmail || Date.now() < this.resendAvailableAt) return;
    try {
      await this.client.resendSignUpConfirmation(this.pendingEmail);
      this.resendAvailableAt = Date.now() + 60_000;
      this.renderAccount();
      this.toast('确认邮件已重新发送');
      window.setTimeout(() => {
        if (this.activeTab === 'account' && this.authView === 'confirm-sent' && !this.root.hidden) this.renderAccount();
      }, 60_500);
    } catch (error) {
      this.toast(error.message, true);
    }
  }

  async submitEvent(form) {
    return this.submitAdvancedEvent(form);
    /* legacy form handler retained below for backwards-compatible markup */
    const data = new FormData(form);
    const date = data.get('date');
    const input = {
      proposed_sites: data.getAll('proposed_sites'),
      title: data.get('title'),
      category: data.get('category'),
      start_time: `${date}T12:00:00+08:00`,
      venue: data.get('venue') || null,
      city: data.get('city') || null,
      country: '中国',
      description: data.get('description') || '',
      source_url: data.get('source_url'),
      payload_json: {},
      turnstile_token: this.client.isDemo() ? 'demo-token' : data.get('turnstile_token') || '',
    };
    if (!input.proposed_sites.length) {
      this.toast('请至少选择一个展示网站', true);
      return;
    }
    if (!input.turnstile_token) {
      this.toast('请先完成安全验证', true);
      return;
    }
    try {
      await this.client.submitEvent(input);
      form.reset();
      form.querySelector('input[value="duo"]').checked = true;
      this.toast('投稿已进入管理员审核队列');
    } catch (error) {
      this.toast(error.message, true);
    }
  }

  async submitAdvancedEvent(form) {
    const data = new FormData(form);
    const date = data.get('date');
    const time = data.get('time') || '12:00';
    const scope = data.get('submission_scope') || 'private';
    const kind = scope === 'public' ? data.get('submission_kind') || 'create' : 'create';
    const links = String(data.get('media_links') || '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const personIds = data.getAll('person_ids');
    if (scope === 'public' && !personIds.length) {
      this.toast('公开投稿请至少选择一位人物', true);
      return;
    }
    const input = {
      submission_scope: scope,
      submission_kind: kind,
      target_event_id: kind === 'edit' ? data.get('target_event_id') || null : null,
      person_ids: scope === 'public' ? personIds : [],
      proposed_sites: ['duo'],
      title: data.get('title'),
      category: data.get('category'),
      start_time: new Date(`${date}T${time}:00`).toISOString(),
      end_time: data.get('end_time') ? new Date(String(data.get('end_time'))).toISOString() : null,
      venue: data.get('venue') || null,
      city: data.get('city') || null,
      country: data.get('country') || null,
      latitude: data.get('latitude') === '' ? null : Number(data.get('latitude')),
      longitude: data.get('longitude') === '' ? null : Number(data.get('longitude')),
      description: data.get('description') || '',
      source_url: links[0] || null,
      media_links: links,
      payload_json: {},
      turnstile_token: this.client.isDemo() ? 'demo-token' : data.get('turnstile_token') || '',
    };
    if (kind === 'edit' && !input.target_event_id) {
      this.toast('请选择要编辑的公开活动', true);
      return;
    }
    if (!input.turnstile_token) {
      this.toast('请先完成安全验证', true);
      return;
    }
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      const submission = await this.client.submitEvent(input);
      const images = [...(form.elements.images?.files || [])];
      let imageWarning = '';
      if (images.length) {
        submitButton.querySelector('[data-submission-button-label]').textContent = `正在上传 ${images.length} 张图片…`;
        try {
          await this.client.uploadSubmissionImages(submission.id, images);
        } catch (uploadError) {
          imageWarning = `；活动已保存，但图片上传失败：${uploadError.message}`;
        }
      }
      this.toast(scope === 'private' ? `私人活动已加入个人地球${imageWarning}` : `公开投稿已进入管理员审核队列${imageWarning}`, Boolean(imageWarning));
      await this.renderAdvancedSubmission();
    } catch (error) {
      this.toast(error.message, true);
      submitButton.disabled = false;
    }
  }

  async toggleFavoriteCurrent() {
    if (!this.currentEvent) return false;
    try {
      const saved = await this.client.toggleFavorite(this.currentEvent);
      this.onFavoriteChange(this.currentEvent, saved);
      this.toast(saved ? '已加入跨站收藏' : '已取消收藏');
      if (this.activeTab === 'discussion') await this.renderDiscussion();
      return saved;
    } catch (error) {
      this.requireAccount(error.message);
      return false;
    }
  }

  async toggleCurrentEventMark(markType) {
    if (!this.currentEvent || !markType) return;
    if (!this.client.user) {
      this.requireAccount('登录后可以标记看过、推荐或收藏活动');
      return;
    }
    try {
      const states = await this.client.getEventMarks([this.currentEvent]);
      const key = String(this.currentEvent.communityId || this.currentEvent.id);
      const current = Boolean(states.get(key)?.[markType]);
      const active = await this.client.toggleEventMark(this.currentEvent, markType, current);
      if (markType === 'favorite') this.onFavoriteChange(this.currentEvent, active);
      this.onEventMarkChange(this.currentEvent, markType, active);
      this.toast(active ? ({ watched: '已标记为看过', recommended: '已推荐这场活动', favorite: '已加入跨站收藏' })[markType] : ({ watched: '已取消看过', recommended: '已取消推荐', favorite: '已取消收藏' })[markType]);
      await this.renderDiscussion();
    } catch (error) {
      this.requireAccount(error.message);
    }
  }

  requireAccount(message) {
    if (this.client.user) {
      window.location.href = '/profile/';
      return;
    }
    this.activeTab = 'account';
    this.render();
    this.toast(message || '请先登录', true);
  }

  toast(message, isError = false) {
    this.toastElement.textContent = message;
    this.toastElement.classList.toggle('is-error', isError);
    this.toastElement.classList.add('is-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastElement.classList.remove('is-visible'), 2600);
  }
}

function readableCount(value) {
  return new Intl.NumberFormat('zh-CN').format(value);
}
