import { COMMUNITY_CONFIG } from '../config/community.js';
import { applySiteBackground, setSiteBackground } from '../config/siteBackground.js';

let siteBackgroundUrl = await applySiteBackground();
let promotionUrl = await fetch(`${COMMUNITY_CONFIG.apiBaseUrl}/v1/site-settings/promotion?site_id=${encodeURIComponent(COMMUNITY_CONFIG.siteId)}`).then((r) => r.ok ? r.json() : null).then((p) => p?.data?.promotion_url || '').catch(() => '');

const app = document.querySelector('#profileApp');
const toastElement = document.querySelector('.profile-toast');
const signoutButton = document.querySelector('[data-action="signout"]');
const notificationLink = document.querySelector('[data-notification-link]');
const notificationBadge = document.querySelector('[data-notification-badge]');
let toastTimer;
let account = null;
let supabase = null;
let profileCounts = { favorites: 0, comments: 0, submissions: 0 };
let notificationState = { items: [], unread_count: 0 };
const initialParams = new URLSearchParams(window.location.search);
let activeTab = ['notifications', 'admin'].includes(initialParams.get('tab')) ? initialParams.get('tab') : 'profile';
let adminSection = initialParams.get('section') || 'applications';
const IS_PERSONAL_SITE = true;
let adminQueues = { applications: [], submissions: [], reports: [], appeals: [], questions: [], users: [], announcements: [] };
let adminLoaded = false;
let adminLoading = false;
let adminError = '';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const initials = (name) => [...String(name || 'M')][0]?.toUpperCase() || 'M';
const formatNumber = (value) => new Intl.NumberFormat('zh-CN').format(Number(value || 0));
const statusLabels = { pending: '账号待审核', active: '社区成员', rejected: '审核未通过', suspended: '账号已暂停', deleted: '账号已停用' };
const managementLabels = { 1: '一级管理员', 2: '二级管理员', 3: '三级管理员' };
const notificationCategoryLabels = { account: '账号', submission: '投稿', report: '举报', review: '审核', system: '系统' };
const announcementAudienceLabels = { guest: '游客', registered: '已注册用户', banned: '被封禁用户', all: '所有用户' };
const groupLabels = { yunv: '云女 · 三个网站', cloud: '☁ 云朵 · 阿云嘎个人站', star: '⭐ 小星星 · 郑云龙个人站' };
const questionSiteLabels = { duo: '双人站 · 云女', ayg: '阿云嘎站 · 云朵', zyl: '郑云龙站 · 小星星' };

const can = (capability) => Boolean(account?.capabilities?.[capability]);

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};

function toast(message, isError = false) {
  toastElement.textContent = message;
  toastElement.classList.toggle('is-error', isError);
  toastElement.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastElement.classList.remove('is-visible'), 2800);
}

function publicAvatarUrl(key) {
  if (!key) return '';
  return `${COMMUNITY_CONFIG.mediaPublicBaseUrl.replace(/\/$/, '')}/${String(key).replace(/^\//, '')}`;
}

