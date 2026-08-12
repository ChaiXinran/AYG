const PERSON_NAMES = Object.freeze({
  ayanga: '阿云嘎',
  zhengyunlong: '郑云龙',
});

export function eventPeople(event = {}) {
  const ids = Array.isArray(event.personIds) && event.personIds.length
    ? event.personIds
    : event.personId
      ? [event.personId]
      : [];
  return [...new Set(ids.filter(Boolean))];
}

export function eventKey(event = {}) {
  return String(event.communityId || event.id || 'unknown-event');
}

export function eventPersonName(event = {}) {
  return event.personName || eventPeople(event).map((id) => PERSON_NAMES[id] || id).join('、') || '人物待确认';
}

export async function loadEventCatalog(client, fallbackEvents = []) {
  const fallbackByCommunityId = new Map();
  fallbackEvents.forEach((event) => {
    if (!event.communityId) return;
    const list = fallbackByCommunityId.get(String(event.communityId)) || [];
    list.push(event);
    fallbackByCommunityId.set(String(event.communityId), list);
  });

  try {
    const liveEvents = await client.listEvents();
    if (!liveEvents.length) return [...fallbackEvents];
    return liveEvents.map((liveEvent) => {
      const fallbacks = fallbackByCommunityId.get(String(liveEvent.communityId)) || [];
      const fallback = fallbacks[0] || {};
      const personIds = [...new Set([
        ...eventPeople(liveEvent),
        ...fallbacks.flatMap(eventPeople),
      ])];
      return {
        ...fallback,
        ...liveEvent,
        id: `community:${liveEvent.communityId}`,
        sourceId: fallback.sourceId ?? fallback.id ?? null,
        personIds,
        personId: personIds[0] || fallback.personId || '',
        personName: liveEvent.personName || personIds.map((id) => PERSON_NAMES[id] || id).join('、') || '人物待确认',
        role: liveEvent.role || fallbacks.map((event) => event.role).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join('、'),
      };
    });
  } catch (error) {
    console.warn('活动目录同步失败，已使用本地历史数据：', error.message);
    return [...fallbackEvents];
  }
}
