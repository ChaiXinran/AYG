import * as ayanga from './artists/ayanga.js';
import * as zhengYunlong from './artists/zhengyunlong.js';

export const people = [
  {
    id: 'ayanga',
    name: '阿云嘎',
    subtitle: '从世界地图出发，追寻阿云嘎的公开演出足迹',
    events: ayanga.events,
    unmappedEvents: ayanga.unmappedEvents,
    screenWorks: ayanga.screenWorks,
    soundtracks: ayanga.soundtracks,
    singles: ayanga.singles,
  },
  {
    id: 'zhengyunlong',
    name: '郑云龙',
    subtitle: '从世界地图出发，追寻郑云龙的公开演出足迹',
    events: zhengYunlong.events,
    unmappedEvents: zhengYunlong.unmappedEvents,
    screenWorks: zhengYunlong.screenWorks,
    soundtracks: zhengYunlong.soundtracks,
    singles: zhengYunlong.singles,
  },
];

export function activePerson() {
  const requested = new URLSearchParams(window.location.search).get('person') || localStorage.getItem('event-earth-person');
  return people.find((person) => person.id === requested) || people[0];
}

export function personUrl(personId, href = window.location.href) {
  const url = new URL(href, window.location.href);
  url.searchParams.set('person', personId);
  return `${url.pathname.split('/').pop() || 'index.html'}${url.search}${url.hash}`;
}
