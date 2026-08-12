import { CommunityClient } from '../components/community/communityClient.js?v=13';
import { applySiteBackground } from '../config/siteBackground.js';

await applySiteBackground();

const client = new CommunityClient();
await client.init().catch((error) => console.warn('社区账号初始化失败：', error.message));

const app = document.querySelector('#submissionApp');
const toastElement = document.querySelector('.submission-toast');
const privateCategories = ['音乐剧', '话剧', '歌剧', '戏曲', '演唱会', 'Gala', '晚会', '其它线下活动'];
const PERSONAL_SITE_ID = 'ayg';
const PERSONAL_PERSON_ID = 'ayanga';
const publicCategories = ['音乐剧', '话剧', '演唱会/Gala', '影视作品', '晚会', '综艺', 'OST', '单曲', '商务活动'];
let turnstileWidget = null;
let toastTimer = 0;

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function toast(message, error = false) {
  window.clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.toggle('is-error', error);
  toastElement.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toastElement.classList.remove('is-visible'), 5200);
}

document.querySelector('[data-back]').addEventListener('click', () => {
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/';
});

const accountName = client.user?.display_name || client.user?.user_metadata?.display_name || client.user?.email?.split('@')[0];
if (accountName) document.querySelector('[data-account-link]').textContent = accountName;

if (!client.user || !client.isApproved()) {
  const signedIn = Boolean(client.user);
  app.innerHTML = `<section class="submission-access-gate">
    <span>${signedIn ? 'ACCOUNT REVIEW' : 'SIGN IN REQUIRED'}</span>
    <h1>${signedIn ? '账号审核通过后开放投稿' : '登录后添加活动'}</h1>
    <p>${signedIn ? '私人活动和公开投稿功能仅向已通过账号审核的成员开放。' : '请先登录或注册账号；账号通过管理员审核后即可使用投稿功能。'}</p>
    <div><a href="${signedIn ? '/profile/' : '/?community=account'}">${signedIn ? '查看审核状态' : '登录或注册'}</a><a class="is-secondary" href="/">返回活动地球</a></div>
  </section>`;
} else {
  await renderForm();
}

async function ensureTurnstile() {
  if (window.turnstile) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });
}

async function renderTurnstile(form) {
  if (client.isDemo()) return;
  const container = form.querySelector('#submissionTurnstile');
  try {
    await ensureTurnstile();
    if (turnstileWidget != null) {
      try { window.turnstile.remove(turnstileWidget); } catch { /* old form was removed */ }
    }
    container.textContent = '';
    turnstileWidget = window.turnstile.render(container, {
      sitekey: client.config.turnstileSiteKey,
      theme: 'dark',
      action: 'event_submission',
      retry: 'auto',
      callback: (token) => { form.elements.turnstile_token.value = token; },
      'expired-callback': () => { form.elements.turnstile_token.value = ''; },
      'error-callback': () => { form.elements.turnstile_token.value = ''; return true; },
    });
  } catch {
    container.textContent = '安全验证加载失败，请刷新页面后重试。';
  }
}