async function api(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('登录状态已失效，请重新登录');
  const response = await fetch(`${COMMUNITY_CONFIG.apiBaseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Site-Id': COMMUNITY_CONFIG.siteId, ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || '请求失败');
  return payload.data;
}

async function loadCounts(userId) {
  const count = (table, column) => supabase.from(table).select('*', { count: 'exact', head: true }).eq(column, userId);
  const [favorites, comments, submissions] = await Promise.all([
    count('event_favorites', 'user_id'),
    count('comments', 'user_id'),
    count('event_submissions', 'submitter_id'),
  ]);
  return {
    favorites: favorites.count || 0,
    comments: comments.count || 0,
    submissions: submissions.count || 0,
  };
}

function renderSignedOut() {
  signoutButton.hidden = true;
  notificationLink.hidden = true;
  app.innerHTML = `<section class="profile-signed-out"><div class="profile-empty-card"><span>人</span><h1>请先登录社区账号</h1><p>登录后可以查看个人资料、修改昵称并上传头像。邮箱作为账号凭证，不支持在此修改。</p><a href="/?community=account">前往登录</a></div></section>`;
}

function updateNotificationBadges() {
  const count = Number(notificationState.unread_count || 0);
  notificationLink.hidden = !account;
  notificationBadge.textContent = count > 99 ? '99+' : String(count);
  notificationBadge.hidden = count < 1;
  notificationLink.classList.toggle('has-unread', count > 0);
  notificationLink.setAttribute('aria-label', count ? `查看通知，${count}条未读` : '查看通知');
}

function notificationListMarkup() {
  const items = notificationState.items || [];
  if (!items.length) return '<div class="profile-notification-empty"><span>✓</span><h3>暂时没有通知</h3><p>账号、投稿、举报和审核状态变化会显示在这里。</p></div>';
  return `<div class="profile-notification-list">${items.map((item) => `
    <button class="profile-notification-item${item.read_at ? '' : ' is-unread'}" type="button" data-notification-id="${escapeHtml(item.id)}">
      <span class="profile-notification-dot" aria-hidden="true"></span>
      <span class="profile-notification-copy">
        <span class="profile-notification-meta"><em class="is-${escapeHtml(item.category)}">${escapeHtml(notificationCategoryLabels[item.category] || '通知')}</em><time>${escapeHtml(formatDate(item.created_at))}</time></span>
        <strong>${escapeHtml(item.title)}</strong><span class="profile-notification-message">${escapeHtml(item.message)}</span>
        ${item.metadata?.result_image ? `<img class="profile-notification-result-image" src="${escapeHtml(item.metadata.result_image)}" alt="申诉处理结果配图" />` : ''}
      </span>
      <span class="profile-notification-state">${item.read_at ? '已读' : '未读'}</span>
    </button>`).join('')}</div>`;
}

function moderationStatusMarkup() {
  const moderation = account?.moderation || {};
  const report = moderation.active_report;
  const ban = moderation.active_ban;
  const appeal = moderation.appeal;
  if (!report && !ban) return '';
  if (report && !ban) return `<section class="profile-card profile-moderation-card is-frozen">
    <header class="profile-card-header"><h2>账号因举报暂时冻结</h2><p>举报提交后，账号和相关评论会先行冻结，等待管理员核查。</p></header>
    <div class="profile-moderation-body"><p>冻结期间评论、投稿、举报及资料修改功能均不可使用。若管理员驳回举报，评论和账号权限会自动恢复。</p><small>举报时间：${escapeHtml(formatDate(report.created_at))}</small></div>
  </section>`;
  const resultImage = appeal?.status === 'rejected'
    ? (appeal.fandom === 'ayanga' ? '/assets/moderation/appeal-ayanga.jpg' : '/assets/moderation/appeal-zhengyunlong.png')
    : '';
  const appealMarkup = !appeal
    ? `<form class="profile-appeal-form" data-appeal-form><label><span>封禁申诉</span><textarea name="message" minlength="20" maxlength="5000" required rows="6" placeholder="请说明你认为处理有误的原因（20—5000 字）。每次永久封禁仅可申诉一次。"></textarea></label><button type="submit">提交申诉</button></form>`
    : appeal.status === 'pending'
      ? `<div class="profile-appeal-state"><strong>申诉审核中</strong><p>${escapeHtml(appeal.message)}</p><small>提交于 ${escapeHtml(formatDate(appeal.created_at))}</small></div>`
      : `<div class="profile-appeal-state is-rejected"><strong>申诉已被拒绝</strong><p>${escapeHtml(appeal.review_note || '管理员重新审核后维持永久封禁。')}</p>${resultImage ? `<img src="${resultImage}" alt="申诉被拒绝的处理结果配图" />` : ''}</div>`;
  return `<section class="profile-card profile-moderation-card is-banned">
    <header class="profile-card-header"><h2>账号已永久封禁</h2><p>账号互动权限已永久关闭，登录邮箱无法用于创建新的可用账号。</p></header>
    <div class="profile-moderation-body"><p>${escapeHtml(ban?.reason || '举报成立，账号被永久封禁。')}</p>${appealMarkup}</div>
  </section><section class="community-review-section is-category profile-promotion-manager"><div class="community-review-heading"><div><h3>加载宣传版面</h3><p>进入活动地球时全屏展示至少 2 秒，支持静态图片和 GIF 动图。</p></div><span>仅一级管理员</span></div>${promotionUrl ? `<img class="profile-promotion-preview" src="${escapeHtml(promotionUrl)}" alt="当前宣传版面" />` : ''}<form class="profile-background-form" data-promotion-form><label><span>选择宣传图片或 GIF</span><input type="file" name="promotion" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" required /></label><button class="community-submit" type="submit">上传并启用 <span>→</span></button><p class="profile-background-state" data-promotion-state></p></form></section>`;
}

function profileContentMarkup(user, profile) {
  const locked = Boolean(account?.moderation?.active_report || account?.moderation?.active_ban);
  return `
    ${moderationStatusMarkup()}
    <div class="profile-stats"><div class="profile-stat"><strong>${formatNumber(profileCounts.favorites)}</strong><span>收藏活动</span></div><div class="profile-stat"><strong>${formatNumber(profileCounts.comments)}</strong><span>参与讨论</span></div><div class="profile-stat"><strong>${formatNumber(profileCounts.submissions)}</strong><span>活动投稿</span></div></div>
    <section class="profile-card">
      <header class="profile-card-header"><h2>公开资料</h2><p>昵称和头像会显示在评论、投稿及管理界面中。</p></header>
      <form class="profile-form" data-profile-form>
        <label><span>社区昵称</span><input name="displayName" minlength="1" maxlength="80" required value="${escapeHtml(profile.display_name)}" ${locked ? 'disabled' : ''} /><small>${locked ? '账号冻结或封禁期间不可修改公开资料。' : '最多 80 个字符，请勿使用冒充或攻击性名称。'}</small></label>
        <div class="profile-form-actions"><button class="profile-save" type="submit" ${locked ? 'disabled' : ''}>保存资料</button></div>
      </form>
    </section>
    <section class="profile-card">
      <header class="profile-card-header"><h2>登录邮箱</h2><p>邮箱用于登录、确认邮件和账号安全通知。</p></header>
      <div class="profile-form"><label><span>邮箱地址</span><input type="email" value="${escapeHtml(user.email || '')}" disabled aria-readonly="true" /><small>邮箱是此账号的唯一登录凭证，创建后不可在用户页面修改。</small></label></div>
      <div class="profile-email-lock"><span>🔒</span><div><b>邮箱已锁定</b><br />如果邮箱已无法使用，请联系一级管理员核验身份，不要重新注册重复账号。</div></div>
    </section>
    <section class="profile-card">
      <header class="profile-card-header"><h2>修改密码</h2><p>设置新的登录密码，保存后立即生效。</p></header>
      <form class="profile-form" data-password-form><label><span>新密码</span><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="至少 8 位" /></label><label><span>确认新密码</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="再次输入新密码" /></label><div class="profile-form-actions"><button class="profile-save" type="submit">更新密码</button></div></form>
    </section>`;
}

function notificationContentMarkup() {
  const unread = Number(notificationState.unread_count || 0);
  return `<section class="profile-card profile-notification-card">
    <header class="profile-card-header profile-notification-header"><div><h2>通知中心</h2><p>账号、投稿、举报与审核流程的最新状态。</p></div>${unread ? `<button type="button" data-action="read-all-notifications">全部标为已读</button>` : ''}</header>
    ${notificationListMarkup()}
  </section>`;
}

function accountApplicationMarkup(item) {
  return `<article class="community-review-card" data-review-card="account">
    <div class="community-review-card-top"><span>${escapeHtml(groupLabels[item.user_group] || 'ACCOUNT')}</span><time>${escapeHtml(formatDate(item.created_at))}</time></div>
    <h4>${escapeHtml(item.display_name || '新用户')}</h4><p>${escapeHtml(item.email || '邮箱信息不可用')}</p>
    <div class="community-application-answer"><strong>审核问题</strong><p>${escapeHtml(item.question_snapshot)}</p><strong>注册理由 · ${[...String(item.answer || '')].length} 字</strong><p>${escapeHtml(item.answer)}</p></div>
    <textarea class="community-review-note" maxlength="2000" placeholder="审核备注（可选）"></textarea>
    <div class="community-review-actions"><button type="button" data-admin-action="review-account" data-review-id="${escapeHtml(item.user_id)}" data-decision="approved">通过</button><button class="is-danger" type="button" data-admin-action="review-account" data-review-id="${escapeHtml(item.user_id)}" data-decision="rejected">拒绝</button></div>
  </article>`;
}

function submissionReviewMarkup(item) {
  const place = [item.city, item.venue].filter(Boolean).join(' · ');
  return `<article class="community-review-card" data-review-card="submission">
    <div class="community-review-card-top"><span>${escapeHtml(item.category || '活动')}</span><time>${escapeHtml(formatDate(item.created_at))}</time></div>
    <h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.submitter_name || '社区用户')} · ${escapeHtml(item.start_time?.slice(0, 10) || '')}${place ? ` · ${escapeHtml(place)}` : ''}</p>
    ${item.description ? `<div class="community-review-description">${escapeHtml(item.description)}</div>` : ''}
    ${item.source_url ? `<a class="community-review-source" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">查看核验来源 ↗</a>` : ''}
    <div class="community-review-sites">同步到：${(item.proposed_sites || []).map((site) => escapeHtml(site)).join(' · ')}</div>
    <textarea class="community-review-note" maxlength="2000" placeholder="审核备注（可选）"></textarea>
    <div class="community-review-actions"><button type="button" data-admin-action="review-submission" data-review-id="${escapeHtml(item.id)}" data-decision="approved">通过并发布</button><button class="is-danger" type="button" data-admin-action="review-submission" data-review-id="${escapeHtml(item.id)}" data-decision="rejected">拒绝</button></div>
  </article>`;
}

function reportReviewMarkup(item) {
  const comment = Array.isArray(item.comment) ? item.comment[0] : item.comment;
  return `<article class="community-review-card" data-review-card="report"><div class="community-review-card-top"><span>REPORT · ${escapeHtml(item.reason)}</span><time>${escapeHtml(formatDate(item.created_at))}</time></div><h4>${escapeHtml(item.reporter_name || '社区用户')} 举报 ${escapeHtml(item.reported_user_name || '社区用户')}</h4>${comment?.content ? `<div class="community-review-description">被举报评论（已隐藏）：${escapeHtml(comment.content)}</div>` : '<div class="community-review-description">账号举报：目标账号已进入冻结状态。</div>'}${item.details ? `<p>${escapeHtml(item.details)}</p>` : ''}<textarea class="community-review-note" maxlength="2000" placeholder="处理备注（可选）"></textarea><div class="community-review-actions"><button type="button" data-admin-action="review-report" data-review-id="${escapeHtml(item.id)}" data-decision="upheld">举报成立 · 永久封禁</button><button class="is-danger" type="button" data-admin-action="review-report" data-review-id="${escapeHtml(item.id)}" data-decision="dismissed">驳回 · 恢复账号</button></div></article>`;
}

function appealReviewMarkup(item) {
  const ban = Array.isArray(item.ban) ? item.ban[0] : item.ban;
  return `<article class="community-review-card community-appeal-card" data-review-card="appeal">
    <div class="community-review-card-top"><span>BAN APPEAL</span><time>${escapeHtml(formatDate(item.created_at))}</time></div>
    <h4>${escapeHtml(item.display_name || '社区用户')}</h4><p>${escapeHtml(item.email || '邮箱信息不可用')}</p>
    <div class="community-application-answer"><strong>原封禁原因</strong><p>${escapeHtml(ban?.reason || '永久封禁')}</p><strong>用户申诉</strong><p>${escapeHtml(item.message)}</p></div>
    <textarea class="community-review-note" maxlength="2000" placeholder="返回给申诉用户的审核说明（可选）"></textarea>
    <fieldset class="profile-appeal-fandom"><legend>拒绝申诉时必须勾选毒唯归属</legend><label><input type="radio" name="fandom-${escapeHtml(item.id)}" value="ayanga" /> 阿云嘎</label><label><input type="radio" name="fandom-${escapeHtml(item.id)}" value="zhengyunlong" /> 郑云龙</label></fieldset>
    <div class="community-review-actions"><button type="button" data-admin-action="review-appeal" data-review-id="${escapeHtml(item.id)}" data-decision="accepted">接受申诉 · 恢复账号</button><button class="is-danger" type="button" data-admin-action="review-appeal" data-review-id="${escapeHtml(item.id)}" data-decision="rejected">拒绝申诉</button></div>
  </article>`;
}

function questionReviewMarkup(item) {
  const labels = { pending: '待一级审核', approved: '已进入备选题库', rejected: '未通过' };
  const reviewActions = item.status === 'pending' && can('review_questions')
    ? `<textarea class="community-review-note" maxlength="2000" placeholder="审核备注（可选）"></textarea><div class="community-review-actions"><button type="button" data-admin-action="review-question" data-review-id="${escapeHtml(item.id)}" data-decision="approved">通过并入库</button><button class="is-danger" type="button" data-admin-action="review-question" data-review-id="${escapeHtml(item.id)}" data-decision="rejected">拒绝</button></div>`
    : '';
  const managementActions = item.status === 'approved' && item.is_active && can('review_questions')
    ? `<textarea class="community-question-prompt" minlength="10" maxlength="500">${escapeHtml(item.prompt)}</textarea><div class="community-review-actions community-question-actions"><button type="button" data-admin-action="edit-question" data-question-id="${escapeHtml(item.id)}">保存编辑</button><button class="is-danger" type="button" data-admin-action="delete-question" data-question-id="${escapeHtml(item.id)}">删除问题</button></div>`
    : `<div class="community-review-description">${escapeHtml(item.prompt)}</div>`;
  return `<article class="community-review-card" data-review-card="question"><div class="community-review-card-top"><span>${escapeHtml(questionSiteLabels[item.site_id] || '审核问题')}</span><span>${escapeHtml(labels[item.status] || item.status)}</span></div>${managementActions}${reviewActions}</article>`;
}

function userManagementMarkup(item) {
  const ownAccount = item.id === account?.user?.id;
  return `<article class="community-review-card community-user-card" data-user-card><div class="community-review-card-top"><span>${escapeHtml(groupLabels[item.user_group] || (item.email_confirmed_at ? 'EMAIL VERIFIED' : 'EMAIL PENDING'))}</span><span>${escapeHtml(statusLabels[item.status] || item.status || '未知')}</span></div><h4>${escapeHtml(item.display_name || '新用户')}</h4><p>${escapeHtml(item.email || '邮箱信息不可用')}</p><div class="community-role-control"><select data-management-select ${ownAccount || item.management_level === 1 ? 'disabled' : ''}><option value="" ${item.management_level == null ? 'selected' : ''}>普通用户</option><option value="2" ${item.management_level === 2 ? 'selected' : ''}>二级管理员</option><option value="3" ${item.management_level === 3 ? 'selected' : ''}>三级管理员</option><option value="1" ${item.management_level === 1 ? 'selected' : ''} disabled>一级管理员</option></select>${ownAccount || item.management_level === 1 ? '<span>一级管理员账号受保护</span>' : `<button type="button" data-admin-action="save-management-level" data-user-id="${escapeHtml(item.id)}">保存权限</button>`}</div></article>`;
}

function backgroundManagementMarkup() {
  return `<section class="community-review-section is-category profile-background-manager">
    <div class="community-review-heading"><div><h3>全站背景</h3><p>上传一次即可同步应用到首页、地球、地图、分类、讨论区、用户页和巡演地图。</p></div><span>仅一级管理员</span></div>
    <div class="profile-background-preview" style="background-image:url('${escapeHtml(siteBackgroundUrl)}')" role="img" aria-label="当前全站背景预览"></div>
    <form class="profile-background-form" data-background-form>
      <label><span>选择新的背景图片或 GIF</span><input type="file" name="background" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" required /><small>支持 JPG、PNG、WebP、AVIF、GIF，最大 25 MB。</small></label>
      <button class="community-submit" type="submit">上传并应用到全站 <span>→</span></button>
      <p class="profile-background-state" data-background-state>当前背景已经由所有页面共享。</p>
    </form>
  </section><section class="community-review-section is-category profile-promotion-manager"><div class="community-review-heading"><div><h3>加载宣传版面</h3><p>进入活动地球时全屏展示至少 2 秒，支持静态图片和 GIF 动图。</p></div><span>仅一级管理员</span></div>${promotionUrl ? `<img class="profile-promotion-preview" src="${escapeHtml(promotionUrl)}" alt="当前宣传版面" />` : ''}<form class="profile-background-form" data-promotion-form><label><span>选择宣传图片或 GIF</span><input type="file" name="promotion" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" required /></label><button class="community-submit" type="submit">上传并启用 <span>→</span></button><p class="profile-background-state" data-promotion-state></p></form></section>`;
}

function announcementAudienceOptions(selected = 'all') {
  return Object.entries(announcementAudienceLabels).map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function announcementCardMarkup(item) {
  return `<article class="community-review-card profile-announcement-card" data-announcement-card>
    <div class="community-review-card-top"><span>${escapeHtml(announcementAudienceLabels[item.audience] || '通知')}</span><time>${escapeHtml(formatDate(item.published_at))}</time></div>
    <form class="profile-announcement-form" data-admin-announcement-form data-announcement-id="${escapeHtml(item.id)}">
      <label><span>通知标题</span><input name="title" maxlength="200" required value="${escapeHtml(item.title)}" /></label>
      <label><span>发布对象</span><select name="audience">${announcementAudienceOptions(item.audience)}</select></label>
      <label class="is-wide"><span>通知内容</span><textarea name="message" maxlength="10000" required rows="6">${escapeHtml(item.message)}</textarea></label>
      ${item.image_url ? `<img class="profile-announcement-image is-wide" src="${escapeHtml(item.image_url)}" alt="通知配图" />` : ''}
      <label class="is-wide"><span>通知图片或 GIF（可选）</span><input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" /></label>
      <div class="community-review-actions is-wide"><button type="submit">保存修改</button><button class="is-danger" type="button" data-admin-action="delete-announcement" data-announcement-id="${escapeHtml(item.id)}">删除通知</button></div>
    </form>
  </article>`;
}

function announcementManagementMarkup(items) {
  return `<section class="community-review-section is-category profile-announcement-manager">
    <div class="community-review-heading"><div><h3>发布站内通知</h3><p>通知将按用户身份显示在双人地球中央；访客关闭一次后，同一条通知不再自动弹出。</p></div><span>仅一级管理员</span></div>
    <form class="profile-announcement-form is-create" data-admin-announcement-form>
      <label><span>通知标题</span><input name="title" maxlength="200" required placeholder="输入通知标题" /></label>
      <label><span>发布对象</span><select name="audience">${announcementAudienceOptions()}</select></label>
      <label class="is-wide"><span>通知内容</span><textarea name="message" maxlength="10000" required rows="6" placeholder="输入需要发布的通知内容"></textarea></label>
      <label class="is-wide"><span>通知图片或 GIF（可选）</span><input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" /></label>
      <button class="community-submit is-wide" type="submit">立即发布 <span>→</span></button>
    </form>
    <div class="community-review-heading profile-announcement-history"><h3>已发布通知</h3><span>${items.length} 条</span></div>
    <div class="community-review-list">${items.length ? items.map(announcementCardMarkup).join('') : '<div class="community-empty-inline">当前还没有已发布通知。</div>'}</div>
  </section>`;
}

function adminContentMarkup() {
  if (!can('admin')) return '<div class="profile-notification-empty"><span>!</span><h3>没有管理员权限</h3><p>审核工作台仅对管理员账号开放。</p></div>';
  if (adminLoading && !adminLoaded) return '<div class="community-loading">正在加载审核队列…</div>';
  if (adminError) return `<div class="community-error"><h3>审核队列加载失败</h3><p>${escapeHtml(adminError)}</p><button type="button" data-admin-action="reload-admin">重新加载</button></div>`;

  const { applications, submissions, reports, appeals, questions, users, announcements } = adminQueues;
  const level = account.management_level;
  const pendingQuestions = questions.filter((item) => item.status === 'pending' && item.site_id === COMMUNITY_CONFIG.siteId);
  const approvedQuestions = questions.filter((item) => item.status === 'approved' && item.is_active && item.site_id === COMMUNITY_CONFIG.siteId);
  const sections = [
    !IS_PERSONAL_SITE && level === 1 ? { id: 'register', label: '代注册账号', count: '+' } : null,
    can('review_accounts') ? { id: 'applications', label: '账号审核', count: applications.length } : null,
    can('review_submissions') ? { id: 'submissions', label: '投稿审核', count: submissions.length } : null,
    can('handle_reports') ? { id: 'reports', label: '举报处理', count: reports.length } : null,
    !IS_PERSONAL_SITE && can('handle_reports') ? { id: 'appeals', label: '封禁申诉', count: appeals.length } : null,
    can('submit_questions') ? { id: 'questions', label: '问题库', count: pendingQuestions.length } : null,
    !IS_PERSONAL_SITE && can('manage_roles') ? { id: 'users', label: '用户权限', count: users.length } : null,
    (can('manage_site_background') || level === 1) ? { id: 'appearance', label: '网站背景', count: 0 } : null,
    (can('manage_announcements') || level === 1) ? { id: 'announcements', label: '通知发布', count: announcements.length } : null,
  ].filter(Boolean);
  if (!sections.some((item) => item.id === adminSection)) adminSection = sections[0]?.id || 'submissions';
  const empty = (message) => `<div class="community-empty-inline">${message}</div>`;
  const sectionMarkup = {
    register: `<section class="community-review-section is-category"><div class="community-review-heading"><div><h3>帮助用户注册账号</h3><p>创建后系统会向该邮箱发送验证邮件。用户点击邮件后返回网站，即可正常登录并等待账号审核。</p></div><span>仅一级管理员</span></div><form class="community-form profile-admin-register-form" data-admin-register-form><label><span>用户邮箱</span><input type="email" name="email" autocomplete="off" required placeholder="name@example.com"></label><label><span>临时密码</span><input type="password" name="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="至少 8 位，请安全地告知用户"></label><label class="is-wide"><span>默认审核问题</span><input type="text" value="你为什么喜欢龙龙和嘎嘎呢？" readonly></label><label class="is-wide"><span>用户的回答（200–5000 字）</span><textarea name="answer" minlength="200" maxlength="5000" rows="8" required placeholder="请填写用户对默认问题的回答，至少 200 字"></textarea></label><button class="community-submit is-wide" type="submit">创建账号并发送验证邮件 <span>→</span></button></form></section>`,
    applications: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>账号申请</h3><span>${applications.length} 个待处理</span></div><div class="community-review-list">${applications.length ? applications.map(accountApplicationMarkup).join('') : empty('当前没有待审核账号。')}</div></section>`,
    submissions: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>投稿申请</h3><span>${submissions.length} 个待处理</span></div><div class="community-review-list">${submissions.length ? submissions.map(submissionReviewMarkup).join('') : empty('当前没有待审核投稿。')}</div></section>`,
    reports: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>举报处理</h3><span>${reports.length} 个待处理</span></div><div class="community-review-list">${reports.length ? reports.map(reportReviewMarkup).join('') : empty('当前没有待处理举报。')}</div></section>`,
    appeals: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>封禁申诉</h3><span>${appeals.length} 个待处理</span></div><div class="community-review-list">${appeals.length ? appeals.map(appealReviewMarkup).join('') : empty('当前没有待审核申诉。')}</div></section>`,
    questions: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>添加本站审核问题</h3><span>${level === 1 ? '直接进入本站题库' : '需一级管理员审核'}</span></div><form class="community-form community-question-form" data-admin-question-form><textarea name="prompt" minlength="10" maxlength="500" required rows="3" placeholder="输入注册者需要回答的问题（10—500 字）"></textarea><button class="community-submit" type="submit">${level === 1 ? '添加到本站题库' : '提交问题提案'} <span>→</span></button></form><div class="community-question-group"><div class="community-review-heading"><h3>待审核问题</h3><span>${pendingQuestions.length} 个</span></div><div class="community-review-list">${pendingQuestions.length ? pendingQuestions.map(questionReviewMarkup).join('') : empty('当前没有待审核问题。')}</div></div><div class="community-question-group"><div class="community-review-heading"><h3>${questionSiteLabels[COMMUNITY_CONFIG.siteId]}</h3><span>${approvedQuestions.length} 个可用</span></div><div class="community-review-list">${approvedQuestions.length ? approvedQuestions.map(questionReviewMarkup).join('') : empty('本站当前没有已通过问题。')}</div></div></section>`,
    users: `<section class="community-review-section is-category"><div class="community-review-heading"><h3>全部账号与权限</h3><span>${users.length} 个账号</span></div><div class="community-review-list">${users.length ? users.map(userManagementMarkup).join('') : empty('没有账号数据。')}</div></section>`,
    appearance: backgroundManagementMarkup(),
    announcements: announcementManagementMarkup(announcements),
  }[adminSection] || '';
  return `<div class="profile-admin-shell"><div class="community-page-intro community-admin-intro"><span class="community-page-icon">${level}</span><div><h3>${level}级管理员工作台</h3><p>${level === 1 ? '账号、权限、问题库、举报与封禁申诉的全部审核功能。' : level === 2 ? '账号与投稿审核、举报与申诉处理及问题提案。' : '投稿审核、举报处理与封禁申诉。'}</p></div></div><nav class="community-admin-categories" aria-label="审核分类">${sections.map((item) => `<button type="button" data-admin-section="${item.id}" class="${adminSection === item.id ? 'is-active' : ''}"><span>${escapeHtml(item.label)}</span><em>${item.count}</em></button>`).join('')}</nav>${sectionMarkup}</div>`;
}

async function loadAdminQueues(renderWhileLoading = true) {
  if (!can('admin')) return;
  adminLoading = true;
  adminError = '';
  if (renderWhileLoading) renderProfile();
  try {
    const optionalQueue = (request, name) => Promise.resolve(request).catch((error) => {
      console.warn(`${name}加载失败：`, error.message);
      return [];
    });
    const requests = {
      applications: can('review_accounts') ? optionalQueue(api('/v1/admin/applications'), '账号审核') : Promise.resolve([]),
      submissions: can('review_submissions') ? optionalQueue(api('/v1/admin/submissions'), '投稿审核') : Promise.resolve([]),
      reports: can('handle_reports') ? optionalQueue(api('/v1/admin/reports'), '举报处理') : Promise.resolve([]),
      appeals: Promise.resolve([]),
      questions: can('submit_questions') ? optionalQueue(api('/v1/admin/questions'), '问题库') : Promise.resolve([]),
      users: !IS_PERSONAL_SITE && can('manage_roles') ? optionalQueue(api('/v1/admin/users'), '用户权限') : Promise.resolve([]),
      announcements: (can('manage_announcements') || account?.management_level === 1) ? optionalQueue(api('/v1/admin/announcements'), '通知发布') : Promise.resolve([]),
    };
    const [applications, submissions, reports, appeals, questions, users, announcements] = await Promise.all([requests.applications, requests.submissions, requests.reports, requests.appeals, requests.questions, requests.users, requests.announcements]);
    adminQueues = { applications: applications || [], submissions: submissions || [], reports: reports || [], appeals: appeals || [], questions: questions || [], users: users || [], announcements: announcements || [] };
    adminLoaded = true;
  } catch (error) {
    adminError = error.message || '请求失败';
  } finally {
    adminLoading = false;
    renderProfile();
  }
}

function renderProfile() {
  const { user, profile, management_level: level } = account;
  const avatarUrl = publicAvatarUrl(profile.avatar_key);
  const profileLocked = Boolean(account?.moderation?.active_report || account?.moderation?.active_ban);
  const memberSince = profile.created_at ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(profile.created_at)) : '—';
  const roleLabel = level ? managementLabels[level] : statusLabels[profile.status] || '社区成员';
  const unread = Number(notificationState.unread_count || 0);
  const headings = {
    profile: ['个人主页', '管理你在 Musical Atlas 社区中的公开身份。'],
    notifications: ['通知中心', '集中查看账号与社区流程状态。'],
    admin: ['审核工作台', '处理账号、投稿、举报、审核问题和用户权限。'],
  };
  const [heading, description] = headings[activeTab] || headings.profile;
  app.innerHTML = `
    <header class="profile-heading"><p>ACCOUNT PROFILE</p><h1>${heading}</h1><small>${description}</small></header>
    <div class="profile-layout">
      <aside class="profile-sidebar">
        <div class="profile-avatar-shell" data-avatar-shell>
          ${avatarUrl ? `<img class="profile-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(profile.display_name)}的头像" />` : `<div class="profile-avatar-fallback">${escapeHtml(initials(profile.display_name))}</div>`}
          ${profileLocked ? '' : '<label class="profile-avatar-edit" title="更换头像">✎<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-avatar-input aria-label="上传新头像" /></label>'}
        </div>
        <div class="profile-identity"><h2>${profile.user_group === 'yunv' ? '<img class="profile-group-icon" src="/assets/icons/yunv-cloud-star.svg" alt="" />' : profile.user_group === 'cloud' ? '☁ ' : '⭐ '}${escapeHtml(profile.display_name)}</h2><p>${escapeHtml(user.email || '')}</p><span class="profile-role">${escapeHtml(groupLabels[profile.user_group] || '云女 · 三个网站')} · ${escapeHtml(roleLabel)}</span><div class="profile-upload-state" data-upload-state>支持 JPG、PNG、WebP、AVIF，最大 5 MB</div></div>
        <div class="profile-meta"><span>◷ ${escapeHtml(memberSince)}加入</span><span>◇ 账号状态：${escapeHtml(statusLabels[profile.status] || profile.status)}</span></div>
      </aside>
      <section class="profile-main">
        <div class="profile-tabs"><button class="${activeTab === 'profile' ? 'is-active' : ''}" type="button" data-profile-tab="profile">个人资料</button><button class="${activeTab === 'notifications' ? 'is-active' : ''}" type="button" data-profile-tab="notifications">通知${unread ? `<em>${unread > 99 ? '99+' : unread}</em>` : ''}</button>${can('admin') ? `<button class="${activeTab === 'admin' ? 'is-active' : ''}" type="button" data-profile-tab="admin">审核工作台</button>` : ''}</div>
        ${activeTab === 'notifications' ? notificationContentMarkup() : activeTab === 'admin' ? adminContentMarkup() : profileContentMarkup(user, profile)}
      </section>
    </div>`;
  updateNotificationBadges();
}

async function loadProfile() {
  account = await api('/v1/me');
  if (!(account.site_access || []).includes(COMMUNITY_CONFIG.siteId)) throw new Error('当前账号没有阿云嘎个人站权限');
  if (activeTab === 'admin' && !can('admin')) activeTab = 'profile';
  [profileCounts, notificationState] = await Promise.all([
    loadCounts(account.user.id),
    api('/v1/notifications?limit=100'),
  ]);
  signoutButton.hidden = false;
  if (activeTab === 'admin') await loadAdminQueues(false);
  else renderProfile();
}

async function saveProfile(form) {
  const displayName = String(new FormData(form).get('displayName') || '').trim();
  if (!displayName || [...displayName].length > 80) return toast('昵称长度需要在 1—80 个字符之间', true);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('user_id', account.user.id);
    if (error) throw error;
    account.profile.display_name = displayName;
    document.title = `${displayName} · Musical Atlas`;
    toast('昵称已更新');
    renderProfile();
  } catch (error) {
    button.disabled = false;
    toast(error.message || '昵称更新失败', true);
  }
}

async function updatePassword(form) {
  const values = Object.fromEntries(new FormData(form));
  if (values.password !== values.confirmPassword) return toast('两次输入的新密码不一致', true);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) throw error;
    form.reset();
    toast('密码已更新');
  } catch (error) {
    toast(error.message || '密码更新失败', true);
  } finally {
    button.disabled = false;
  }
}

async function uploadAvatar(file) {
  const state = document.querySelector('[data-upload-state]');
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
  if (!allowed.includes(file.type)) return toast('请选择 JPG、PNG、WebP、AVIF 或 GIF 图片', true);
  if (file.size > 5 * 1024 * 1024) return toast('头像不能超过 5 MB', true);
  if (state) { state.textContent = '正在上传并校验头像…'; state.classList.remove('is-error'); }
  try {
    const signed = await api('/v1/uploads/sign', {
      method: 'POST',
      body: JSON.stringify({ purpose: 'avatar', content_type: file.type, byte_size: file.size }),
    });
    const upload = await fetch(signed.upload_url, { method: signed.method || 'PUT', headers: signed.headers || { 'Content-Type': file.type }, body: file });
    if (!upload.ok) throw new Error('头像上传到媒体库失败');
    const completed = await api('/v1/uploads/complete', { method: 'POST', body: JSON.stringify({ media_id: signed.media_id }) });
    account.profile.avatar_key = completed.object_key;
    toast('头像已更新');
    renderProfile();
  } catch (error) {
    if (state) { state.textContent = error.message || '头像上传失败'; state.classList.add('is-error'); }
    toast(error.message || '头像上传失败', true);
  }
}

async function uploadSiteBackground(form) {
  if (account?.management_level !== 1) return toast('只有一级管理员可以更改全站背景', true);
  const file = new FormData(form).get('background');
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  if (!(file instanceof File) || !file.size) return toast('请选择一张背景图片', true);
  if (!allowed.includes(file.type)) return toast('请选择 JPG、PNG、WebP 或 AVIF 图片', true);
  if (file.size > 25 * 1024 * 1024) return toast('背景图片不能超过 25 MB', true);
  const button = form.querySelector('button[type="submit"]');
  const state = form.querySelector('[data-background-state]');
  button.disabled = true;
  if (state) state.textContent = '正在上传背景并进行文件校验…';
  try {
    const signed = await api('/v1/uploads/sign', {
      method: 'POST',
      body: JSON.stringify({ purpose: 'site_background', content_type: file.type, byte_size: file.size }),
    });
    const upload = await fetch(signed.upload_url, {
      method: signed.method || 'PUT',
      headers: signed.headers || { 'Content-Type': file.type },
      body: file,
    });
    if (!upload.ok) throw new Error('背景图片上传到媒体库失败');
    await api('/v1/uploads/complete', { method: 'POST', body: JSON.stringify({ media_id: signed.media_id }) });
    const setting = await api('/v1/admin/site-background', { method: 'POST', body: JSON.stringify({ media_id: signed.media_id }) });
    siteBackgroundUrl = setting.background_url;
    setSiteBackground(siteBackgroundUrl);
    form.reset();
    toast('全站背景已更新');
    renderProfile();
  } catch (error) {
    button.disabled = false;
    if (state) state.textContent = error.message || '背景更新失败';
    toast(error.message || '背景更新失败', true);
  }
}

async function saveAnnouncement(form) {
  if (account?.management_level !== 1) return toast('只有一级管理员可以发布通知', true);
  const values = new FormData(form);
  const payload = {
    title: String(values.get('title') || '').trim(),
    message: String(values.get('message') || '').trim(),
    audience: String(values.get('audience') || 'all'),
    site_ids: [COMMUNITY_CONFIG.siteId],
  };
  if (!payload.title || !payload.message) return toast('请填写通知标题和内容', true);
  const id = form.dataset.announcementId;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const image = values.get('image');
    if (image instanceof File && image.size) { if (image.size > 8 * 1024 * 1024) throw new Error('通知图片不能超过 8 MB'); const signed=await api('/v1/uploads/sign',{method:'POST',body:JSON.stringify({purpose:'announcement_image',content_type:image.type,byte_size:image.size})}); const upload=await fetch(signed.upload_url,{method:signed.method||'PUT',headers:signed.headers||{'Content-Type':image.type},body:image}); if(!upload.ok)throw new Error('通知图片上传失败'); await api('/v1/uploads/complete',{method:'POST',body:JSON.stringify({media_id:signed.media_id})}); payload.image_media_id=signed.media_id; }
    await api(id ? `/v1/admin/announcements/${encodeURIComponent(id)}/edit` : '/v1/admin/announcements', {
      method: 'POST', body: JSON.stringify(payload),
    });
    toast(id ? '通知已修改' : '通知已发布');
    await reloadAdminQueues();
  } catch (error) {
    button.disabled = false;
    toast(error.message || '通知保存失败', true);
  }
}

async function deleteAnnouncement(button) {
  if (account?.management_level !== 1) return;
  const id = button.dataset.announcementId;
  if (!id || !window.confirm('确定删除这条已发布通知吗？删除后所有用户都无法再查看。')) return;
  button.disabled = true;
  try {
    await api(`/v1/admin/announcements/${encodeURIComponent(id)}/delete`, { method: 'POST', body: JSON.stringify({}) });
    toast('通知已删除');
    await reloadAdminQueues();
  } catch (error) {
    button.disabled = false;
    toast(error.message || '通知删除失败', true);
  }
}

app.addEventListener('submit', async (event) => {
  if (event.target.matches('[data-promotion-form]')) { event.preventDefault(); await uploadPromotion(event.target); }
  if (event.target.matches('[data-password-form]')) {
    event.preventDefault();
    await updatePassword(event.target);
  }
  if (event.target.matches('[data-admin-register-form]')) {
    event.preventDefault();
    await registerUserForAdmin(event.target);
  }
  if (event.target.matches('[data-profile-form]')) {
    event.preventDefault();
    await saveProfile(event.target);
  }
  if (event.target.matches('[data-admin-question-form]')) {
    event.preventDefault();
    await submitReviewQuestion(event.target);
  }
  if (event.target.matches('[data-appeal-form]')) {
    event.preventDefault();
    await submitAppeal(event.target);
  }
  if (event.target.matches('[data-background-form]')) {
    event.preventDefault();
    await uploadSiteBackground(event.target);
  }
  if (event.target.matches('[data-admin-announcement-form]')) {
    event.preventDefault();
    await saveAnnouncement(event.target);
  }
});

async function uploadPromotion(form) {
  const file = new FormData(form).get('promotion'); const button = form.querySelector('button'); const state = form.querySelector('[data-promotion-state]');
  if (!(file instanceof File) || !file.size) return;
  button.disabled = true;
  try { const signed = await api('/v1/uploads/sign', { method:'POST', body:JSON.stringify({ purpose:'promotion_image', content_type:file.type, byte_size:file.size }) }); const upload = await fetch(signed.upload_url,{ method:signed.method||'PUT',headers:signed.headers||{'Content-Type':file.type},body:file }); if(!upload.ok) throw new Error('宣传图片上传失败'); await api('/v1/uploads/complete',{method:'POST',body:JSON.stringify({media_id:signed.media_id})}); const setting=await api('/v1/admin/site-promotion',{method:'POST',body:JSON.stringify({media_id:signed.media_id})}); promotionUrl=setting.promotion_url; toast('宣传版面已更新'); renderProfile(); } catch(error){button.disabled=false;if(state)state.textContent=error.message;toast(error.message,true);}
}

app.addEventListener('change', async (event) => {
  if (!event.target.matches('[data-avatar-input]')) return;
  const [file] = event.target.files || [];
  if (file) await uploadAvatar(file);
});

async function selectTab(tab) {
  activeTab = tab === 'admin' && can('admin') ? 'admin' : tab === 'notifications' ? 'notifications' : 'profile';
  const url = new URL(window.location.href);
  if (activeTab !== 'profile') url.searchParams.set('tab', activeTab);
  else url.searchParams.delete('tab');
  if (activeTab === 'admin') url.searchParams.set('section', adminSection);
  else url.searchParams.delete('section');
  url.searchParams.delete('confirmed');
  window.history.replaceState({}, document.title, url);
  renderProfile();
  if (activeTab === 'admin' && !adminLoaded && !adminLoading) await loadAdminQueues();
}

async function reloadAdminQueues() {
  adminLoaded = false;
  await loadAdminQueues();
}

async function handleAdminReview(button, kind) {
  if (!button || !can('admin')) return;
  const card = button.closest('[data-review-card]');
  const note = card?.querySelector('.community-review-note')?.value.trim() || '';
  const { decision, reviewId: id } = button.dataset;
  if (!id || !decision) return;
  card?.querySelectorAll('button').forEach((item) => { item.disabled = true; });
  const paths = {
    account: `/v1/admin/applications/${encodeURIComponent(id)}/review`,
    submission: `/v1/admin/submissions/${encodeURIComponent(id)}/review`,
    report: `/v1/admin/reports/${encodeURIComponent(id)}/review`,
    question: `/v1/admin/questions/${encodeURIComponent(id)}/review`,
  };
  try {
    await api(paths[kind], { method: 'POST', body: JSON.stringify({ decision, review_note: note || null }) });
    const messages = { account: '账号审核已完成', submission: '投稿审核已完成', report: '举报处理已完成', question: '问题审核已完成' };
    toast(messages[kind] || '操作已完成');
    await reloadAdminQueues();
  } catch (error) {
    card?.querySelectorAll('button').forEach((item) => { item.disabled = false; });
    toast(error.message, true);
  }
}

async function handleAppealReview(button) {
  if (!button || !can('handle_reports')) return;
  const card = button.closest('[data-review-card="appeal"]');
  const note = card?.querySelector('.community-review-note')?.value.trim() || '';
  const { decision, reviewId: id } = button.dataset;
  const fandom = card?.querySelector('input[type="radio"]:checked')?.value || null;
  if (decision === 'rejected' && !fandom) return toast('拒绝申诉前必须勾选阿云嘎或郑云龙毒唯', true);
  card?.querySelectorAll('button, input').forEach((item) => { item.disabled = true; });
  try {
    await api(`/v1/admin/appeals/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, review_note: note || null, fandom: decision === 'rejected' ? fandom : null }),
    });
    toast(decision === 'accepted' ? '申诉已接受，账号权限已恢复' : '申诉已拒绝，结果通知已发送');
    await reloadAdminQueues();
  } catch (error) {
    card?.querySelectorAll('button, input').forEach((item) => { item.disabled = false; });
    toast(error.message, true);
  }
}

