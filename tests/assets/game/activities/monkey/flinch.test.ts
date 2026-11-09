import { describe, expect, it } from 'vitest';
import { BURNT } from '../../../../../assets/game/activities/monkey/burnt';
import flinch from '../../../../../assets/game/activities/monkey/flinch';
import { stage } from './stage';

describe('the monkey flinching', () => {
    it('says ouch and shows fear on the overlay for a moment, when hit', () => {
        const { events, motor, log } = stage({ flinch });

        events.emit('monkey.hit', { speed: 9, against: 'piece' });

        expect(log).toEqual(['+monkey/flinch', 'hurt']);
        expect(motor.requests).toEqual([
            { type: 'mood', mood: 'scared', ms: 900 },
        ]);
        expect(motor.layers).toEqual(['overlay']);

        motor.finish('done', 'overlay');
        expect(log).toEqual(['+monkey/flinch', 'hurt', '-monkey/flinch:done']);
    });

    it('ignores what is not a hit', () => {
        const { events, motor } = stage({ flinch });

        events.emit('monkey.landed', { speed: 9 });

        expect(motor.requests).toEqual([]);
        expect(flinch.canStart({ actor: 'monkey', now: 0 })).toBe(false);
    });

    it('gives way to the burnt look while it lasts: no scared face, no ouch', () => {
        const { events, motor, log } = stage(
            { flinch },
            { context: { running: [BURNT] } },
        );

        events.emit('monkey.hit', { speed: 9, against: 'floor' });

        expect(motor.requests).toEqual([]);
        expect(log).toEqual([]);
    });

    it('flinches while other behaviours run', () => {
        const { events, motor } = stage(
            { flinch },
            { context: { running: ['monkey/flee'] } },
        );

        events.emit('monkey.hit', { speed: 9, against: 'floor' });

        expect(motor.requests).toHaveLength(1);
    });
});
