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
  const fallbackById = new Map();
  fallbackEvents.forEach((event) => {
    [event.id, event.sourceId].filter(Boolean).forEach((id) => fallbackById.set(String(id), event));
  });

  try {
    const liveEvents = await client.listEvents();
    if (!liveEvents.length) return [...fallbackEvents];
    const mergedLiveEvents = liveEvents.map((liveEvent) => {
      const fallbacks = (liveEvent.legacyIds || []).map((id) => fallbackById.get(String(id))).filter(Boolean);
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
    const importedLegacyIds = new Set(liveEvents.flatMap((event) => event.legacyIds || []).map(String));
    return [...mergedLiveEvents, ...fallbackEvents.filter((event) => {
      if (event.communityId) return !liveEvents.some((liveEvent) => String(liveEvent.communityId) === String(event.communityId));
      return ![event.id, event.sourceId].filter(Boolean).some((id) => importedLegacyIds.has(String(id)));
    })];
  } catch (error) {
    console.warn('活动目录同步失败，已使用本地历史数据：', error.message);
    return [...fallbackEvents];
  }
}
