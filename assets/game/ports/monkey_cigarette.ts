import type { ContextSource } from '../brain/behaviour';
import type { EventBus } from '../events/event_bus';
import type { GameEvents, Point } from '../events/game_events';

declare module '../brain/behaviour' {
    interface ContextFields {
        // The cigarette is lit in his mouth: it can be lost.
        readonly hasCigarette: boolean;
        // Where the one he dropped lies; absent while he has it in his mouth.
        readonly cigarette: Point;
        // Time for the next sneeze (it never comes in the first interval).
        readonly sneezeDue: boolean;
    }
}

// A sneeze comes every 45 to 75 s, from the prototype.
export const SNEEZE_LEAST = 45_000;
export const SNEEZE_SPREAD = 30_000;

export interface MonkeyCigarette {
    lit: boolean;
    lying: Point | undefined;
}

export interface CigaretteSource {
    source: ContextSource;
    stop: () => void;
}

// What his behaviours need to know of his cigarette: whether he has it lit, where it lies, and
// whether a sneeze is due. A sneeze is due once its interval has run out; every loss, a sneeze's
// included, starts a new one.
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
            const { lit, lying } = read();
            return {
                hasCigarette: lit,
                ...(lying === undefined ? {} : { cigarette: lying }),
                sneezeDue: now() >= sneezeAt,
            };
        },
        stop: off,
    };
};
