import type { ContextSource } from '../brain/behaviour';
import type { EventBus } from '../events/event_bus';
import type { GameEvents, Point } from '../events/game_events';

declare module '../brain/behaviour' {
    interface ContextFields {
        // The cigarette is lit in his mouth: it can be lost.
        readonly hasCigarette: boolean;
        // Where the one he dropped lies; absent while he has it in his mouth.
        readonly cigarette: Point;
        // The visitor has the dropped cigarette in hand.
        readonly cigaretteHeld: boolean;
        // Time for the next sneeze (it never comes in the first interval).
        readonly sneezeDue: boolean;
    }
}

// A sneeze comes every 45 to 75 s, from the prototype.
export const SNEEZE_LEAST = 45_000;
export const SNEEZE_SPREAD = 30_000;

// A cigarette at `cigarette` is within `reach` px of the top of the head at `head`: the snatch's
// distance, for the search that asks for it and the jump that ends on it.
export const withinReach = (
    cigarette: Point,
    head: Point,
    reach: number,
): boolean => Math.hypot(cigarette.x - head.x, cigarette.y - head.y) < reach;

export interface MonkeyCigarette {
    lit: boolean;
    lying: Point | undefined;
    held: boolean;
}

export interface CigaretteSource {
    source: ContextSource;
    stop: () => void;
}

// What his behaviours need to know of his cigarette: whether he has it lit, where it lies,
// whether the visitor holds it, and whether a sneeze is due. A sneeze is due once its interval
// has run out; every loss, a sneeze's included, starts a new one.
export const monkeyCigarette = (
    events: EventBus<GameEvents>,
    now: () => number,
    random: () => number,
    read: () => MonkeyCigarette,
): CigaretteSource => {
    const next = (): number => now() + SNEEZE_LEAST + random() * SNEEZE_SPREAD;
    let sneezeAt = next();
    const off = events.on('cig.lost', () => {
        sneezeAt = next();
    });
    return {
        source: (): ReturnType<ContextSource> => {
            const { lit, lying, held } = read();
            return {
                hasCigarette: lit,
                cigaretteHeld: held,
                ...(lying === undefined ? {} : { cigarette: lying }),
                sneezeDue: now() >= sneezeAt,
            };
        },
        stop: off,
    };
};
