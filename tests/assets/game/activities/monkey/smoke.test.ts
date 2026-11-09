import { describe, expect, it } from 'vitest';
import flee from '../../../../../assets/game/activities/monkey/flee';
import smoke from '../../../../../assets/game/activities/monkey/smoke';
import { stage } from './stage';

describe('the monkey smoking', () => {
    it('smokes once he has been idle for 5 seconds', () => {
        const { motor, advance, log } = stage({ smoke });

        advance(4999);
        expect(motor.requests).toEqual([]);

        advance(1);
        expect(log).toEqual(['+monkey/smoke']);
        expect(motor.requests).toEqual([
            { type: 'pose', pose: 'smoke', ms: 6000 },
        ]);
        expect(motor.layers).toEqual(['body']);
    });

    it('goes back to being idle, then smokes again', () => {
        const { motor, advance, log } = stage({ smoke });
        advance(5000);

        motor.finish();
        expect(log).toEqual(['+monkey/smoke', '-monkey/smoke:done']);

        advance(5000);
        expect(motor.requests).toHaveLength(2);
    });

    it('gives way to an activity, which takes the body at once', () => {
        const { events, motor, advance, log } = stage(
            { smoke, flee },
            { context: { pageWidth: 1000, monkeyX: 500 } },
        );
        advance(5000);

        events.emit('bomb.placed', { id: 1, at: { x: 400, y: 0 } });

        expect(motor.cancelled).toEqual([
            { type: 'pose', pose: 'smoke', ms: 6000 },
        ]);
        expect(log).toContain('-monkey/smoke:interrupted');
        expect(motor.pending).toEqual([{ type: 'walk', x: 960, pace: 'run' }]);
    });
});
