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
        expect(setup().activity.source()).toStrictEqual({
            running: [],
            away: {},
        });
    });

    it('lists the monkey’s running behaviours, from their start to their end', () => {
        const { events, activity } = setup();

        events.emit('behaviour.started', started('monkey', 'monkey/a'));
        events.emit('behaviour.started', started('monkey', 'monkey/b'));
        events.emit('behaviour.ended', ended('monkey', 'monkey/a'));

        expect(activity.source()).toEqual({ running: ['monkey/b'], away: {} });
    });

    it('ignores the other actors', () => {
        const { events, activity } = setup();

        events.emit('behaviour.started', started('drone', 'drone/a'));
        events.emit('behaviour.started', started('monkey', 'monkey/a'));
        events.emit('behaviour.ended', ended('drone', 'monkey/a'));

        expect(activity.source()).toEqual({ running: ['monkey/a'], away: {} });
    });

    it('remembers when a piece was last put home', () => {
        const { events, activity, time } = setup();

        time.now = 1200;
        events.emit('item.restored', { id: 0, kind: 'block' });
        time.now = 3000;
        expect(activity.source()).toEqual({
            running: [],
            away: {},
            restoredAt: 1200,
        });
        events.emit('item.restored', { id: 1, kind: 'link' });

        expect(activity.source().restoredAt).toBe(3000);
    });

    it('adds up the time a behaviour waited, interrupted and resumed', () => {
        const { events, activity, time } = setup();
        const resumed = { ...started('monkey', 'monkey/a'), resumed: true };
        events.emit('behaviour.started', started('monkey', 'monkey/a'));

        time.now = 1000;
        events.emit('behaviour.ended', {
            ...ended('monkey', 'monkey/a'),
            by: 'interrupted',
        });
        time.now = 1500;
        events.emit('behaviour.started', resumed);
        expect(activity.source().away).toEqual({ 'monkey/a': 500 });

        time.now = 2000;
        events.emit('behaviour.ended', {
            ...ended('monkey', 'monkey/a'),
            by: 'interrupted',
        });
        time.now = 2300;
        events.emit('behaviour.started', resumed);

        expect(activity.source().away).toEqual({ 'monkey/a': 800 });
    });

    it('counts no waiting for a behaviour that ended, or one that was not resumed', () => {
        const { events, activity, time } = setup();
        events.emit('behaviour.started', started('monkey', 'monkey/a'));
        time.now = 1000;
        events.emit('behaviour.ended', ended('monkey', 'monkey/a'));
        time.now = 1500;
        events.emit('behaviour.started', {
            ...started('monkey', 'monkey/a'),
            resumed: true,
        });
        events.emit('behaviour.ended', {
            ...ended('monkey', 'monkey/a'),
            by: 'interrupted',
        });
        time.now = 1800;
        events.emit('behaviour.started', started('monkey', 'monkey/a'));

        expect(activity.source().away).toEqual({});
    });

    it('does not count the other actors’ waiting', () => {
        const { events, activity, time } = setup();
        events.emit('behaviour.ended', {
            ...ended('drone', 'drone/a'),
            by: 'interrupted',
        });
        time.now = 900;
        events.emit('behaviour.started', {
            ...started('drone', 'drone/a'),
            resumed: true,
        });

        expect(activity.source().away).toEqual({});
    });

    it('stops listening', () => {
        const { events, activity } = setup();
        activity.stop();

        events.emit('behaviour.started', started('monkey', 'monkey/a'));
        events.emit('item.restored', { id: 0, kind: 'block' });

        expect(activity.source()).toEqual({ running: [], away: {} });
    });
});
