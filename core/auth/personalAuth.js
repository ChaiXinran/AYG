import { COMMUNITY_CONFIG } from '../config/community.js';

const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function messageFor(error) {
  const message = String(error?.message || '操作失败，请稍后重试');
  const translations = [
    [/invalid login credentials/i, '邮箱或密码不正确'],
    [/email not confirmed/i, '邮箱尚未确认，请先打开确认邮件'],
    [/user already registered/i, '该邮箱已经注册，请直接登录'],
    [/rate limit/i, '邮件发送过于频繁，请稍后再试'],
    [/captcha/i, '安全验证未通过，请重新验证'],
    [/failed to fetch|network|load failed/i, '网络连接失败，请检查网络后重试'],
  ];
  return translations.find(([pattern]) => pattern.test(message))?.[1] || message;
}

export async function mountPersonalAuth({ button }) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.56.0');
  const supabase = createClient(COMMUNITY_CONFIG.supabaseUrl, COMMUNITY_CONFIG.supabasePublishableKey, { auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  let question = null;
  let view = 'signin';
  let widgetId = null;
  const layer = document.createElement('div');
  layer.className = 'personal-auth-layer';
  layer.hidden = true;
  document.body.append(layer);

  const redirectUrl = () => {
    const url = new URL(window.location.href);
    url.search = '?community=account';
    url.hash = '';
    return url.toString();
  };

  async function accessForSession(session) {
    if (!session) return null;
    const response = await fetch(`${COMMUNITY_CONFIG.apiBaseUrl}/v1/me`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) return null;
    return (await response.json()).data;
  }

  async function refreshButton() {
    const { data } = await supabase.auth.getSession();
    const account = await accessForSession(data.session);
    if (account?.site_access?.includes(COMMUNITY_CONFIG.siteId)) {
      const group = account.profile.user_group;
      button.innerHTML = `${group === 'cloud' ? '☁' : group === 'star' ? '⭐' : '☁✦'} ${escapeHtml(account.profile.display_name)}`;
      button.dataset.signedIn = 'true';
    } else {
      button.textContent = '登录 / 注册';
      button.dataset.signedIn = 'false';
    }
  }

  async function loadQuestion() {
    question = null;
    render();
    try {
      const response = await fetch(`${COMMUNITY_CONFIG.apiBaseUrl}/v1/auth/review-question?site_id=${COMMUNITY_CONFIG.siteId}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || '问题加载失败');
      question = payload.data;
    } catch {
      question = COMMUNITY_CONFIG.fallbackQuestion;
    }
    render();
  }

  function resetTurnstile() {
    if (widgetId != null && window.turnstile) { try { window.turnstile.remove(widgetId); } catch {} }
    widgetId = null;
  }

  function renderTurnstile() {
    const container = layer.querySelector('[data-turnstile]');
    if (!container) return;
    const mount = () => {
      resetTurnstile();
      widgetId = window.turnstile.render(container, { sitekey: COMMUNITY_CONFIG.turnstileSiteKey, action: view === 'signup' ? `signup_${COMMUNITY_CONFIG.siteId}` : `signin_${COMMUNITY_CONFIG.siteId}`, callback: (token) => { const input = layer.querySelector('[name="captchaToken"]'); if (input) input.value = token; } });
    };
    if (window.turnstile) return mount();
    if (!document.querySelector('script[data-personal-turnstile]')) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true; script.defer = true; script.dataset.personalTurnstile = 'true';
      script.addEventListener('load', mount, { once: true });
      document.head.append(script);
    } else {
      const timer = window.setInterval(() => { if (window.turnstile) { window.clearInterval(timer); mount(); } }, 100);
      window.setTimeout(() => window.clearInterval(timer), 8000);
    }
  }

  function render(message = '', error = false) {
    resetTurnstile();
    const signup = view === 'signup';
    const questionMarkup = signup ? (question
      ? `<section class="personal-auth-question"><span>${question.fallback ? '默认审核问题' : '随机审核问题'}</span><strong>${escapeHtml(question.prompt)}</strong><input type="hidden" name="reviewQuestionId" value="${escapeHtml(question.id)}"><label>注册理由与回答<textarea name="reviewAnswer" minlength="200" maxlength="5000" rows="7" required placeholder="请认真回答，不少于 200 字"></textarea></label></section>`
      : '<div class="personal-auth-loading">正在加载本站审核问题…</div>') : '';
    layer.innerHTML = `<button class="personal-auth-backdrop" type="button" data-close aria-label="关闭"></button><section class="personal-auth-dialog"><button class="personal-auth-close" type="button" data-close>×</button><div class="personal-auth-group-icon">${COMMUNITY_CONFIG.groupIcon}</div><p class="personal-auth-eyebrow">${escapeHtml(COMMUNITY_CONFIG.groupName)} · ${escapeHtml(COMMUNITY_CONFIG.artistName)}个人站</p><h2>${signup ? `加入${escapeHtml(COMMUNITY_CONFIG.groupName)}` : '登录社区账号'}</h2><p>${signup ? `审核通过后获得${escapeHtml(COMMUNITY_CONFIG.artistName)}个人站的社区权限。` : '三个网站共享同一个账号，但权限按注册来源划分。'}</p><nav><button type="button" data-view="signin" class="${signup ? '' : 'is-active'}">登录</button><button type="button" data-view="signup" class="${signup ? 'is-active' : ''}">注册</button></nav>${message ? `<div class="personal-auth-message ${error ? 'is-error' : ''}">${escapeHtml(message)}</div>` : ''}<form data-auth-form><label>社区昵称<input name="displayName" autocomplete="nickname" maxlength="80" ${signup ? 'required' : 'hidden'} placeholder="大家将看到这个名字"></label><label>邮箱<input name="email" type="email" autocomplete="email" required></label><label>密码<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required></label>${signup ? '<label>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>' : ''}${questionMarkup}<div class="personal-auth-turnstile" data-turnstile>正在加载安全验证…</div><input type="hidden" name="captchaToken"><button class="personal-auth-submit" type="submit" ${signup && !question ? 'disabled' : ''}>${signup ? '注册并发送确认邮件' : '登录'} →</button></form></section>`;
    layer.querySelectorAll('[data-close]').forEach((item) => item.addEventListener('click', close));
    layer.querySelectorAll('[data-view]').forEach((item) => item.addEventListener('click', () => { view = item.dataset.view; if (view === 'signup' && !question) loadQuestion(); else render(); }));
    layer.querySelector('[data-auth-form]').addEventListener('submit', submit);
    renderTurnstile();
  }

  async function submit(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.target));
    if (!fields.captchaToken) return render('请先完成安全验证', true);
    if (view === 'signup' && fields.password !== fields.confirmPassword) return render('两次输入的密码不一致', true);
    if (view === 'signup' && [...String(fields.reviewAnswer || '').trim()].length < 200) return render('问题回答至少需要 200 字', true);
    const submit = event.target.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (view === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: String(fields.email).trim().toLowerCase(), password: fields.password, options: { data: { display_name: fields.displayName, registration_site: COMMUNITY_CONFIG.siteId, review_question_id: fields.reviewQuestionId, review_answer: fields.reviewAnswer }, emailRedirectTo: redirectUrl(), captchaToken: fields.captchaToken } });
        if (error) throw error;
        if (!data.session) return render('确认邮件已发送。请打开邮件完成验证，随后等待管理员审核。');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: String(fields.email).trim().toLowerCase(), password: fields.password, options: { captchaToken: fields.captchaToken } });
        if (error) throw error;
        const account = await accessForSession(data.session);
        if (!account?.site_access?.includes(COMMUNITY_CONFIG.siteId)) {
          await supabase.auth.signOut();
          throw new Error(`这个账号没有${COMMUNITY_CONFIG.artistName}个人站权限，请前往注册来源网站使用。`);
        }
      }
      await refreshButton();
      close();
    } catch (error) {
      render(messageFor(error), true);
    }
  }

  function open() { layer.hidden = false; render(); }
  function close() { resetTurnstile(); layer.hidden = true; }
  button.addEventListener('click', async () => {
    if (button.dataset.signedIn === 'true') {
      if (window.confirm('要退出当前账号吗？')) { await supabase.auth.signOut(); await refreshButton(); }
    } else open();
  });
  await refreshButton();
  if (new URLSearchParams(window.location.search).get('community') === 'account') open();
  return { supabase, open };
}