async function submitAppeal(form) {
  const message = String(new FormData(form).get('message') || '').trim();
  if ([...message].length < 20) return toast('申诉说明至少需要 20 字', true);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('/v1/appeals', { method: 'POST', body: JSON.stringify({ message }) });
    toast('申诉已提交，管理员会重新审核');
    await loadProfile();
  } catch (error) {
    button.disabled = false;
    toast(error.message, true);
  }
}

async function handleManagementLevel(button) {
  if (!button || !can('manage_roles')) return;
  const card = button.closest('[data-user-card]');
  const raw = card?.querySelector('[data-management-select]')?.value ?? '';
  const level = raw ? Number(raw) : null;
  button.disabled = true;
  try {
    await api(`/v1/admin/users/${encodeURIComponent(button.dataset.userId)}/management-level`, { method: 'POST', body: JSON.stringify({ level }) });
    toast(level ? `已设置为${level}级管理员` : '已恢复为普通用户');
    await reloadAdminQueues();
  } catch (error) {
    button.disabled = false;
    toast(error.message, true);
  }
}

async function handleQuestionEdit(button) {
  if (!button || !can('review_questions')) return;
  const card = button.closest('[data-review-card="question"]');
  const prompt = card?.querySelector('.community-question-prompt')?.value.trim() || '';
  if ([...prompt].length < 10) return toast('审核问题至少需要 10 字', true);
  card?.querySelectorAll('button').forEach((item) => { item.disabled = true; });
  try {
    await api(`/v1/admin/questions/${encodeURIComponent(button.dataset.questionId)}/edit`, { method: 'POST', body: JSON.stringify({ prompt }) });
    toast('审核问题已更新');
    await reloadAdminQueues();
  } catch (error) {
    card?.querySelectorAll('button').forEach((item) => { item.disabled = false; });
    toast(error.message, true);
  }
}

