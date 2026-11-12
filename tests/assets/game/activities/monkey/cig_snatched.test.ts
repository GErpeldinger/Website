import { describe, expect, it } from 'vitest';
import cigSnatched from '../../../../../assets/game/activities/monkey/cig_snatched';
import cigStolen from '../../../../../assets/game/activities/monkey/cig_stolen';
import { stage } from './stage';

describe('the face of snatching the cigarette back', () => {
    it('is proud for 1.8 s on the overlay, and says so, forced', () => {
        const { events, motor, log } = stage({ cig_snatched: cigSnatched });

        events.emit('cig.snatched', undefined);

        expect(log).toEqual(['+monkey/cig_snatched', 'snatched']);
        expect(motor.requests).toEqual([
            { type: 'mood', mood: 'proud', ms: 1800 },
        ]);
        expect(motor.layers).toEqual(['overlay']);
    });

    it('is shown when he snatches it while the theft’s face is still on', () => {
        const { events, log } = stage({
            cig_stolen: cigStolen,
            cig_snatched: cigSnatched,
        });
        events.emit('cig.grabbed', { at: { x: 300, y: 690 } });

        events.emit('cig.snatched', undefined);

        expect(log).toEqual([
            '+monkey/cig_stolen',
            'stolen',
            '+monkey/cig_snatched',
            'snatched',
        ]);
    });

    it('is no occasion for anything else', () => {
        const { events, motor } = stage({ cig_snatched: cigSnatched });

        events.emit('cig.lit', undefined);

        expect(motor.requests).toEqual([]);
        expect(cigSnatched.canStart({ actor: 'monkey', now: 0 })).toBe(false);
    });
});
