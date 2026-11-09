import { describe, expect, it } from 'vitest';
import back from '../../../../../assets/game/activities/monkey/back';
import flee from '../../../../../assets/game/activities/monkey/flee';
import { stage, type LiveContext } from './stage';

describe('the monkey coming back into the page', () => {
    it('says where he has been, forced, and is put back under the top, then he is done', () => {
        const { events, motor, log } = stage(
            { back },
            { context: { monkeyX: 400 } },
        );

        events.emit('monkey.left', { side: 'top' });

        expect(log).toEqual(['+monkey/back', 'backTop']);
        expect(motor.requests).toEqual([{ type: 'enter', from: 'top' }]);
        expect(motor.layers).toEqual(['body']);

        motor.finish();
        // He falls in where he is: no walk, however well the world says where he is.
        expect(motor.requests).toHaveLength(1);
        expect(log.at(-1)).toBe('-monkey/back:done');
    });

    it('says another line for a side, puts him on the floor inside it and walks him in', () => {
        const context: LiveContext = { monkeyX: -300 };
        const { events, motor, log } = stage({ back }, { context });

        events.emit('monkey.left', { side: 'left' });
        expect(log).toEqual(['+monkey/back', 'backSide']);
        expect(motor.requests).toEqual([{ type: 'enter', from: 'left' }]);

        // The world now puts him inside.
        context.monkeyX = 30;
        motor.finish();
        expect(motor.requests.at(-1)).toEqual({ type: 'walk', x: 120 });

        motor.finish();
        expect(log.at(-1)).toBe('-monkey/back:done');
    });

    it('walks in to the left from the right edge', () => {
        const context: LiveContext = { monkeyX: 2000 };
        const { events, motor } = stage({ back }, { context });

        events.emit('monkey.left', { side: 'right' });
        context.monkeyX = 970;
        motor.finish();

        expect(motor.requests.at(-1)).toEqual({ type: 'walk', x: 880 });
    });

    it('does not walk when the world does not say where he is', () => {
        const { events, motor, log } = stage({ back });

        events.emit('monkey.left', { side: 'left' });
        motor.finish();

        expect(motor.requests).toEqual([{ type: 'enter', from: 'left' }]);
        expect(log.at(-1)).toBe('-monkey/back:done');
    });

    it('takes the body from a flee, which is no use where he is not', () => {
        const { events, motor, log } = stage(
            { back, flee },
            { context: { pageWidth: 1000, monkeyX: -50 } },
        );
        events.emit('bomb.placed', { id: 1, at: { x: 300, y: 700 } });

        events.emit('monkey.left', { side: 'top' });

        expect(log).toContain('-monkey/flee:interrupted');
        // The flee's shout was a moment ago: an ordinary line would be held back.
        expect(log.at(-1)).toBe('backTop');
        expect(motor.requests.at(-1)).toEqual({ type: 'enter', from: 'top' });
    });

    it('ignores anything but his leaving', () => {
        const { events, motor } = stage({ back });

        events.emit('monkey.landed', { speed: 3 });

        expect(motor.requests).toEqual([]);
        expect(back.canStart({ actor: 'monkey', now: 0 })).toBe(false);
    });
});
