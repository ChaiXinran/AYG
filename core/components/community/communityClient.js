import { COMMUNITY_CONFIG, isLiveCommunityConfigured } from '../../config/community.js';

const STORAGE_PREFIX = 'musical-community-demo-v1';
const USER_KEY = `${STORAGE_PREFIX}:user`;
const COMMENTS_KEY = `${STORAGE_PREFIX}:comments`;
const FAVORITES_KEY = `${STORAGE_PREFIX}:favorites`;
const LIKES_KEY = `${STORAGE_PREFIX}:likes`;
const EVENT_MARKS_KEY = `${STORAGE_PREFIX}:event-marks`;
const EVENT_LIKES_KEY = `${STORAGE_PREFIX}:event-likes`;
const SUBMISSIONS_KEY = `${STORAGE_PREFIX}:submissions`;
const DISCUSSION_POSTS_KEY = `${STORAGE_PREFIX}:discussion-posts`;

const SEED_COMMENTS = [
  {
    id: 'seed-comment-1',
    user_id: 'seed-mia',
    display_name: 'Mia',
    content: '从地图点进活动再进入讨论，这个路径很自然。也期待以后能看到大家分享的现场记忆。',
    created_at: '2026-08-11T08:20:00.000Z',
    like_count: 18,
  },
  {
    id: 'seed-comment-2',
    user_id: 'seed-orbit',
    display_name: 'Orbit',
    content: '收藏是跨站共享的，所以在个人站收藏后，回到双人站仍然可以找到这场活动。',
    created_at: '2026-08-11T09:05:00.000Z',
    like_count: 9,
  },
];

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')), { once: true });
    reader.addEventListener('error', () => reject(new Error('无法读取图片')), { once: true });
    reader.readAsDataURL(file);
  });
}

function demoEventKey(event) {
  return String(event?.communityId || event?.id || 'preview-event');
}

const DEFAULT_REVIEW_QUESTION = Object.freeze({
  id: '00000000-0000-4000-8000-000000000017',
  prompt: '你为什么喜欢龙龙和嘎嘎呢？',
  fallback: true,
});

function livePersonId(value) {
  return ({ ayg: 'ayanga', zyl: 'zhengyunlong' })[value] || value || '';
}

function authError(error) {
  const message = String(error?.message || '账号操作失败，请稍后重试');
  const code = error?.code || '';
  const translations = [
    [/invalid login credentials/i, '邮箱或密码不正确'],
    [/email not confirmed/i, '邮箱尚未确认，请先打开确认邮件'],
    [/user already registered/i, '该邮箱已经注册，请直接登录'],
    [/password should be at least/i, '密码长度至少为 8 位'],
    [/email rate limit exceeded|rate limit/i, '邮件发送过于频繁，请稍后再试'],
    [/error sending confirmation email|failed to send.*email|smtp/i, '确认邮件发送失败，请稍后重试；若持续失败，请检查 Supabase 的 SMTP 配置'],
    [/signup.*disabled/i, '当前暂未开放新用户注册'],
    [/unable to validate email|invalid.*email/i, '请输入有效的邮箱地址'],
    [/captcha/i, '安全验证未通过，请重新验证'],
    [/email link.*invalid|otp.*expired|token.*expired/i, '确认链接无效或已经过期，请重新发送确认邮件'],
    [/failed to fetch|network|load failed/i, '网络连接失败，请检查网络后重试'],
  ];
  const translated = translations.find(([pattern]) => pattern.test(message))?.[1] || message;
  const normalized = new Error(translated);
  normalized.code = code || (/email not confirmed/i.test(message) ? 'email_not_confirmed' : '');
  return normalized;
}

function readAuthCallback() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const errorDescription = hash.get('error_description') || query.get('error_description');
  const type = hash.get('type') || query.get('type') || '';
  const hasAuthPayload = Boolean(
    hash.get('access_token')
    || hash.get('refresh_token')
    || query.get('code')
    || errorDescription,
  );
  const recovery = type === 'recovery' || query.get('auth') === 'recovery';
  return { hasAuthPayload, type, errorDescription, recovery };
}

function decodeAuthMessage(message) {
  try {
    return decodeURIComponent(String(message).replaceAll('+', ' '));
  } catch {
    return String(message);
  }
}

