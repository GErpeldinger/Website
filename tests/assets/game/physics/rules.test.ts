import { describe, expect, it } from 'vitest';
import {
    blastRadius,
    isCalm,
    isHardHit,
    isThrow,
    loosensPinned,
    Stillness,
} from '../../../../assets/game/physics/rules';

// Each rule is a threshold: its boundary is tested on both sides.
describe('loosensPinned', () => {
    it('frees a pinned piece struck faster than 2.2 px per step', () => {
        expect(loosensPinned(2.2)).toBe(false);
        expect(loosensPinned(2.21)).toBe(true);
        expect(loosensPinned(0)).toBe(false);
    });
});

describe('isHardHit', () => {
    it('counts a relative speed of 7 px per step and more', () => {
        expect(isHardHit(6.99)).toBe(false);
        expect(isHardHit(7)).toBe(true);
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
