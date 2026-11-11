import { describe, expect, it } from 'vitest';
import { jumpFor } from '../../../../../../assets/game/activities/monkey/search/jump';

describe('the jump to a cigarette overhead', () => {
    it('goes up by the root of 0.56 times the height plus 30', () => {
        // 0.56 * (100 + 30) = 72.8
        expect(jumpFor(100, 0).vy).toBeCloseTo(-Math.sqrt(72.8));
    });

    it('goes up at least 6, for a cigarette just over his head', () => {
        expect(jumpFor(7, 0).vy).toBe(-6);
    });

    it('goes up at most 14, however high it is', () => {
        expect(jumpFor(1000, 0).vy).toBe(-14);
        expect(jumpFor(310, 0).vy).toBeCloseTo(-13.8, 1);
    });

    it('goes across by a tenth of the distance, towards it', () => {
        expect(jumpFor(100, 30).vx).toBeCloseTo(3);
        expect(jumpFor(100, -30).vx).toBeCloseTo(-3);
        expect(jumpFor(100, 0).vx).toBe(0);
    });

    it('goes across by 4 at most', () => {
        expect(jumpFor(100, 80).vx).toBe(4);
        expect(jumpFor(100, -80).vx).toBe(-4);
    });
});