function normalizeLiveEvent(event) {
  const metadata = event.metadata || {};
  const people = Array.isArray(event.people) ? event.people : [];
  const sitePeople = (Array.isArray(event.sites) ? event.sites : [])
    .map((site) => livePersonId(site.site_id))
    .filter((id) => ['ayanga', 'zhengyunlong'].includes(id));
  const personIds = [...new Set([
    ...people.map((person) => livePersonId(person.person_id)),
    ...(Array.isArray(metadata.artists) ? metadata.artists.map(livePersonId) : []),
    ...sitePeople,
  ].filter(Boolean))];
  const personNames = personIds.map((id) => ({ ayanga: '阿云嘎', zhengyunlong: '郑云龙' })[id] || id);
  const roles = people.map((person) => person.role).filter(Boolean);
  const metadataRoles = personIds.map((id) => metadata.roles?.[id === 'ayanga' ? 'ayg' : id === 'zhengyunlong' ? 'zyl' : id]).filter(Boolean);
  const dates = (Array.isArray(metadata.sessions) ? metadata.sessions : [])
    .flatMap((entry) => Array.isArray(entry.sessions) ? entry.sessions : [])
    .filter((entry) => entry?.date);
  return {
    id: `community:${event.id}`,
    title: event.title,
    category: event.category,
    date: event.start_time?.slice(0, 10) || '',
    startTime: event.start_time || '',
    endDate: event.end_time?.slice(0, 10) || '',
    dateLabel: metadata.date_labels?.join('；') || (event.start_time ? new Date(event.start_time).toLocaleDateString('zh-CN') : ''),
    dates,
    city: event.city || '',
    country: event.country || '',
    venue: event.venue?.name || '',
    lon: event.longitude == null ? null : Number(event.longitude),
    lat: event.latitude == null ? null : Number(event.latitude),
    description: event.description || '',
    sourceUrls: [...new Set([event.source_url, ...(metadata.source_urls || [])].filter(Boolean))],
    mediaUrls: [...new Set([...(Array.isArray(event.images) ? event.images : []), ...(Array.isArray(metadata.media_urls) ? metadata.media_urls : [])])],
    contributors: Array.isArray(event.contributors) ? event.contributors : [],
    legacyIds: Array.isArray(metadata.legacy_ids) ? metadata.legacy_ids.map(String) : [],
    tourBatch: metadata.tour_batches?.filter(Boolean).join('、') || '',
    tourSummary: metadata.tour_summaries?.filter(Boolean).join('\n') || '',
    personIds,
    personId: personIds[0] || '',
    personName: personNames.join('、') || '人物待确认',
    role: [...new Set([...roles, ...metadataRoles])].join('、'),
    communityId: event.id,
  };
}

export class CommunityClient {
  constructor(config = COMMUNITY_CONFIG) {
    this.config = config;
    this.mode = isLiveCommunityConfigured(config) ? 'live' : 'demo';
    this.supabase = null;
    this.user = null;
    this.authCallbackResult = null;
    this.access = this.emptyAccess();
    this.initialized = false;
  }

  emptyAccess() {
    return { status: 'anonymous', roles: [], management_level: null, application: null, moderation: null, capabilities: { comment: false, submit: false, admin: false, review_submissions: false, handle_reports: false, review_accounts: false, submit_questions: false, review_questions: false, manage_roles: false } };
  }

  demoAccess() {
    return { status: 'active', roles: ['user'], management_level: null, application: null, moderation: null, capabilities: { comment: true, submit: true, admin: false, review_submissions: false, handle_reports: false, review_accounts: false, submit_questions: false, review_questions: false, manage_roles: false } };
  }

