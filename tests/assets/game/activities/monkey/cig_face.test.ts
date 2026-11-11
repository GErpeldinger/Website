import { describe, expect, it } from 'vitest';
import cigFace from '../../../../../assets/game/activities/monkey/cig_face';
import flinch from '../../../../../assets/game/activities/monkey/flinch';
import { stage } from './stage';

const lost = (
    cause: 'hit' | 'sneeze',
): { cause: 'hit' | 'sneeze'; at: { x: number; y: number } } => ({
    cause,
    at: { x: 300, y: 690 },
});

describe('the face of losing the cigarette', () => {
    it('cries out and is scared for 1.6 s, on the overlay', () => {
        const { events, motor, log } = stage({ cig_face: cigFace });

        events.emit('cig.lost', lost('hit'));

        expect(log).toEqual(['+monkey/cig_face', 'lostCig']);
        expect(motor.requests).toEqual([
            { type: 'mood', mood: 'scared', ms: 1600 },
        ]);
        expect(motor.layers).toEqual(['overlay']);
    });

    it('cries out forced, even a moment after another line', () => {
        for (const cause of ['hit', 'sneeze'] as const) {
            const { events, log } = stage({ cig_face: cigFace, flinch });
            // The flinch said "Ouch!" an instant ago: an ordinary line would be held back.
            events.emit('monkey.hit', { speed: 9, against: 'piece' });

            events.emit('cig.lost', lost(cause));

            expect(log).toContain(cause === 'hit' ? 'lostCig' : 'sneeze');
        }
    });

    it('sneezes first when it was a sneeze', () => {
        const { events, log } = stage({ cig_face: cigFace });

        events.emit('cig.lost', lost('sneeze'));

        expect(log).toEqual(['+monkey/cig_face', 'sneeze']);
    });

    it('says it forced, even a moment after another line', () => {
        const { events, motor, log } = stage({ cig_face: cigFace });
        events.emit('cig.lost', lost('hit'));
        motor.finish('done', 'overlay');

        events.emit('cig.lit', undefined);

        expect(log).toContain('lit');
    });
});

describe('the face of lighting it again', () => {
    it('is pleased with himself for 1.8 s', () => {
        const { events, motor, log } = stage({ cig_face: cigFace });

        events.emit('cig.lit', undefined);

        expect(log).toEqual(['+monkey/cig_face', 'lit']);
        expect(motor.requests).toEqual([
            { type: 'mood', mood: 'proud', ms: 1800 },
        ]);
        expect(motor.layers).toEqual(['overlay']);
    });
});

describe('anything else', () => {
    it('has no face to make when started on its own, as the director panel does', () => {
        const { brain, motor, log } = stage({ cig_face: cigFace });

        brain.start('monkey/cig_face');

        expect(log).toEqual(['+monkey/cig_face', '-monkey/cig_face:done']);
        expect(motor.requests).toEqual([]);
    });

    it('is no occasion', () => {
        const { events, motor } = stage({ cig_face: cigFace });

        events.emit('monkey.hit', { speed: 9, against: 'piece' });

        expect(motor.requests).toEqual([]);
        expect(cigFace.canStart({ actor: 'monkey', now: 0 })).toBe(false);
    });
});
