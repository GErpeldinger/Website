import type { ContextSource } from '../brain/behaviour';
import type { EventBus } from '../events/event_bus';
import type { GameEvents } from '../events/game_events';

declare module '../brain/behaviour' {
    interface ContextFields {
        // The ids of the behaviours the monkey is in at this moment (an interrupted one that will
        // resume is not).
        readonly running: readonly string[];
        // Game time of the last piece put back home; absent before the first.
        readonly restoredAt: number;
    }
}

export interface MonkeyActivity {
    source: ContextSource;
    stop: () => void;
}

// What the monkey's behaviours need to know of what just happened: which ones are running, and
// when a piece was last restored. It listens to the bus, so no behaviour has to.
export const monkeyActivity = (
    events: EventBus<GameEvents>,
    now: () => number,
): MonkeyActivity => {
    const running = new Set<string>();
    let restoredAt: number | undefined;
    const off = [
        events.on('behaviour.started', ({ actor, id }) => {
            if (actor === 'monkey') {
                running.add(id);
            }
        }),
        events.on('behaviour.ended', ({ actor, id }) => {
            if (actor === 'monkey') {
                running.delete(id);
            }
        }),
        events.on('item.restored', () => {
            restoredAt = now();
        }),
    ];
    return {
        source: () => ({
            running: [...running],
            ...(restoredAt === undefined ? {} : { restoredAt }),
        }),
        stop: (): void => {
            for (const unsubscribe of off) {
                unsubscribe();
            }
        },
    };
};
