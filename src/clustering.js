/**
 * 一个很轻量的“屏幕空间聚合”算法。
 *
 * 逻辑：
 * 1. 先把经纬度投影成当前屏幕坐标；
 * 2. 若两点距离小于 thresholdPx，则归到同一 cluster；
 * 3. 地球越放大，threshold 越小，于是 cluster 会自然展开。
 *
 * 后面数据量很大时，可以替换成 supercluster / quadtree。
 */
export function clusterProjectedEvents(events, projection, thresholdPx) {
  const projected = events
    .map((event) => {
      const point = projection([event.lon, event.lat]);
      return point ? { event, x: point[0], y: point[1] } : null;
    })
    .filter(Boolean);

  const used = new Set();
  const clusters = [];

  for (let i = 0; i < projected.length; i += 1) {
    if (used.has(i)) continue;

    const members = [projected[i]];
    used.add(i);

    let changed = true;
    while (changed) {
      changed = false;

      for (let j = 0; j < projected.length; j += 1) {
        if (used.has(j)) continue;

        const candidate = projected[j];
        const nearAnyMember = members.some((member) => {
          const dx = candidate.x - member.x;
          const dy = candidate.y - member.y;
          return Math.hypot(dx, dy) <= thresholdPx;
        });

        if (nearAnyMember) {
          members.push(candidate);
          used.add(j);
          changed = true;
        }
      }
    }

    const x = members.reduce((sum, item) => sum + item.x, 0) / members.length;
    const y = members.reduce((sum, item) => sum + item.y, 0) / members.length;
    const lon = members.reduce((sum, item) => sum + item.event.lon, 0) / members.length;
    const lat = members.reduce((sum, item) => sum + item.event.lat, 0) / members.length;

    clusters.push({
      id: members.map((item) => item.event.id).sort((a, b) => a - b).join('-'),
      x,
      y,
      lon,
      lat,
      events: members.map((item) => item.event)
    });
  }

  return clusters;
}
