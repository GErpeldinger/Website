import { describe, expect, it } from 'vitest';
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
});