async function handleQuestionDelete(button) {
  if (!button || !can('review_questions')) return;
  if (!window.confirm('确定删除这道审核问题吗？历史申请中的问题快照会保留。')) return;
  const card = button.closest('[data-review-card="question"]');
  card?.querySelectorAll('button').forEach((item) => { item.disabled = true; });
  try {
    await api(`/v1/admin/questions/${encodeURIComponent(button.dataset.questionId)}/delete`, { method: 'POST', body: JSON.stringify({}) });
    toast('审核问题已删除');
    await reloadAdminQueues();
  } catch (error) {
    card?.querySelectorAll('button').forEach((item) => { item.disabled = false; });
    toast(error.message, true);
  }
}

async function submitReviewQuestion(form) {
  const values = new FormData(form);
  const prompt = String(values.get('prompt') || '').trim();
  const site_id = COMMUNITY_CONFIG.siteId;
  if ([...prompt].length < 10) return toast('审核问题至少需要 10 字', true);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('/v1/admin/questions', { method: 'POST', body: JSON.stringify({ prompt, site_id }) });
    toast(account.management_level === 1 ? '问题已加入备选题库' : '问题已提交一级管理员审核');
    await reloadAdminQueues();
  } catch (error) {
    button.disabled = false;
    toast(error.message, true);
  }
}

