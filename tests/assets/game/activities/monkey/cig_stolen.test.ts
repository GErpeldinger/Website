import { describe, expect, it } from 'vitest';
import cigFace from '../../../../../assets/game/activities/monkey/cig_face';
import cigStolen from '../../../../../assets/game/activities/monkey/cig_stolen';
import flinch from '../../../../../assets/game/activities/monkey/flinch';
import { stage } from './stage';

const grabbed = { at: { x: 300, y: 690 } };

describe('the face of the visitor taking the cigarette', () => {
    it('is cross for 2.5 s on the overlay, and says he was robbed, forced', () => {
        const { events, motor, log } = stage({ cig_stolen: cigStolen, flinch });
        // The flinch said "Ouch!" an instant ago: an ordinary line would be held back.
        events.emit('monkey.hit', { speed: 9, against: 'piece' });

        events.emit('cig.grabbed', grabbed);

        expect(log).toContain('stolen');
        expect(motor.requests).toContainEqual({
            type: 'mood',
            mood: 'cross',
            ms: 2500,
        });
        expect(motor.layers.at(-1)).toBe('overlay');
    });

    it('is shown when the visitor takes it while the fall’s face is still on', () => {
        const { events, motor, log } = stage({
            cig_face: cigFace,
            cig_stolen: cigStolen,
        });
        events.emit('cig.lost', { cause: 'hit', at: { x: 300, y: 690 } });

        events.emit('cig.grabbed', grabbed);

        expect(log).toEqual([
            '+monkey/cig_face',
            'lostCig',
            '+monkey/cig_stolen',
            'stolen',
        ]);
        expect(motor.requests.map((request) => request.type)).toEqual([
            'mood',
            'mood',
        ]);
    });

    it('is no occasion for anything else, nor when started on its own', () => {
        const { events, brain, motor } = stage({ cig_stolen: cigStolen });

        events.emit('cig.lost', { cause: 'hit', at: { x: 300, y: 690 } });
        expect(motor.requests).toEqual([]);
        expect(cigStolen.canStart({ actor: 'monkey', now: 0 })).toBe(false);

        brain.start('monkey/cig_stolen');
        expect(motor.requests).toHaveLength(1);
    });
});
