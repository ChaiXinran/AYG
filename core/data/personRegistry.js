import * as ayanga from './artists/ayanga.js';
import * as zhengYunlong from './artists/zhengyunlong.js';
import { backgroundsFor } from '../config/backgrounds.js';

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
    backgrounds: backgroundsFor('ayanga'),
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
    backgrounds: backgroundsFor('zhengyunlong'),
  },
];

export function activePerson() {
  const folderPerson = window.location.pathname.split('/').find((part) => part === 'ayg' || part === 'zyl');
  const hostPerson = window.location.hostname.startsWith('aygmusical.')
    ? 'ayanga'
    : /^(zylmusical|zyldl)\./.test(window.location.hostname)
      ? 'zhengyunlong'
      : '';
  const requested = new URLSearchParams(window.location.search).get('person')
    || hostPerson
    || ({ ayg: 'ayanga', zyl: 'zhengyunlong' }[folderPerson])
    || localStorage.getItem('event-earth-person');
  return people.find((person) => person.id === requested) || people[0];
}

export function personUrl(personId, href = window.location.href) {
  const url = new URL(href, window.location.href);
  const page = url.pathname.split('/').pop() || 'index.html';
  const currentFolder = window.location.pathname.split('/').find((part) => part === 'ayg' || part === 'zyl');
  const targetFolder = personId === 'ayanga' ? 'ayg' : 'zyl';
  const productionHost = personId === 'ayanga' ? 'aygmusical.ranyechai.site' : 'zylmusical.ranyechai.site';

  url.searchParams.delete('person');
  if (window.location.hostname.endsWith('ranyechai.site') && window.location.hostname !== 'musical.ranyechai.site') {
    return `https://${productionHost}/${page}${url.search}${url.hash}`;
  }
  if (currentFolder) return `${currentFolder === targetFolder ? './' : `../${targetFolder}/`}${page}${url.search}${url.hash}`;
  return `./${targetFolder}/${page}${url.search}${url.hash}`;
}