async function registerUserForAdmin(form) {
  const values = new FormData(form);
  const email = String(values.get('email') || '').trim();
  const password = String(values.get('password') || '');
  const answer = String(values.get('answer') || '').trim();
  if ([...answer].length < 200) return toast('默认问题的回答至少需要 200 字', true);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('/v1/admin/users/register', { method: 'POST', body: JSON.stringify({ email, password, answer }) });
    form.reset();
    toast('账号已创建，验证邮件已经发送');
  } catch (error) {
    toast(error.message || '代注册失败', true);
  } finally {
    button.disabled = false;
  }
}

async function markNotificationRead(id) {
  const item = notificationState.items.find((entry) => entry.id === id);
  if (!item || item.read_at) return;
  try {
    const updated = await api(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: JSON.stringify({}) });
    item.read_at = updated.read_at;
    notificationState.unread_count = Math.max(0, Number(notificationState.unread_count || 0) - 1);
    renderProfile();
  } catch (error) {
    toast(error.message || '通知更新失败', true);
  }
}

async function markAllNotificationsRead() {
  try {
    await api('/v1/notifications/read-all', { method: 'POST', body: JSON.stringify({}) });
    const readAt = new Date().toISOString();
    notificationState.items.forEach((item) => { if (!item.read_at) item.read_at = readAt; });
    notificationState.unread_count = 0;
    renderProfile();
    toast('所有通知已标为已读');
  } catch (error) {
    toast(error.message || '通知更新失败', true);
  }
}

