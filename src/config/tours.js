export const TOUR_MAPS = [
  { id: 'monte-cristo', personId: 'ayanga', label: '基督山伯爵', icon: '⛵' },
  { id: 'the-message', personId: 'ayanga', label: '风声', icon: '◆' },
  { id: 'phantom-of-opera', personId: 'ayanga', label: '剧院魅影中文版', icon: '🎭' },
  { id: 'on-the-road', personId: 'ayanga', label: '在远方', icon: '▣' },
  { id: 'bring-in-the-wine', personId: 'zhengyunlong', label: '将进酒', icon: '壶' },
  { id: 'the-magic-hour', personId: 'zhengyunlong', label: '魔幻时刻', icon: '帽' },
];

export function toursForPerson(personId) {
  return TOUR_MAPS.filter((tour) => tour.personId === personId);
}

export function defaultTourForPerson(personId) {
  return toursForPerson(personId)[0] || null;
}
