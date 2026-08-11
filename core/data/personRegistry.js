import * as ayanga from './artists/ayanga.js';
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
];

export function activePerson() {
  return people[0];
}

export function personUrl(_personId, href = window.location.href) {
  const url = new URL(href, window.location.href);
  const page = url.pathname.split('/').pop() || 'index.html';

  url.searchParams.delete('person');
  return `./${page}${url.search}${url.hash}`;
}