app.addEventListener('click', async (event) => {
  const tab = event.target.closest('[data-profile-tab]')?.dataset.profileTab;
  if (tab) await selectTab(tab);
  const section = event.target.closest('[data-admin-section]')?.dataset.adminSection;
  if (section) {
    adminSection = section;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'admin');
    url.searchParams.set('section', section);
    window.history.replaceState({}, document.title, url);
    renderProfile();
  }
  const notificationId = event.target.closest('[data-notification-id]')?.dataset.notificationId;
  if (notificationId) {
    const notification = notificationState.items.find((item) => item.id === notificationId);
    await markNotificationRead(notificationId);
    const queue = notification?.metadata?.queue;
    if (queue && can('admin')) {
      adminSection = queue;
      await selectTab('admin');
    }
  }
  if (event.target.closest('[data-action="read-all-notifications"]')) await markAllNotificationsRead();
  const adminActionButton = event.target.closest('[data-admin-action]');
  const adminAction = adminActionButton?.dataset.adminAction;
  if (adminAction === 'review-account') await handleAdminReview(adminActionButton, 'account');
  if (adminAction === 'review-submission') await handleAdminReview(adminActionButton, 'submission');
  if (adminAction === 'review-report') await handleAdminReview(adminActionButton, 'report');
  if (adminAction === 'review-appeal') await handleAppealReview(adminActionButton);
  if (adminAction === 'review-question') await handleAdminReview(adminActionButton, 'question');
  if (adminAction === 'save-management-level') await handleManagementLevel(adminActionButton);
  if (adminAction === 'edit-question') await handleQuestionEdit(adminActionButton);
  if (adminAction === 'delete-question') await handleQuestionDelete(adminActionButton);
  if (adminAction === 'delete-announcement') await deleteAnnouncement(adminActionButton);
  if (adminAction === 'reload-admin') await reloadAdminQueues();
});

