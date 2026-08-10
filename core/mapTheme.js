export const MAP_THEME = {
  space: {
    center: '#0d2037',
    middle: '#071423',
    edge: '#020711'
  },
  ocean: {
    light: '#174f75',
    middle: '#0b3556',
    deep: '#05192c'
  },
  land: {
    south: '#3f7a45',
    central: '#688749',
    north: '#9c8952',
    northeast: '#78835f',
    polar: '#dce9e3'
  },
  border: {
    country: 'rgba(155, 211, 237, 0.76)',
    province: 'rgba(221, 232, 217, 0.27)'
  },
  category: {
    音乐剧: '#ff5d8f',
    综艺: '#42c9e8',
    晚会: '#f5bd4f'
  },
  text: {
    primary: '#eef6fb',
    muted: '#8fa3b5'
  }
};

export function landColorByLatitude(latitude) {
  const absLat = Math.abs(latitude);

  if (absLat > 68) return MAP_THEME.land.polar;
  if (absLat > 48) return MAP_THEME.land.northeast;
  if (absLat > 34) return MAP_THEME.land.north;
  if (absLat > 18) return MAP_THEME.land.central;
  return MAP_THEME.land.south;
}

export function categoryColor(category) {
  return MAP_THEME.category[category] ?? '#b9d2df';
}
