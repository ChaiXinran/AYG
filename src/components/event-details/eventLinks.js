function urlsFrom(value) {
  return String(value || '')
    .match(/https?:\/\/[^\s]+/g)
    ?.map((url) => url.replace(/[，。；;、）)\]】]+$/g, '')) || [];
}

export function getEventLinks(event) {
  const links = [];
  const seen = new Set();
  const add = (values, type, label) => {
    (values || []).flatMap(urlsFrom).forEach((url) => {
      if (seen.has(url)) return;
      seen.add(url);
      links.push({ url, type, label: `${label}${links.filter((item) => item.type === type).length + 1}` });
    });
  };
  add(event.sourceUrls, 'source', '信息来源 ');
  add(event.mediaUrls, 'media', '图片/视频 ');
  return links;
}

export function fillEventLinks(container, event) {
  container.replaceChildren();
  getEventLinks(event).forEach(({ url, type, label }) => {
    const anchor = document.createElement('a');
    anchor.className = `event-detail-link event-detail-link-${type}`;
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = label;
    container.append(anchor);
  });
  container.hidden = container.childElementCount === 0;
}
