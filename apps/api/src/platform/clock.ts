/** Injected time source. Domain and service code never calls `new Date()` directly. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** A controllable clock for tests. */
export function createFixedClock(start: Date | string) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set: (d: Date | string) => {
      current = new Date(d);
    },
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}
export type FixedClock = ReturnType<typeof createFixedClock>;
