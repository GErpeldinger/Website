import { describe, expect, it } from 'vitest';
import {
    blastRadius,
    isCalm,
    holdsUp,
    hurtsMonkey,
    isGrounded,
    isHardHit,
    isThrow,
    loosensPinned,
    Stillness,
} from '../../../../assets/game/physics/rules';

// Each rule is a threshold: its boundary is tested on both sides.
describe('loosensPinned', () => {
    it('frees a pinned piece struck faster than 2.2 px per step', () => {
        expect(loosensPinned(2.2, false)).toBe(false);
        expect(loosensPinned(2.21, false)).toBe(true);
        expect(loosensPinned(0, false)).toBe(false);
    });

    it('needs the monkey to fall faster than 9 px per step, so that standing on it frees nothing', () => {
        expect(loosensPinned(9, true)).toBe(false);
        expect(loosensPinned(9.01, true)).toBe(true);
        expect(loosensPinned(3, true)).toBe(false);
    });
});

describe('isHardHit', () => {
    it('counts a relative speed of 7 px per step and more', () => {
        expect(isHardHit(6.99)).toBe(false);
        expect(isHardHit(7)).toBe(true);
    });
});

describe('hurtsMonkey', () => {
    it('counts a hit of 7 px per step and more, like any piece', () => {
        expect(hurtsMonkey(6.99, false)).toBe(false);
        expect(hurtsMonkey(7, false)).toBe(true);
    });

    it('counts the floor, or a pinned piece, only from a fall of 10 px per step', () => {
        expect(hurtsMonkey(9.99, true)).toBe(false);
        expect(hurtsMonkey(10, true)).toBe(true);
        expect(hurtsMonkey(7, true)).toBe(false);
    });
});

describe('isGrounded', () => {
    // The soles of his feet are at 700 on a page whose floor is 700.
    it('holds on the floor, neither falling nor rising', () => {
        expect(isGrounded(0, 700, 700, false)).toBe(true);
        expect(isGrounded(0.79, 700, 700, false)).toBe(true);
        expect(isGrounded(-0.79, 700, 700, false)).toBe(true);
        expect(isGrounded(0.8, 700, 700, false)).toBe(false);
        expect(isGrounded(-0.8, 700, 700, false)).toBe(false);
    });

    it('holds within 6 px of the floor', () => {
        expect(isGrounded(0, 694, 700, false)).toBe(true);
        expect(isGrounded(0, 693.9, 700, false)).toBe(false);
    });

    it('holds higher up only when something holds him up, never at the top of a hop', () => {
        expect(isGrounded(0, 500, 700, true)).toBe(true);
        expect(isGrounded(0, 500, 700, false)).toBe(false);
        expect(isGrounded(1, 500, 700, true)).toBe(false);
    });
});

describe('holdsUp', () => {
    it('needs a push steeper than 45 degrees, up or down as the sides are named', () => {
        expect(holdsUp(0.71, 700, 600)).toBe(true);
        expect(holdsUp(-0.71, 700, 600)).toBe(true);
        expect(holdsUp(0.7, 700, 600)).toBe(false);
        expect(holdsUp(0.2, 700, 600)).toBe(false);
    });

    it('needs the other body below his centre, not level with it or above', () => {
        expect(holdsUp(1, 600.1, 600)).toBe(true);
        expect(holdsUp(1, 600, 600)).toBe(false);
        expect(holdsUp(1, 500, 600)).toBe(false);
    });
});

describe('isThrow', () => {
    it('counts a release speed of 4 px per step and more', () => {
        expect(isThrow(3.99)).toBe(false);
        expect(isThrow(4)).toBe(true);
    });
});

describe('isCalm', () => {
    it('needs both the speed and the spin below their limits', () => {
        expect(isCalm(0.19, 0.019)).toBe(true);
        expect(isCalm(0.2, 0.019)).toBe(false);
        expect(isCalm(0.19, 0.02)).toBe(false);
        expect(isCalm(0.2, 0.02)).toBe(false);
    });
});

describe('Stillness', () => {
    it('holds from the start, so a page nobody touched costs no frame', () => {
        expect(new Stillness(3).holds).toBe(true);
    });

    it('holds again after the required number of calm steps in a row', () => {
        const stillness = new Stillness(3);
        stillness.disturb();

        stillness.observe(true);
        stillness.observe(true);
        expect(stillness.holds).toBe(false);
        stillness.observe(true);
        expect(stillness.holds).toBe(true);
    });

    it('starts counting again after a step that was not calm', () => {
        const stillness = new Stillness(3);
        stillness.disturb();
        stillness.observe(true);
        stillness.observe(true);

        stillness.observe(false);
        stillness.observe(true);
        stillness.observe(true);
        expect(stillness.holds).toBe(false);
        stillness.observe(true);
        expect(stillness.holds).toBe(true);
    });

    it('is disturbed by anything that moves a body outside a step', () => {
        const stillness = new Stillness(2);
        stillness.disturb();
        expect(stillness.holds).toBe(false);
    });
});

describe('blastRadius', () => {
    it('is 30% of the page width, kept between 220 and 340 px', () => {
        expect(blastRadius(500)).toBe(220);
        expect(blastRadius(733)).toBe(220);
        expect(blastRadius(1000)).toBe(300);
        expect(blastRadius(1134)).toBe(340);
        expect(blastRadius(3000)).toBe(340);
    });
});
