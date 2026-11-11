import { describe, expect, it } from 'vitest';
import smoke from '../../../../../assets/game/activities/monkey/smoke';
import sneeze from '../../../../../assets/game/activities/monkey/sneeze';
import type { ContextFields } from '../../../../../assets/game/brain/behaviour';
import { stage } from './stage';

const due = (over: Partial<ContextFields> = {}): Partial<ContextFields> => ({
    sneezeDue: true,
    hasCigarette: true,
    grounded: true,
    free: true,
    ...over,
});

describe('the sneeze', () => {
    it('comes in idle time once it is due: the cigarette falls, on the body', () => {
        const { motor, advance, log } = stage({ sneeze }, { context: due() });

        advance(4999);
        expect(motor.requests).toEqual([]);
        advance(1);

        expect(log).toEqual(['+monkey/sneeze']);
        expect(motor.requests).toEqual([{ type: 'lose', cause: 'sneeze' }]);
        expect(motor.layers).toEqual(['body']);
    });

    it('takes the idle turn from smoking', () => {
        const { motor, advance } = stage({ smoke, sneeze }, { context: due() });

        advance(5000);

        expect(motor.requests).toEqual([{ type: 'lose', cause: 'sneeze' }]);
    });

    it('leaves smoking its turn until it is due', () => {
        const { motor, advance } = stage(
            { smoke, sneeze },
            { context: due({ sneezeDue: false }) },
        );

        advance(5000);

        expect(motor.requests).toEqual([
            { type: 'pose', pose: 'smoke', ms: 6000 },
        ]);
    });

    const never = (over: Partial<ContextFields>): void => {
        const { motor, advance } = stage({ sneeze }, { context: due(over) });

        advance(20_000);

        expect(motor.requests).toEqual([]);
    };

    it('does not come when it is not due', () => {
        never({ sneezeDue: false });
    });

    it('does not come without a lit cigarette to lose', () => {
        never({ hasCigarette: false });
    });

    it('does not come while he is in the air', () => {
        never({ grounded: false });
    });

    it('does not come while he is out of the page or in the visitor’s hand', () => {
        never({ free: false });
    });

    it('does not come when the world says nothing', () => {
        const { motor, advance } = stage({ sneeze });

        advance(20_000);

        expect(motor.requests).toEqual([]);
    });
});
