import { describe, expect, it, vi } from 'vitest';
import comments from '../../../../../assets/game/activities/monkey/comments';
import flee from '../../../../../assets/game/activities/monkey/flee';
import { stage } from './stage';

const world = { pageWidth: 1000, monkeyX: 500 };

describe('the monkey fleeing a bomb', () => {
    it('shouts, then runs to the far side of the page, away from the bomb', () => {
        const { events, motor, log } = stage({ flee }, { context: world });

        events.emit('bomb.placed', { id: 1, at: { x: 300, y: 700 } });

        expect(log).toEqual(['+monkey/flee', 'run']);
        expect(motor.requests).toEqual([{ type: 'walk', x: 960, pace: 'run' }]);
        expect(motor.layers).toEqual(['body']);

        motor.finish();
        expect(log.at(-1)).toBe('-monkey/flee:done');
    });

    it('runs left when the bomb is on his right', () => {
        const { events, motor } = stage({ flee }, { context: world });

        events.emit('bomb.placed', { id: 1, at: { x: 700, y: 700 } });

        expect(motor.requests).toEqual([{ type: 'walk', x: 40, pace: 'run' }]);
    });

    it('takes the longer way when the bomb is level with him', () => {
        for (const { monkeyX, x } of [
            { monkeyX: 400, x: 960 },
            { monkeyX: 500, x: 40 },
            { monkeyX: 600, x: 40 },
        ]) {
            const { events, motor } = stage(
                { flee },
                { context: { pageWidth: 1000, monkeyX } },
            );

            events.emit('bomb.placed', { id: 1, at: { x: monkeyX, y: 700 } });

            expect(motor.requests).toEqual([{ type: 'walk', x, pace: 'run' }]);
        }
    });

    it('ends when the walk is blocked, without trying again', () => {
        const { events, motor, log } = stage({ flee }, { context: world });
        events.emit('bomb.placed', { id: 1, at: { x: 300, y: 700 } });

        motor.finish('failed');

        expect(log.at(-1)).toBe('-monkey/flee:done');
        expect(motor.requests).toHaveLength(1);
    });

    it('shouts even right after another line', () => {
        const { events, log } = stage({ flee, comments }, { context: world });
        events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        events.emit('bomb.placed', { id: 1, at: { x: 300, y: 700 } });

        expect(log).toContain('run');
    });

    it('still comments on a grab while he runs', () => {
        const { events, advance, log } = stage(
            { flee, comments },
            { context: world },
        );
        events.emit('bomb.placed', { id: 1, at: { x: 300, y: 700 } });
        advance(1700);

        events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        expect(log.filter((entry) => !entry.startsWith('-'))).toEqual([
            '+monkey/flee',
            'run',
            '+monkey/comments#0',
            'grab',
        ]);
    });

    it('does nothing when run without a bomb to flee', () => {
        const say = vi.fn();
        const context = { actor: 'monkey', now: 0, ...world };

        const first = flee.run(context, { say, context: () => context }).next();

        expect(first.done).toBe(true);
        expect(say).not.toHaveBeenCalled();
    });

    it('does not start without knowing the page and where he stands', () => {
        for (const context of [{ pageWidth: 1000 }, { monkeyX: 500 }, {}]) {
            const { events, motor } = stage({ flee }, { context });

            events.emit('bomb.placed', { id: 1, at: { x: 300, y: 700 } });

            expect(motor.requests).toEqual([]);
        }
        expect(flee.canStart({ actor: 'monkey', now: 0, ...world })).toBe(
            false,
        );
    });
});
