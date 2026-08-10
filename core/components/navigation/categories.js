export const CATEGORY_PAGES = [
  { id: 'musical', label: '音乐剧', icon: 'M', collection: 'events', match: (item) => item.category === '音乐剧' },
  { id: 'drama', label: '话剧', icon: '剧', collection: 'events', match: (item) => item.category === '话剧' },
  { id: 'concert', label: '演唱会/Gala', icon: 'G', collection: 'events', match: (item) => item.category === '音乐会' },
  { id: 'film', label: '影视作品', icon: '▣', collection: 'screenWorks' },
  { id: 'gala', label: '晚会', icon: '晚', collection: 'events', match: (item) => item.category === '晚会' },
  { id: 'variety', label: '综艺', icon: '◇', collection: 'events', match: (item) => item.category === '综艺' },
  { id: 'ost', label: 'OST', icon: 'O', collection: 'soundtracks' },
  { id: 'single', label: '单曲', icon: '♪', collection: 'singles' },
  { id: 'business', label: '商务活动', icon: '商', collection: 'events', match: (item) => item.category === '商务活动' },
];

export const CATEGORY_GROUPS = [
  { id: 'theatre', label: '剧场见', icon: '剧', children: ['musical', 'drama'] },
  { id: 'stage', label: '舞台', icon: '台', children: ['concert', 'gala'] },
  { id: 'film-group', label: '影视作品', icon: '▣', category: 'film' },
  { id: 'variety-group', label: '综艺', icon: '◇', category: 'variety' },
  { id: 'songs', label: '歌曲', icon: '♪', children: ['ost', 'single'] },
  { id: 'business-group', label: '商务活动', icon: '商', category: 'business' },
];

export function getCategoryPage(id) {
  return CATEGORY_PAGES.find((item) => item.id === id) || CATEGORY_PAGES[0];
}

export function getCategoryItems(person, category) {
  const items = person[category.collection] || [];
  return category.match ? items.filter(category.match) : [...items];
}
