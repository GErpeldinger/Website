import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clock, type ClockView } from '../../../../assets/game/clock/clock';
import { Tornado } from '../../../../assets/game/page/tornado';

afterEach(() => {
    document.body.innerHTML = '';
});

const funnels = (): SVGSVGElement[] =>
    Array.from(document.body.querySelectorAll<SVGSVGElement>('[data-tornado]'));

const bands = (): SVGEllipseElement[] =>
    Array.from(document.body.querySelectorAll<SVGEllipseElement>('ellipse'));

const number = (element: Element | undefined, name: string): number =>
    Number(element?.getAttribute(name));

// The clock takes at most 250 ms a tick.
const pass = (clock: Clock, ms: number): void => {
    for (let left = ms; left > 0; left -= 250) {
        clock.tick(Math.min(250, left));
    }
};

const setup = (floor = 800): { tornado: Tornado; clock: Clock } => {
    const clock = new Clock();
    return {
        clock,
        tornado: new Tornado(document.body, clock, () => floor),
    };
};

describe('drawing the funnel', () => {
    it('draws nothing while the world has no tornado', () => {
        const { tornado } = setup();

        tornado.step(undefined);

        expect(funnels()).toEqual([]);
    });

    it('is one hidden, untouchable picture of 12 stacked ellipses', () => {
        const { tornado } = setup();

        tornado.step({ x: 500, phase: 0 });

        const [funnel] = funnels();
        expect(funnels()).toHaveLength(1);
        expect(funnel?.tagName.toLowerCase()).toBe('svg');
        expect(funnel?.getAttribute('aria-hidden')).toBe('true');
        expect(funnel?.getAttribute('data-tornado')).toBe('');
        expect(funnel?.getAttribute('focusable')).toBe('false');
        expect(funnel?.getAttribute('viewBox')).toBe('0 0 500 660');
        expect(bands()).toHaveLength(12);
    });

    it('stands on the floor, centred on the axis, up to 620 px high', () => {
        const { tornado } = setup(800);

        tornado.step({ x: 500, phase: 0 });

        expect(funnels()[0]?.style.transform).toBe(
            'translate(250.00px, 160.00px)',
        );
        // The lowest ellipse sits on the floor, the highest 620 px above it.
        expect(number(bands()[0], 'cy')).toBe(640);
        expect(number(bands()[11], 'cy')).toBe(20);
    });

    it('stops short of the top of the page on a short one', () => {
        const { tornado } = setup(300);

        tornado.step({ x: 500, phase: 0 });

        expect(funnels()[0]?.getAttribute('viewBox')).toBe('0 0 500 330');
        expect(funnels()[0]?.style.transform).toBe(
            'translate(250.00px, -10.00px)',
        );
        expect(number(bands()[11], 'cy')).toBe(20);
    });

    it('widens, flattens and thickens towards the top, and fades towards it', () => {
        const { tornado } = setup();

        tornado.step({ x: 500, phase: 0 });

        const [low, , , , , middle, , , , , , high] = bands();
        expect(number(low, 'cx')).toBe(250);
        expect(number(low, 'rx')).toBe(16);
        expect(number(low, 'ry')).toBe(6);
        expect(number(low, 'stroke-width')).toBe(2);
        expect(number(low, 'stroke-opacity')).toBeCloseTo(0.55);
        expect(number(high, 'rx')).toBe(206);
        expect(number(high, 'ry')).toBe(19);
        expect(number(high, 'stroke-width')).toBe(4);
        expect(number(high, 'stroke-opacity')).toBeCloseTo(0.2);
        // t = 5 / 11
        expect(number(middle, 'rx')).toBeCloseTo(16 + (5 / 11) ** 2 * 190, 1);
        expect(number(middle, 'ry')).toBeCloseTo(6 + (5 / 11) * 13, 1);
        expect(number(middle, 'stroke-opacity')).toBeCloseTo(
            0.2 + (6 / 11) * 0.35,
            2,
        );
    });

    it('dashes each ellipse, running faster on the even ones', () => {
        const { tornado } = setup();

        tornado.step({ x: 500, phase: 0 });

        const [low, next, third] = bands();
        expect(low?.getAttribute('stroke-dasharray')).toBe('14.4 7.2');
        expect(low?.style.getPropertyValue('--period')).toBe('21.6');
        // 16 * 1.35 px at 34 px per phase unit, 9.6 units a second, a half faster.
        expect(low?.style.animationDuration).toBe(
            `${((21.6 / (34 * 9.6 * 1.5)) * 1000).toFixed(0)}ms`,
        );
        expect(next?.style.animationDuration).toBe(
            `${((((16 + (1 / 11) ** 2 * 190) * 1.35) / (34 * 9.6)) * 1000).toFixed(0)}ms`,
        );
        expect(third?.style.animationDuration).toBe(
            `${((((16 + (2 / 11) ** 2 * 190) * 1.35) / (34 * 9.6 * 1.5)) * 1000).toFixed(0)}ms`,
        );
    });
});

