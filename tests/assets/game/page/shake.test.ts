import { describe, expect, it } from 'vitest';
import { Shake } from '../../../../assets/game/page/shake';
import { STEP } from '../../../../assets/game/physics/world';

const setup = (
    random: () => number = () => 1,
): { element: HTMLElement; shake: Shake } => {
    const element = document.createElement('main');
    return { element, shake: new Shake(element, random) };
};

describe('Shake', () => {
    it('is quiet until triggered, and leaves the element alone', () => {
        const { element, shake } = setup();
        element.style.translate = '3px 4px';

        shake.step(STEP);

        expect(shake.active).toBe(false);
        expect(element.style.translate).toBe('3px 4px');
    });

    it('moves the element by a random amount of the strength', () => {
        const { element, shake } = setup(() => 1);

        shake.trigger(16);
        shake.step(STEP);

        expect(shake.active).toBe(true);
        // (1 - 0.5) * 16 on each axis.
        expect(element.style.translate).toBe('8.0px 8.0px');
    });

    it('draws a different offset for each axis', () => {
        const values = [0, 1];
        const { element, shake } = setup(() => values.shift() ?? 0.5);

        shake.trigger(10);
        shake.step(STEP);

        expect(element.style.translate).toBe('-5.0px 5.0px');
    });

    it('dies down by 14% a step', () => {
        const { element, shake } = setup(() => 1);

        shake.trigger(10);
        shake.step(STEP);
        shake.step(STEP);

        expect(element.style.translate).toBe('4.3px 4.3px');
    });

    it('stops and puts the element back once under 0.4 px', () => {
        const { element, shake } = setup(() => 1);
        shake.trigger(1);

        let steps = 0;
        while (shake.active && steps < 100) {
            shake.step(STEP);
            steps++;
        }

        // 1, 0.86, 0.74, 0.64, 0.55, 0.47 shake; 0.41 does too; then 0.35 stops.
        expect(steps).toBe(8);
        expect(shake.active).toBe(false);
        expect(element.style.translate).toBe('');
    });

    it('still shakes at exactly 0.4 less a hair, and stops at 0.4', () => {
        const above = setup(() => 1);
        above.shake.trigger(0.41);
        above.shake.step(STEP);
        expect(above.element.style.translate).not.toBe('');

        const exact = setup(() => 1);
        exact.element.style.translate = '1px 1px';
        exact.shake.trigger(0.4);
        exact.shake.step(STEP);
        expect(exact.element.style.translate).toBe('');
        expect(exact.shake.active).toBe(false);
    });

    it('dies down by game time, not by frame: a 120 Hz screen shakes as long', () => {
        const fast = setup(() => 1);
        fast.shake.trigger(10);
        fast.shake.step(STEP / 2);
        fast.shake.step(STEP / 2);
        fast.shake.step(STEP / 2);
        // Three halves of a step: 0.86 ** 1.5 of the amount is left for the 4th draw.
        fast.shake.step(0);
        expect(fast.element.style.translate).toBe(
            `${(0.5 * 10 * 0.86 ** 1.5).toFixed(1)}px ${(0.5 * 10 * 0.86 ** 1.5).toFixed(1)}px`,
        );
    });

    it('dies down faster when a frame is longer', () => {
        const { element, shake } = setup(() => 1);
        shake.trigger(10);
        shake.step(2 * STEP);
        shake.step(STEP);

        expect(element.style.translate).toBe(
            `${(0.5 * 10 * 0.86 ** 2).toFixed(1)}px ${(0.5 * 10 * 0.86 ** 2).toFixed(1)}px`,
        );
    });

    it('stops at once on demand', () => {
        const { element, shake } = setup(() => 1);
        shake.trigger(16);
        shake.step(STEP);

        shake.stop();

        expect(shake.active).toBe(false);
        expect(element.style.translate).toBe('');
    });

    it('restarts from the new strength when triggered again', () => {
        const { element, shake } = setup(() => 1);
        shake.trigger(1);
        shake.step(STEP);

        shake.trigger(16);
        shake.step(STEP);

        expect(element.style.translate).toBe('8.0px 8.0px');
    });
});
