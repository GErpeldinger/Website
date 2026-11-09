import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { monkeyActivity } from '../../../../assets/game/ports/monkey_activity';

const setup = (): {
    events: EventBus<GameEvents>;
    activity: ReturnType<typeof monkeyActivity>;
    time: { now: number };
} => {
    const events = new EventBus<GameEvents>();
    const time = { now: 0 };
    return { events, time, activity: monkeyActivity(events, () => time.now) };
};

const started = (
    actor: string,
    id: string,
): GameEvents['behaviour.started'] => ({
    actor,
    id,
    kind: 'activity',
    resumed: false,
});
const ended = (actor: string, id: string): GameEvents['behaviour.ended'] => ({
    actor,
    id,
    kind: 'activity',
    by: 'done',
});

describe('what the monkey is doing, as a context source', () => {
    it('knows nothing before anything happens', () => {
        expect(setup().activity.source()).toStrictEqual({ running: [] });
    });

    it('lists the monkey’s running behaviours, from their start to their end', () => {
        const { events, activity } = setup();

        events.emit('behaviour.started', started('monkey', 'monkey/a'));
        events.emit('behaviour.started', started('monkey', 'monkey/b'));
        events.emit('behaviour.ended', ended('monkey', 'monkey/a'));

        expect(activity.source()).toEqual({ running: ['monkey/b'] });
    });

    it('ignores the other actors', () => {
        const { events, activity } = setup();

        events.emit('behaviour.started', started('drone', 'drone/a'));
        events.emit('behaviour.started', started('monkey', 'monkey/a'));
        events.emit('behaviour.ended', ended('drone', 'monkey/a'));

        expect(activity.source()).toEqual({ running: ['monkey/a'] });
    });

    it('remembers when a piece was last put home', () => {
        const { events, activity, time } = setup();

        time.now = 1200;
        events.emit('item.restored', { id: 0, kind: 'block' });
        time.now = 3000;
        expect(activity.source()).toEqual({ running: [], restoredAt: 1200 });
        events.emit('item.restored', { id: 1, kind: 'link' });

        expect(activity.source().restoredAt).toBe(3000);
    });

    it('stops listening', () => {
        const { events, activity } = setup();
        activity.stop();

        events.emit('behaviour.started', started('monkey', 'monkey/a'));
        events.emit('item.restored', { id: 0, kind: 'block' });

        expect(activity.source()).toEqual({ running: [] });
    });
});