describe('swaying', () => {
    it('shifts each ellipse by its own wobble of the phase, wider towards the top', () => {
        const { tornado } = setup();

        tornado.step({ x: 500, phase: 1 });

        const [low, , , , , middle, , , , , , high] = bands();
        const wobble = (t: number): string =>
            `translateX(${(Math.sin(1.3 + t * 5) * (10 + t * 30)).toFixed(1)}px)`;
        expect(low?.style.transform).toBe(wobble(0));
        expect(middle?.style.transform).toBe(wobble(5 / 11));
        expect(high?.style.transform).toBe(wobble(1));
    });

    it('follows the axis, without drawing a second picture', () => {
        const { tornado } = setup();
        tornado.step({ x: 500, phase: 0 });
        const [funnel] = funnels();

        tornado.step({ x: 620, phase: 0.16 });

        expect(funnels()).toHaveLength(1);
        expect(funnels()[0]).toBe(funnel);
        expect(funnel?.style.transform).toBe('translate(370.00px, 160.00px)');
    });
});

describe('ending', () => {
    it('fades out once the world has no tornado, then goes after 300 ms', () => {
        const { tornado, clock } = setup();
        tornado.step({ x: 500, phase: 0 });

        tornado.step(undefined);
        expect(funnels()[0]?.getAttribute('data-ending')).toBe('');
        pass(clock, 299);
        expect(funnels()).toHaveLength(1);
        pass(clock, 1);

        expect(funnels()).toEqual([]);
    });

    it('does not start fading twice', () => {
        const after = vi.fn((): (() => void) => () => undefined);
        const clock: ClockView = { now: (): number => 0, after };
        const tornado = new Tornado(document.body, clock, () => 800);
        tornado.step({ x: 500, phase: 0 });

        tornado.step(undefined);
        tornado.step(undefined);

        expect(after).toHaveBeenCalledTimes(1);
    });

    it('is replaced at once by a new tornado that starts while one fades', () => {
        const cancel = vi.fn();
        const clock: ClockView = {
            now: (): number => 0,
            after: (): (() => void) => cancel,
        };
        const tornado = new Tornado(document.body, clock, () => 800);
        tornado.step({ x: 500, phase: 0 });
        tornado.step(undefined);

        tornado.step({ x: 200, phase: 0 });

        expect(funnels()).toHaveLength(1);
        expect(funnels()[0]?.hasAttribute('data-ending')).toBe(false);
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('is wiped by clear, the fading one too, and its timer with it', () => {
        const cancel = vi.fn();
        const clock: ClockView = {
            now: (): number => 0,
            after: (): (() => void) => cancel,
        };
        const tornado = new Tornado(document.body, clock, () => 800);
        tornado.step({ x: 500, phase: 0 });

        tornado.clear();
        expect(funnels()).toEqual([]);
        expect(cancel).not.toHaveBeenCalled();

        tornado.step({ x: 500, phase: 0 });
        tornado.step(undefined);
        tornado.clear();

        expect(funnels()).toEqual([]);
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('can be drawn again after a clear', () => {
        const { tornado } = setup();
        tornado.step({ x: 500, phase: 0 });
        tornado.clear();

        tornado.step({ x: 500, phase: 0 });

        expect(funnels()).toHaveLength(1);
    });
});
