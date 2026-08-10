import { scheduleEvents, unmappedEvents as registeredUnmappedEvents } from './scheduleRegistry.js';

const hasPublicLocation = (event) => ![event.city, event.venue]
  .filter(Boolean)
  .some((value) => String(value).includes('未公开'));

export const hiddenLocationEvents = scheduleEvents.filter((event) => !hasPublicLocation(event));
export const events = [...scheduleEvents];
export const unmappedEvents = [...registeredUnmappedEvents];