notificationLink.addEventListener('click', (event) => {
  if (!account) return;
  event.preventDefault();
  void selectTab('notifications');
});

signoutButton.addEventListener('click', async () => {
  await supabase.auth.signOut();
  account = null;
  renderSignedOut();
  toast('已退出当前账号');
});

async function init() {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.56.0');
    supabase = createClient(COMMUNITY_CONFIG.supabaseUrl, COMMUNITY_CONFIG.supabasePublishableKey, {
      auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return renderSignedOut();
    await loadProfile();
    if (new URLSearchParams(window.location.search).get('confirmed') === '1') {
      toast('邮箱确认成功，账号申请已进入审核队列');
    }
    if (new URLSearchParams(window.location.search).get('password') === 'updated') toast('密码更新成功');
  } catch (error) {
    app.innerHTML = `<section class="profile-error"><div class="profile-empty-card"><span>!</span><h1>资料加载失败</h1><p>${escapeHtml(error.message || '请稍后重试')}</p><a href="/profile/">重新加载</a></div></section>`;
  }
}

init();

window.addEventListener('focus', async () => {
  if (!account) return;
  try {
    notificationState = await api('/v1/notifications?limit=100');
    if (activeTab === 'admin') updateNotificationBadges();
    else renderProfile();
  } catch { /* keep the current page state when a background refresh fails */ }
});