async function renderForm() {
  app.innerHTML = `<section class="submission-hero">
      <span>阿云嘎 · CONTRIBUTION</span>
      <h1>添加活动</h1>
      <p>记录，也可以补充公开活动档案。</p>
    </section>
    <section class="submission-workspace">
      <form class="submission-form" data-submission-form>
        <div class="submission-mode-switch" role="group" aria-label="投稿可见范围">
          <label><input type="radio" name="submission_scope" value="private" checked /><span><strong>私人投稿</strong><small>仅自己可见 · 立即进入个人地球 · 无需审核</small></span></label>
          <label><input type="radio" name="submission_scope" value="public" /><span><strong>公开投稿</strong><small>管理员审核后同步到公开地球与分类卡片</small></span></label>
        </div>

        <section class="public-options" data-public-only hidden>
          <div class="submission-kind-switch">
            <label><input type="radio" name="submission_kind" value="create" checked /><span>添加公开活动</span></label>
            <label><input type="radio" name="submission_kind" value="edit" /><span>申请编辑已有活动</span></label>
          </div>
          <label class="form-field" data-edit-only hidden><span>要编辑的公开活动</span><select name="target_event_id"><option value="">正在载入公开活动…</option></select></label>
          <fieldset class="person-choice"><legend>活动人物</legend><p>个人站公开投稿固定归属本站人物，审核后自动同步到双人站。</p><input type="hidden" name="person_ids" value="ayg" />
            
            
          </fieldset>
        </section>

        <label class="form-field form-field-wide"><span>活动名称</span><input name="title" maxlength="200" required placeholder="活动、演出或作品名称" /></label>
        <div class="form-grid">
          <label class="form-field"><span>活动分类</span><select name="category" required>${privateCategories.map((value) => `<option>${value}</option>`).join('')}</select></label>
          <label class="form-field"><span>日期</span><input name="date" type="date" required /></label>
          <label class="form-field"><span>具体时间</span><input name="time" type="time" required /></label>
          <label class="form-field"><span>结束时间（可选）</span><input name="end_time" type="datetime-local" /></label>
          <label class="form-field"><span>国家</span><input name="country" maxlength="100" value="中国" required /></label>
          <label class="form-field"><span>城市</span><input name="city" maxlength="100" required placeholder="上海" /></label>
        </div>
        <label class="form-field form-field-wide"><span>场馆</span><input name="venue" maxlength="200" list="submissionVenueOptions" required placeholder="输入或从该城市已有场馆中选择" /><datalist id="submissionVenueOptions"></datalist><small data-venue-hint>填写城市后可从已有场馆中选择；选择后自动填写经纬度。</small></label>
        <div class="form-grid coordinate-grid">
          <label class="form-field"><span>纬度</span><input name="latitude" type="number" min="-90" max="90" step="0.000001" required placeholder="31.230416" /></label>
          <label class="form-field"><span>经度</span><input name="longitude" type="number" min="-180" max="180" step="0.000001" required placeholder="121.473701" /></label>
        </div>
        <label class="form-field form-field-wide"><span>活动简介</span><textarea name="description" maxlength="10000" rows="6" placeholder="活动内容、角色、场次或其它补充信息"></textarea></label>
        <label class="form-field form-field-wide"><span>媒体链接</span><textarea name="media_links" rows="4" placeholder="每行填写一个链接，可添加多个"></textarea></label>
        <label class="form-field form-field-wide image-field"><span>活动图片</span><input name="images" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple /><small>可以上传多张图片；第一张将作为结点详情和活动卡片背景，单张不超过 25 MB。</small></label>
        ${client.isDemo() ? '<p class="submission-note">演示模式：内容只保存在当前浏览器。</p><input type="hidden" name="turnstile_token" value="demo-token" />' : '<div id="submissionTurnstile" class="submission-turnstile">正在加载安全验证…</div><input type="hidden" name="turnstile_token" />'}
        <button class="submission-submit" type="submit"><span data-submit-label>保存到个人地球</span><span>→</span></button>
      </form>
      <aside class="submission-guide"><span>HOW IT WORKS</span><h2>投稿说明</h2><ol><li><strong>私人投稿</strong><p>不经过管理员审核，只在你的个人地球和个人地图中显示结点，不生成公开卡片。</p></li><li><strong>公开新增</strong><p>选择人物后提交；审核通过即同步至双人站及对应个人站。</p></li><li><strong>公开编辑</strong><p>选择已有活动并修改；管理员会看到修改前后的逐项对比。</p></li><li><strong>图片与贡献</strong><p>第一张图片作为背景；公开投稿通过后会显示你的贡献者头像。</p></li></ol></aside>
    </section>`;

  const form = app.querySelector('[data-submission-form]');
  let publicEvents = [];
  let venues = [];
  const publicOnly = form.querySelector('[data-public-only]');
  const editOnly = form.querySelector('[data-edit-only]');
  const targetSelect = form.elements.target_event_id;
  const categorySelect = form.elements.category;

  const setCategories = (values, selected = '') => {
    const options = selected && !values.includes(selected) ? [selected, ...values] : values;
    categorySelect.innerHTML = options.map((value) => `<option${value === selected ? ' selected' : ''}>${value}</option>`).join('');
  };
  const syncMode = () => {
    const isPublic = form.elements.submission_scope.value === 'public';
    const isEdit = isPublic && form.elements.submission_kind.value === 'edit';
    publicOnly.hidden = !isPublic;
    editOnly.hidden = !isEdit;
    targetSelect.required = isEdit;
    setCategories(isPublic ? publicCategories : privateCategories, categorySelect.value);
    form.querySelector('[data-submit-label]').textContent = isPublic ? '提交管理员审核' : '保存到个人地球';
  };
  const prefill = () => {
    const event = publicEvents.find((item) => item.communityId === targetSelect.value);
    if (!event) return;
    form.elements.title.value = event.title || '';
    setCategories(publicCategories, event.category || '');
    form.elements.date.value = event.date || '';
    form.elements.time.value = event.startTime?.slice(11, 16) || '19:30';
    form.elements.country.value = event.country || '';
    form.elements.city.value = event.city || '';
    form.elements.venue.value = event.venue || '';
    form.elements.latitude.value = event.lat ?? '';
    form.elements.longitude.value = event.lon ?? '';
    form.elements.description.value = event.description || '';
    form.elements.media_links.value = (event.sourceUrls || []).join('\n');
  };

  form.querySelectorAll('[name="submission_scope"]').forEach((input) => input.addEventListener('change', syncMode));
  form.querySelectorAll('[name="submission_kind"]').forEach((input) => input.addEventListener('change', () => { syncMode(); if (form.elements.submission_kind.value === 'edit') prefill(); }));
  targetSelect.addEventListener('change', prefill);
  form.elements.city.addEventListener('change', async () => {
    venues = await client.listVenues(form.elements.city.value).catch(() => []);
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
  form.addEventListener('submit', submitForm);

  publicEvents = await client.listEvents().catch(() => []);
  targetSelect.innerHTML = '<option value="">请选择活动</option>' + publicEvents.map((event) => `<option value="${escapeHtml(event.communityId)}">${escapeHtml([event.date, event.title, event.city].filter(Boolean).join(' · '))}</option>`).join('');
  syncMode();
  await renderTurnstile(form);
}

async function submitForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const scope = data.get('submission_scope') || 'private';
  const kind = scope === 'public' ? data.get('submission_kind') || 'create' : 'create';
  const personIds = ['ayg'];
  if (scope === 'public' && !personIds.length) return toast('公开投稿请至少选择一位人物', true);
  if (kind === 'edit' && !data.get('target_event_id')) return toast('请选择要编辑的公开活动', true);
  const links = String(data.get('media_links') || '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const token = client.isDemo() ? 'demo-token' : data.get('turnstile_token') || '';
  if (!token) return toast('请先完成安全验证', true);

  const input = {
    submission_scope: scope,
    submission_kind: kind,
    target_event_id: kind === 'edit' ? data.get('target_event_id') : null,
    person_ids: scope === 'public' ? personIds : [],
    proposed_sites: ['duo'],
    title: data.get('title'), category: data.get('category'),
    start_time: new Date(`${data.get('date')}T${data.get('time')}:00`).toISOString(),
    end_time: data.get('end_time') ? new Date(String(data.get('end_time'))).toISOString() : null,
    venue: data.get('venue') || null, city: data.get('city') || null, country: data.get('country') || null,
    latitude: Number(data.get('latitude')), longitude: Number(data.get('longitude')),
    description: data.get('description') || '', source_url: links[0] || null, media_links: links,
    payload_json: {}, turnstile_token: token,
  };
  const button = form.querySelector('[type="submit"]');
  const label = form.querySelector('[data-submit-label]');
  button.disabled = true;
  label.textContent = '正在保存…';
  try {
    const submission = await client.submitEvent(input);
    const images = [...(form.elements.images.files || [])];
    let warning = '';
    if (images.length) {
      label.textContent = `正在上传 ${images.length} 张图片…`;
      try { await client.uploadSubmissionImages(submission.id, images); }
      catch (error) { warning = `；活动已保存，但图片上传失败：${error.message}`; }
    }
    toast(scope === 'private' ? `私人活动已加入个人地球${warning}` : `公开投稿已进入管理员审核队列${warning}`, Boolean(warning));
    await renderForm();
  } catch (error) {
    toast(error.message, true);
    button.disabled = false;
    label.textContent = scope === 'private' ? '保存到个人地球' : '提交管理员审核';
    if (turnstileWidget != null && window.turnstile) window.turnstile.reset(turnstileWidget);
  }
}
