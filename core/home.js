import { COMMUNITY_CONFIG } from './config/community.js';
import { applySiteBackground } from './config/siteBackground.js';
await applySiteBackground();
const target=document.querySelector('[data-home-announcements]');
const escape=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{const r=await fetch(`${COMMUNITY_CONFIG.apiBaseUrl}/v1/announcements?site_id=${COMMUNITY_CONFIG.siteId}&limit=6`);const p=await r.json();const items=p?.data?.items||[];target.innerHTML=`<h2>站内通知</h2>${items.length?items.map(x=>`<article><strong>${escape(x.title)}</strong><p>${escape(x.message)}</p>${x.image_url?`<img src="${escape(x.image_url)}" alt="通知配图">`:''}</article>`).join(''):'<p>当前没有新通知。</p>'}`}catch{target.innerHTML='<h2>站内通知</h2><p>通知暂时无法读取。</p>'}
