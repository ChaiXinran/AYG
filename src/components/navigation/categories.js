export const CATEGORY_PAGES = [
  { id: 'musical', label: '音乐剧', icon: 'M', match: (event) => event.category === '音乐剧' || String(event.title).includes('音乐剧') },
  { id: 'song', label: '歌曲', icon: '♪', match: (event) => /歌曲|演唱|首唱|单曲|主题曲/.test(`${event.title} ${event.description}`) },
  { id: 'variety', label: '综艺', icon: '◇', match: (event) => event.category === '综艺' || /综艺|节目|录制/.test(`${event.title} ${event.description}`) },
  { id: 'film', label: '影视作品', icon: '▣', match: (event) => /电影|电视剧|影视|剧集|角色/.test(`${event.title} ${event.description}`) },
  { id: 'stage', label: '舞台', icon: '△', match: (event) => ['晚会', '音乐会'].includes(event.category) || /舞台|盛典|晚会|音乐会/.test(`${event.title} ${event.description}`) }
];

export function getCategoryPage(id) {
  return CATEGORY_PAGES.find((item) => item.id === id) || CATEGORY_PAGES[0];
}