  async init() {
    if (this.initialized) return this.user;
    if (this.mode === 'demo') {
      this.user = readStorage(USER_KEY, null);
      this.access = this.user ? this.demoAccess() : this.emptyAccess();
      this.initialized = true;
      return this.user;
    }

    const callback = readAuthCallback();
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.56.0');
    this.supabase = createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
      auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
    const { data } = await this.supabase.auth.getSession();
    this.user = data.session?.user || null;
    if (this.user) await this.refreshAccess();
    if (callback.hasAuthPayload) {
      if (callback.errorDescription) {
        const callbackError = authError({ message: decodeAuthMessage(callback.errorDescription) });
        this.authCallbackResult = { status: 'error', message: callbackError.message };
      } else if (this.user && callback.recovery) {
        this.authCallbackResult = { status: 'recovery', message: '身份验证成功，请设置新密码' };
      } else if (this.user && (!callback.type || ['signup', 'email'].includes(callback.type))) {
        this.authCallbackResult = { status: 'confirmed', message: '邮箱确认成功，账号已提交管理员审核' };
      }
      this.cleanAuthCallbackUrl();
    }
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.user = session?.user || null;
      if (!this.user) this.access = this.emptyAccess();
    });
    this.initialized = true;
    return this.user;
  }

  isDemo() {
    return this.mode === 'demo';
  }

  authRedirectUrl() {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('community', 'account');
    url.hash = '';
    return url.toString();
  }

  cleanAuthCallbackUrl() {
    const url = new URL(window.location.href);
    for (const key of ['code', 'error', 'error_code', 'error_description', 'type', 'auth']) url.searchParams.delete(key);
    url.hash = '';
    window.history.replaceState({}, document.title, url);
  }

  getAuthCallbackResult() {
    return this.authCallbackResult;
  }

  async refreshAccess() {
    if (!this.user) {
      this.access = this.emptyAccess();
      return this.access;
    }
    if (this.mode === 'demo') {
      this.access = this.demoAccess();
      return this.access;
    }
    const account = await this.authenticatedRequest('/v1/me');
    if (!(account.site_access || []).includes(this.config.siteId || 'duo')) {
      await this.supabase.auth.signOut();
      this.user = null;
      this.access = this.emptyAccess();
      throw new Error('当前账号没有双人网站的社区权限，请前往注册来源网站登录');
    }
    this.access = {
      status: account.profile.status,
      roles: account.roles || [],
      management_level: account.management_level ?? null,
      application: account.application ?? null,
      moderation: account.moderation ?? null,
      user_group: account.profile.user_group || 'yunv',
      registration_site: account.profile.registration_site || 'duo',
      site_access: account.site_access || [],
      capabilities: account.capabilities || {},
    };
    this.user = { ...this.user, ...account.user, display_name: account.profile.display_name, avatar_key: account.profile.avatar_key, user_group: account.profile.user_group || 'yunv' };
    return this.access;
  }

  isApproved() {
    return this.isDemo() || this.access.status === 'active';
  }

  isAdmin() {
    return Boolean(this.access.capabilities.admin);
  }

  managementLevel() {
    return this.access.management_level ?? null;
  }

  can(capability) {
    return Boolean(this.access.capabilities?.[capability]);
  }

  avatarUrl(objectKey) {
    if (!objectKey) return '';
    return `${this.config.mediaPublicBaseUrl.replace(/\/$/, '')}/${String(objectKey).replace(/^\//, '')}`;
  }

  requireApproved(feature = '参与社区互动') {
    if (!this.user) throw new Error('请先登录');
    if (this.isApproved()) return;
    if (this.access.moderation?.active_report) throw new Error(`账号因举报暂时冻结，管理员驳回举报并恢复权限后才能${feature}`);
    if (this.access.moderation?.active_ban) throw new Error('账号已被永久封禁，可前往个人页面查看处理结果或提交申诉');
    const messages = {
      pending: `账号正在等待管理员审核，审核通过后才能${feature}`,
      rejected: '账号申请未通过，请联系管理员',
      suspended: '账号已被暂停使用，请联系管理员',
      deleted: '账号已停用',
    };
    throw new Error(messages[this.access.status] || '账号当前不可参与社区互动');
  }

  async authenticatedRequest(path, options = {}) {
    const { data } = await this.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('登录状态已失效，请重新登录');
    const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Site-Id': this.config.siteId || 'duo', ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || '请求失败');
    return payload.data;
  }

  async listNotifications(limit = 50) {
    if (!this.user) return { items: [], unread_count: 0 };
    if (this.mode === 'demo') return { items: [], unread_count: 0 };
    return this.authenticatedRequest(`/v1/notifications?limit=${Math.min(Math.max(Number(limit) || 50, 1), 100)}`);
  }

  async listAnnouncements(limit = 50) {
    const headers = { Accept: 'application/json' };
    if (this.supabase) {
      const { data } = await this.supabase.auth.getSession();
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const response = await fetch(`${this.config.apiBaseUrl}/v1/announcements?site_id=${encodeURIComponent(this.config.siteId)}&limit=${Math.min(Math.max(Number(limit) || 50, 1), 100)}`, { headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || '无法读取站内通知');
    return payload.data || { items: [], audience: this.user ? 'registered' : 'guest' };
  }

  async markAnnouncementRead(announcementId) {
    if (this.mode === 'demo') return { id: announcementId, read_at: new Date().toISOString() };
    return this.authenticatedRequest(`/v1/announcements/${encodeURIComponent(announcementId)}/read`, {
      method: 'POST', body: JSON.stringify({}),
    });
  }

  async unreadNotificationCount() {
    const result = await this.listNotifications(1);
    return Number(result?.unread_count || 0);
  }

  async markNotificationRead(notificationId) {
    if (this.mode === 'demo') return { id: notificationId, read_at: new Date().toISOString() };
    return this.authenticatedRequest(`/v1/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST', body: JSON.stringify({}),
    });
  }

  async markAllNotificationsRead() {
    if (this.mode === 'demo') return { updated: 0 };
    return this.authenticatedRequest('/v1/notifications/read-all', { method: 'POST', body: JSON.stringify({}) });
  }

  async listAdminQueues() {
    if (!this.isAdmin()) throw new Error('需要管理员权限');
    const requests = {
      submissions: this.can('review_submissions') ? this.authenticatedRequest('/v1/admin/submissions') : Promise.resolve([]),
      reports: this.can('handle_reports') ? this.authenticatedRequest('/v1/admin/reports') : Promise.resolve([]),
      appeals: this.can('handle_reports') ? this.authenticatedRequest('/v1/admin/appeals') : Promise.resolve([]),
      applications: this.can('review_accounts') ? this.authenticatedRequest('/v1/admin/applications') : Promise.resolve([]),
      questions: this.can('submit_questions') ? this.authenticatedRequest('/v1/admin/questions') : Promise.resolve([]),
      users: Promise.resolve([]),
    };
    const [submissions, reports, appeals, applications, questions, users] = await Promise.all([
      requests.submissions, requests.reports, requests.appeals, requests.applications, requests.questions, requests.users,
    ]);
    return { applications: applications || [], submissions: submissions || [], reports: reports || [], appeals: appeals || [], questions: questions || [], users: users || [] };
  }

  async getReviewQuestion() {
    if (this.mode === 'demo') return { id: 'demo-question', prompt: '请说明你希望加入社区的原因，以及你准备如何参与友善、真实、有帮助的讨论。' };
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/v1/auth/review-question?site_id=${encodeURIComponent(this.config.siteId || 'duo')}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.data?.id || !payload.data?.prompt) return { ...DEFAULT_REVIEW_QUESTION };
      return payload.data;
    } catch (error) {
      console.warn('随机审核问题加载失败，已使用默认问题：', error?.message || error);
      return { ...DEFAULT_REVIEW_QUESTION };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async reviewAccountApplication(userId, decision, reviewNote = '') {
    return this.authenticatedRequest(`/v1/admin/applications/${encodeURIComponent(userId)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, review_note: reviewNote || null }),
    });
  }

  async reviewSubmission(submissionId, decision, reviewNote = '') {
    return this.authenticatedRequest(`/v1/admin/submissions/${encodeURIComponent(submissionId)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, review_note: reviewNote || null }),
    });
  }

  async reviewReport(reportId, decision, reviewNote = '') {
    return this.authenticatedRequest(`/v1/admin/reports/${encodeURIComponent(reportId)}/review`, {
      method: 'POST', body: JSON.stringify({ decision, review_note: reviewNote || null }),
    });
  }

  async submitBanAppeal(message) {
    if (!this.user) throw new Error('请先登录');
    return this.authenticatedRequest('/v1/appeals', { method: 'POST', body: JSON.stringify({ message }) });
  }

  async reviewBanAppeal(appealId, decision, reviewNote = '', fandom = null) {
    return this.authenticatedRequest(`/v1/admin/appeals/${encodeURIComponent(appealId)}/review`, {
      method: 'POST', body: JSON.stringify({ decision, review_note: reviewNote || null, fandom }),
    });
  }

  async submitReviewQuestion(prompt) {
    return this.authenticatedRequest('/v1/admin/questions', { method: 'POST', body: JSON.stringify({ prompt, site_id: this.config.siteId }) });
  }

  async reviewQuestion(questionId, decision, reviewNote = '') {
    return this.authenticatedRequest(`/v1/admin/questions/${encodeURIComponent(questionId)}/review`, {
      method: 'POST', body: JSON.stringify({ decision, review_note: reviewNote || null }),
    });
  }

  async editReviewQuestion(questionId, prompt) {
    return this.authenticatedRequest(`/v1/admin/questions/${encodeURIComponent(questionId)}/edit`, {
      method: 'POST', body: JSON.stringify({ prompt }),
    });
  }

  async deleteReviewQuestion(questionId) {
    return this.authenticatedRequest(`/v1/admin/questions/${encodeURIComponent(questionId)}/delete`, {
      method: 'POST', body: JSON.stringify({}),
    });
  }

  async setManagementLevel(userId, level) {
    return this.authenticatedRequest(`/v1/admin/users/${encodeURIComponent(userId)}/management-level`, {
      method: 'POST', body: JSON.stringify({ level }),
    });
  }

  async signIn({ email, password, displayName, captchaToken }) {
    if (this.mode === 'demo') {
      this.user = {
        id: 'demo-user-ran',
        email: email || 'ran@example.com',
        display_name: displayName || 'Ran',
      };
      writeStorage(USER_KEY, this.user);
      this.access = this.demoAccess();
      return this.user;
    }
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) throw authError(error);
    this.user = data.user;
    await this.refreshAccess();
    return this.user;
  }

  async signUp({ email, password, displayName, captchaToken, reviewQuestionId, reviewAnswer }) {
    if (this.mode === 'demo') {
      return { user: { email, user_metadata: { display_name: displayName } }, session: null, confirmationRequired: true };
    }
    const { data, error } = await this.supabase.auth.signUp({
      email: String(email).trim().toLowerCase(),
      password,
      options: {
        data: { display_name: displayName, registration_site: this.config.siteId || 'duo', review_question_id: reviewQuestionId, review_answer: reviewAnswer },
        emailRedirectTo: this.authRedirectUrl(),
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) throw authError(error);
    this.user = data.session?.user || null;
    if (this.user) await this.refreshAccess();
    return {
      user: data.user,
      session: data.session,
      confirmationRequired: !data.session,
    };
  }

  async resendSignUpConfirmation(email) {
    if (this.mode === 'demo') return { email };
    const { error } = await this.supabase.auth.resend({
      type: 'signup',
      email: String(email).trim().toLowerCase(),
      options: { emailRedirectTo: this.authRedirectUrl() },
    });
    if (error) throw authError(error);
    return { email };
  }

  async sendPasswordReset(email, captchaToken) {
    if (this.mode === 'demo') return { email };
    const redirect = new URL(this.authRedirectUrl());
    redirect.searchParams.set('auth', 'recovery');
    const { error } = await this.supabase.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), {
      redirectTo: redirect.toString(),
      ...(captchaToken ? { captchaToken } : {}),
    });
    if (error) throw authError(error);
    return { email };
  }

  async updatePassword(password) {
    if (this.mode === 'demo') return;
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) throw authError(error);
  }

  async signOut() {
    if (this.mode === 'live') await this.supabase.auth.signOut();
    this.user = null;
    this.access = this.emptyAccess();
    localStorage.removeItem(USER_KEY);
  }

  async listEvents() {
    if (this.mode === 'demo') return [];
    const events = [];
    const pageSize = 100;
    for (let page = 0; page < 100; page += 1) {
      const query = new URLSearchParams({ site_id: this.config.siteId, limit: String(pageSize), offset: String(page * pageSize) });
      const response = await fetch(`${this.config.apiBaseUrl}/v1/events?${query}`);
      if (!response.ok) throw new Error('活动社区数据加载失败');
      const payload = await response.json();
      const batch = payload.data || [];
      events.push(...batch);
      if (batch.length < pageSize) break;
    }
    return events.map(normalizeLiveEvent);
  }

  async listVenues(city = '') {
    if (this.mode === 'demo') return [];
    const query = new URLSearchParams();
    if (city) query.set('city', city);
    const response = await fetch(`${this.config.apiBaseUrl}/v1/venues?${query}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || '无法读取场馆列表');
    return payload.data || [];
  }

  async listPrivateEvents() {
    if (!this.user || !this.isApproved()) return [];
    if (this.mode === 'demo') return readStorage('musical-community-private-events-v1', []);
    const rows = await this.authenticatedRequest('/v1/private-events');
    return (rows || []).map((event) => ({
      id: `private:${event.id}`,
      privateId: event.id,
      submissionId: event.submission_id,
      isPrivate: true,
      title: event.title,
      category: event.category,
      date: event.start_time?.slice(0, 10) || '',
      endDate: event.end_time?.slice(0, 10) || '',
      dateLabel: event.start_time ? new Date(event.start_time).toLocaleString('zh-CN') : '',
      city: event.city || '', country: event.country || '', venue: event.venue || '',
      lon: event.longitude == null ? null : Number(event.longitude),
      lat: event.latitude == null ? null : Number(event.latitude),
      description: event.description || '',
      sourceUrls: event.media_links || [], mediaUrls: event.images || [], contributors: [],
      personIds: [], personId: '', personName: '私人活动', role: '仅自己可见',
    }));
  }

  async listComments(event) {
    const eventId = event?.communityId || event?.id;
    if (this.mode === 'demo') {
      const stored = readStorage(COMMENTS_KEY, []).filter((comment) => comment.event_key === demoEventKey(event));
      const liked = new Set(readStorage(LIKES_KEY, []));
      return [...SEED_COMMENTS, ...stored].map((comment) => ({ ...comment, liked_by_me: liked.has(comment.id) }));
    }
    if (!event?.communityId) return [];
    const { data: comments, error } = await this.supabase
      .from('comments')
      .select('id,user_id,parent_id,reply_to_id,content,status,created_at,updated_at')
      .eq('site_id', this.config.siteId)
      .eq('event_id', eventId)
      .order('created_at');
    if (error) throw error;
    const userIds = [...new Set((comments || []).map((comment) => comment.user_id))];
    const commentIds = (comments || []).map((comment) => comment.id);
    const [{ data: profiles }, { data: likeCounts }, { data: myLikes }] = await Promise.all([
      userIds.length ? this.supabase.from('profiles').select('user_id,display_name,avatar_key').in('user_id', userIds) : { data: [] },
      commentIds.length ? this.supabase.from('comment_like_counts').select('comment_id,like_count').in('comment_id', commentIds) : { data: [] },
      this.user && commentIds.length ? this.supabase.from('comment_likes').select('comment_id').eq('user_id', this.user.id).in('comment_id', commentIds) : { data: [] },
    ]);
    const profileById = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
    const countById = new Map((likeCounts || []).map((item) => [item.comment_id, Number(item.like_count || 0)]));
    const likedIds = new Set((myLikes || []).map((item) => item.comment_id));
    return (comments || []).map((comment) => ({
      ...comment,
      display_name: profileById.get(comment.user_id)?.display_name || '社区用户',
      avatar_url: this.avatarUrl(profileById.get(comment.user_id)?.avatar_key),
      like_count: countById.get(comment.id) || 0,
      liked_by_me: likedIds.has(comment.id),
    }));
  }

  async addComment(event, content, parentId = null, replyToId = parentId) {
    if (!this.user) throw new Error('请先登录后再参与讨论');
    this.requireApproved('发表评论');
    if (this.mode === 'demo') {
      const comments = readStorage(COMMENTS_KEY, []);
      const comment = {
        id: crypto.randomUUID(),
        event_key: demoEventKey(event),
        user_id: this.user.id,
        display_name: this.user.display_name || this.user.email?.split('@')[0] || 'Ran',
        parent_id: parentId,
        reply_to_id: replyToId,
        content,
        created_at: new Date().toISOString(),
        like_count: 0,
      };
      comments.push(comment);
      writeStorage(COMMENTS_KEY, comments);
      return comment;
    }
    if (!event?.communityId) throw new Error('该历史活动尚未与社区活动 ID 建立映射');
    const { data, error } = await this.supabase.from('comments').insert({
      site_id: this.config.siteId,
      event_id: event.communityId,
      user_id: this.user.id,
      parent_id: parentId,
      reply_to_id: replyToId,
      content,
    }).select().single();
    if (error) throw error;
    return data;
  }

  async updateComment(comment, content) {
    if (!this.user || comment?.user_id !== this.user.id) throw new Error('只能编辑自己发布的评论');
    this.requireApproved('编辑评论');
    if (this.mode === 'demo') {
      const comments = readStorage(COMMENTS_KEY, []);
      const target = comments.find((item) => item.id === comment.id && item.user_id === this.user.id);
      if (!target) throw new Error('评论不存在或无法编辑');
      target.content = content;
      target.updated_at = new Date().toISOString();
      writeStorage(COMMENTS_KEY, comments);
      return target;
    }
    const { data, error } = await this.supabase.from('comments')
      .update({ content })
      .eq('id', comment.id)
      .eq('user_id', this.user.id)
      .select('id,user_id,parent_id,reply_to_id,content,status,created_at,updated_at')
      .single();
    if (error) throw error;
    return data;
  }

  async deleteComment(comment) {
    if (!this.user || comment?.user_id !== this.user.id) throw new Error('只能删除自己发布的评论');
    this.requireApproved('删除评论');
    if (this.mode === 'demo') {
      const comments = readStorage(COMMENTS_KEY, []);
      const target = comments.find((item) => item.id === comment.id && item.user_id === this.user.id);
      if (!target) throw new Error('评论不存在或无法删除');
      target.content = '[已删除]';
      target.status = 'deleted';
      target.updated_at = new Date().toISOString();
      writeStorage(COMMENTS_KEY, comments);
      return;
    }
    const { error } = await this.supabase.rpc('delete_own_comment', { p_comment_id: comment.id });
    if (error) throw error;
  }

  async toggleCommentLike(comment) {
    if (!this.user) throw new Error('请先登录后再点赞');
    this.requireApproved('点赞评论');
    if (this.mode === 'demo') {
      const liked = new Set(readStorage(LIKES_KEY, []));
      if (liked.has(comment.id)) liked.delete(comment.id);
      else liked.add(comment.id);
      writeStorage(LIKES_KEY, [...liked]);
      return liked.has(comment.id);
    }
    if (comment.liked_by_me) {
      const { error } = await this.supabase.from('comment_likes').delete()
        .eq('user_id', this.user.id).eq('comment_id', comment.id);
      if (error) throw error;
      return false;
    }
    const { error } = await this.supabase.from('comment_likes').insert({ user_id: this.user.id, comment_id: comment.id });
    if (error) throw error;
    return true;
  }

  async getEventMarks(events = []) {
    const result = new Map(events.map((event) => [demoEventKey(event), { watched: false, recommended: false, favorite: false, liked: false, like_count: 0 }]));
    if (this.mode === 'demo') {
      const marks = readStorage(EVENT_MARKS_KEY, []);
      const favorites = new Set(readStorage(FAVORITES_KEY, []).map((item) => item.event_key));
      const likes = readStorage(EVENT_LIKES_KEY, []);
      marks.forEach((mark) => {
        const state = result.get(mark.event_key);
        if (state && ['watched', 'recommended'].includes(mark.mark_type)) state[mark.mark_type] = true;
      });
      result.forEach((state, key) => { state.favorite = favorites.has(key); });
      likes.forEach((like) => {
        const state = result.get(like.event_key);
        if (!state) return;
        state.like_count += 1;
        state.liked ||= like.user_id === (this.user?.id || 'demo-user');
      });
      return result;
    }
    const ids = [...new Set(events.map((event) => event.communityId).filter(Boolean))];
    for (let index = 0; index < ids.length; index += 100) {
      const batch = ids.slice(index, index + 100);
      const [{ data: marks, error: marksError }, { data: favorites, error: favoritesError }, { data: likeCounts, error: likesError }, { data: myLikes }] = await Promise.all([
        this.user ? this.supabase.from('event_user_marks').select('event_id,mark_type').eq('user_id', this.user.id).in('event_id', batch) : { data: [], error: null },
        this.user ? this.supabase.from('event_favorites').select('event_id').eq('user_id', this.user.id).in('event_id', batch) : { data: [], error: null },
        this.supabase.from('event_like_counts').select('event_id,like_count').in('event_id', batch),
        this.user ? this.supabase.from('event_likes').select('event_id').eq('user_id', this.user.id).in('event_id', batch) : { data: [], error: null },
      ]);
      if (marksError && !['42P01', 'PGRST205'].includes(marksError.code)) throw marksError;
      if (marksError) console.warn('活动标记表尚未部署：', marksError.message);
      if (favoritesError) throw favoritesError;
      if (likesError && !['42P01', 'PGRST205'].includes(likesError.code)) throw likesError;
      (marks || []).forEach((mark) => {
        const state = result.get(String(mark.event_id));
        if (state && ['watched', 'recommended'].includes(mark.mark_type)) state[mark.mark_type] = true;
      });
      (favorites || []).forEach((favorite) => {
        const state = result.get(String(favorite.event_id));
        if (state) state.favorite = true;
      });
      (likeCounts || []).forEach((like) => { const state = result.get(String(like.event_id)); if (state) state.like_count = Number(like.like_count || 0); });
      (myLikes || []).forEach((like) => { const state = result.get(String(like.event_id)); if (state) state.liked = true; });
    }
    return result;
  }

  async toggleEventLike(event, currentState = false) {
    if (!this.user) throw new Error('请先登录后再点赞活动');
    this.requireApproved('点赞活动');
    const key = demoEventKey(event);
    if (this.mode === 'demo') {
      const likes = readStorage(EVENT_LIKES_KEY, []);
      const userId = this.user.id || 'demo-user';
      const index = likes.findIndex((item) => item.event_key === key && item.user_id === userId);
      if (index >= 0) likes.splice(index, 1);
      else likes.push({ event_key: key, user_id: userId, created_at: new Date().toISOString() });
      writeStorage(EVENT_LIKES_KEY, likes);
      return index < 0;
    }
    if (!event?.communityId) throw new Error('该活动尚未与共享活动 ID 建立映射');
    if (currentState) {
      const { error } = await this.supabase.from('event_likes').delete().eq('user_id', this.user.id).eq('event_id', event.communityId);
      if (error) throw error;
      return false;
    }
    const { error } = await this.supabase.from('event_likes').insert({ user_id: this.user.id, event_id: event.communityId });
    if (error) throw error;
    return true;
  }

  async toggleEventMark(event, markType, currentState = false) {
    if (!['watched', 'recommended', 'favorite'].includes(markType)) throw new Error('未知的活动标记');
    if (markType === 'favorite') return this.toggleFavorite(event);
    if (!this.user) throw new Error(`请先登录后再${markType === 'watched' ? '标记看过' : '推荐活动'}`);
    this.requireApproved(markType === 'watched' ? '标记看过' : '推荐活动');
    const key = demoEventKey(event);
    if (this.mode === 'demo') {
      const marks = readStorage(EVENT_MARKS_KEY, []);
      const index = marks.findIndex((item) => item.event_key === key && item.mark_type === markType);
      if (index >= 0) marks.splice(index, 1);
      else marks.push({ event_key: key, mark_type: markType, created_at: new Date().toISOString() });
      writeStorage(EVENT_MARKS_KEY, marks);
      return index < 0;
    }
    if (!event?.communityId) throw new Error('该活动尚未与社区活动 ID 建立映射');
    if (currentState) {
      const { error } = await this.supabase.from('event_user_marks').delete()
        .eq('user_id', this.user.id).eq('event_id', event.communityId).eq('mark_type', markType);
      if (error) throw error;
      return false;
    }
    const { error } = await this.supabase.from('event_user_marks').insert({
      user_id: this.user.id,
      event_id: event.communityId,
      mark_type: markType,
    });
    if (error) throw error;
    return true;
  }

  async reportComment(comment, reason, details = '') {
    if (!this.user) throw new Error('请先登录后再举报');
    this.requireApproved('提交举报');
    if (this.mode === 'demo') return { id: crypto.randomUUID(), status: this.isAdmin() ? 'resolved' : 'open', automatic_action: this.isAdmin() };
    return this.authenticatedRequest('/v1/reports', {
      method: 'POST', body: JSON.stringify({ comment_id: comment.id, reason: reason || '快捷举报', details }),
    });
  }

  async reportUser(userId, reason = '快捷举报', details = '') {
    if (!this.user) throw new Error('请先登录后再举报');
    if (!userId || userId === this.user.id) throw new Error('不能举报自己的账号');
    this.requireApproved('举报账号');
    if (this.mode === 'demo') return { id: crypto.randomUUID(), status: this.isAdmin() ? 'resolved' : 'open', automatic_action: this.isAdmin() };
    return this.authenticatedRequest('/v1/reports', {
      method: 'POST', body: JSON.stringify({ reported_user_id: userId, reason, details }),
    });
  }

  isFavorite(event) {
    if (this.mode !== 'demo') return false;
    return readStorage(FAVORITES_KEY, []).some((favorite) => favorite.event_key === demoEventKey(event));
  }

  async listFavorites() {
    if (this.mode === 'demo') return readStorage(FAVORITES_KEY, []);
    if (!this.user) return [];
    const { data, error } = await this.supabase.from('event_favorites')
      .select('event_id,created_at,event:events(id,title,category,start_time,city,country)')
      .eq('user_id', this.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({
      event_key: row.event_id,
      title: row.event?.title || '活动',
      category: row.event?.category || '',
      date: row.event?.start_time?.slice(0, 10) || '',
      city: row.event?.city || '',
    }));
  }

  async toggleFavorite(event) {
    if (!this.user) throw new Error('请先登录后再收藏');
    if (this.mode === 'demo') {
      const favorites = readStorage(FAVORITES_KEY, []);
      const key = demoEventKey(event);
      const index = favorites.findIndex((favorite) => favorite.event_key === key);
      if (index >= 0) favorites.splice(index, 1);
      else favorites.unshift({
        event_key: key,
        title: event.title,
        category: event.category,
        date: event.dateLabel || event.date || '',
        city: event.city || '',
        saved_at: new Date().toISOString(),
      });
      writeStorage(FAVORITES_KEY, favorites);
      return index < 0;
    }
    if (!event?.communityId) throw new Error('该历史活动尚未与社区活动 ID 建立映射');
    const { data: existing } = await this.supabase.from('event_favorites').select('event_id')
      .eq('user_id', this.user.id).eq('event_id', event.communityId).maybeSingle();
    if (existing) {
      const { error } = await this.supabase.from('event_favorites').delete()
        .eq('user_id', this.user.id).eq('event_id', event.communityId);
      if (error) throw error;
      return false;
    }
    const { error } = await this.supabase.from('event_favorites').insert({ user_id: this.user.id, event_id: event.communityId });
    if (error) throw error;
    return true;
  }

  async listDiscussionPosts(section) {
    if (!['vent', 'encounter'].includes(section)) throw new Error('未知讨论分区');
    if (this.mode === 'demo') {
      return readStorage(DISCUSSION_POSTS_KEY, [])
        .filter((post) => post.section === section && post.status !== 'deleted')
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    const { data: posts, error } = await this.supabase.from('discussion_posts')
      .select('id,author_id,section,zone,content,event_name,occurred_at,location,links,media_keys,status,created_at,updated_at')
      .eq('section', section)
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const userIds = [...new Set((posts || []).map((post) => post.author_id))];
    const { data: profiles, error: profileError } = userIds.length
      ? await this.supabase.from('profiles').select('user_id,display_name,avatar_key').in('user_id', userIds)
      : { data: [], error: null };
    if (profileError) throw profileError;
    const profileById = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
    return (posts || []).map((post) => ({
      ...post,
      display_name: profileById.get(post.author_id)?.display_name || '社区用户',
      avatar_url: this.avatarUrl(profileById.get(post.author_id)?.avatar_key),
      media_urls: (post.media_keys || []).map((key) => this.avatarUrl(key)),
    }));
  }

  async uploadDiscussionImage(file) {
    if (!this.user) throw new Error('请先登录后再上传图片');
    this.requireApproved('上传图片');
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (!allowedTypes.includes(file?.type)) throw new Error('仅支持 JPG、PNG、WebP 或 AVIF 图片');
    if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('单张图片不能超过 8 MB');
    if (this.mode === 'demo') {
      const publicUrl = await fileAsDataUrl(file);
      return { object_key: publicUrl, public_url: publicUrl };
    }
    const signed = await this.authenticatedRequest('/v1/uploads/sign', {
      method: 'POST',
      body: JSON.stringify({ purpose: 'comment_image', content_type: file.type, byte_size: file.size }),
    });
    const uploadResponse = await fetch(signed.upload_url, {
      method: signed.method || 'PUT',
      headers: signed.headers || { 'Content-Type': file.type },
      body: file,
    });
    if (!uploadResponse.ok) throw new Error('图片上传失败，请稍后重试');
    return this.authenticatedRequest('/v1/uploads/complete', {
      method: 'POST', body: JSON.stringify({ media_id: signed.media_id }),
    });
  }

  async createDiscussionPost(input) {
    if (!this.user) throw new Error('请先登录后再发布');
    this.requireApproved('发布讨论');
    if (!['vent', 'encounter'].includes(input.section)) throw new Error('未知讨论分区');
    const payload = {
      author_id: this.user.id,
      section: input.section,
      zone: input.section === 'vent' ? input.zone : null,
      content: String(input.content || '').trim(),
      event_name: input.section === 'encounter' ? String(input.event_name || '').trim() : null,
      occurred_at: input.section === 'encounter' ? input.occurred_at : null,
      location: input.section === 'encounter' ? String(input.location || '').trim() : null,
      links: Array.isArray(input.links) ? input.links.slice(0, 12) : [],
      media_keys: Array.isArray(input.media_keys) ? input.media_keys.slice(0, 6) : [],
      status: 'published',
    };
    if (!payload.content) throw new Error('请输入发布内容');
    if (payload.section === 'vent' && !['yunduo', 'xingxing'].includes(payload.zone)) throw new Error('请选择吐槽分区');
    if (payload.section === 'encounter' && (!payload.event_name || !payload.occurred_at || !payload.location)) throw new Error('请填写活动名称、时间和地点');
    if (this.mode === 'demo') {
      const posts = readStorage(DISCUSSION_POSTS_KEY, []);
      const post = {
        id: crypto.randomUUID(), ...payload,
        display_name: this.user.display_name || this.user.email?.split('@')[0] || '社区用户',
        media_urls: payload.media_keys,
        created_at: new Date().toISOString(),
      };
      posts.unshift(post);
      writeStorage(DISCUSSION_POSTS_KEY, posts);
      return post;
    }
    const { data, error } = await this.supabase.from('discussion_posts').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async deleteDiscussionPost(post) {
    if (!this.user || post?.author_id !== this.user.id) throw new Error('只能删除自己发布的内容');
    this.requireApproved('删除讨论');
    if (this.mode === 'demo') {
      writeStorage(DISCUSSION_POSTS_KEY, readStorage(DISCUSSION_POSTS_KEY, []).filter((item) => item.id !== post.id));
      return;
    }
    const { error } = await this.supabase.from('discussion_posts').delete().eq('id', post.id).eq('author_id', this.user.id);
    if (error) throw error;
  }

  async submitEvent(input) {
    if (!this.user) throw new Error('请先登录后再投稿');
    this.requireApproved('投稿');
    if (this.mode === 'demo') {
      const submissions = readStorage(SUBMISSIONS_KEY, []);
      const submission = { id: crypto.randomUUID(), ...input, status: input.submission_scope === 'private' ? 'draft' : 'pending', created_at: new Date().toISOString() };
      submissions.unshift(submission);
      writeStorage(SUBMISSIONS_KEY, submissions);
      if (input.submission_scope === 'private') {
        const privateEvents = readStorage('musical-community-private-events-v1', []);
        privateEvents.unshift({
          id: `private:${submission.id}`, privateId: submission.id, submissionId: submission.id, isPrivate: true,
          title: input.title, category: input.category, date: input.start_time?.slice(0, 10) || '',
          dateLabel: new Date(input.start_time).toLocaleString('zh-CN'), city: input.city || '', country: input.country || '',
          venue: input.venue || '', lon: input.longitude, lat: input.latitude, description: input.description || '',
          sourceUrls: input.media_links || [], mediaUrls: [], personIds: [], personName: '私人活动', role: '仅自己可见',
        });
        writeStorage('musical-community-private-events-v1', privateEvents);
      }
      return submission;
    }
    return this.authenticatedRequest('/v1/submissions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async uploadSubmissionImages(submissionId, files = []) {
    const images = [...files].filter(Boolean);
    if (!images.length) return [];
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    for (const file of images) {
      if (!allowedTypes.includes(file.type)) throw new Error('投稿图片仅支持 JPG、PNG、WebP 或 AVIF');
      if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('单张投稿图片不能超过 25 MB');
    }
    if (this.mode === 'demo') return Promise.all(images.map(async (file) => ({ public_url: await fileAsDataUrl(file) })));
    const results = [];
    for (const file of images) {
      const signed = await this.authenticatedRequest('/v1/uploads/sign', {
        method: 'POST',
        body: JSON.stringify({ purpose: 'submission', content_type: file.type, byte_size: file.size, submission_id: submissionId }),
      });
      const uploadResponse = await fetch(signed.upload_url, {
        method: signed.method || 'PUT', headers: signed.headers || { 'Content-Type': file.type }, body: file,
      });
      if (!uploadResponse.ok) throw new Error('投稿图片上传失败，请稍后重试');
      results.push(await this.authenticatedRequest('/v1/uploads/complete', {
        method: 'POST', body: JSON.stringify({ media_id: signed.media_id }),
      }));
    }
    return results;
  }
}
