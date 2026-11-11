import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clock, type ClockView } from '../../../../assets/game/clock/clock';
import { Blasts } from '../../../../assets/game/page/blasts';

afterEach(() => {
    document.body.innerHTML = '';
});

const blasts = (): HTMLElement[] =>
    Array.from(document.body.querySelectorAll<HTMLElement>('[data-blast]'));

const parts = (blast: HTMLElement | undefined, name: string): HTMLElement[] =>
    Array.from(
        blast?.querySelectorAll<HTMLElement>(`[data-part="${name}"]`) ?? [],
    );

// Answers from a list, round and round.
const sequence = (...values: number[]): (() => number) => {
    let next = 0;
    return (): number => values[next++ % values.length] ?? 0;
};

// The clock takes at most 250 ms a tick.
const pass = (clock: Clock, ms: number): void => {
    for (let left = ms; left > 0; left -= 250) {
        clock.tick(Math.min(250, left));
    }
};

const setup = (
    over: { reducedMotion?: boolean; random?: () => number } = {},
): { blasts: Blasts; clock: Clock } => {
    const clock = new Clock();
    return {
        clock,
        blasts: new Blasts({
            parent: document.body,
            clock,
            random: over.random ?? ((): number => 0.5),
            reducedMotion: over.reducedMotion ?? false,
        }),
    };
};

describe('a blast', () => {
    it('is a hidden, untouchable group at the point, with a flash, a ring and 20 particles', () => {
        const { blasts: effects } = setup();

        effects.add({ x: 300, y: 500 }, 280);

        const [blast] = blasts();
        expect(blasts()).toHaveLength(1);
        expect(blast?.getAttribute('aria-hidden')).toBe('true');
        expect(blast?.getAttribute('data-blast')).toBe('');
        expect(blast?.style.left).toBe('300px');
        expect(blast?.style.top).toBe('500px');
        expect(parts(blast, 'flash')).toHaveLength(1);
        expect(parts(blast, 'ring')).toHaveLength(1);
        expect(parts(blast, 'ember')).toHaveLength(14);
        expect(parts(blast, 'smoke')).toHaveLength(6);
        expect(blast?.querySelectorAll('*')).toHaveLength(22);
    });

    it('grows its ring to the radius of the blast, in the time a ring of 13 px a frame takes', () => {
        const { blasts: effects } = setup();

        effects.add({ x: 300, y: 500 }, 250);

        const [ring] = parts(blasts()[0], 'ring');
        expect(ring?.style.left).toBe('-250px');
        expect(ring?.style.top).toBe('-250px');
        expect(ring?.style.width).toBe('500px');
        expect(ring?.style.height).toBe('500px');
        expect(ring?.style.animationDuration).toBe('320ms');
    });

    it('throws each particle by its own angle, speed, life and size', () => {
        const { blasts: effects } = setup({
            random: sequence(0.25, 0.5, 0.5, 0.5),
        });

        effects.add({ x: 300, y: 500 }, 250);

        const [ember] = parts(blasts()[0], 'ember');
        const reach = (9 * 0.75 * 630) / 22;
        const fall = (630 * 630) / 3500;
        expect(
            parseFloat(ember?.style.getPropertyValue('--dx') ?? ''),
        ).toBeCloseTo(0, 0);
        expect(
            parseFloat(ember?.style.getPropertyValue('--dy') ?? ''),
        ).toBeCloseTo(reach + fall, 0);
        expect(ember?.style.getPropertyValue('--dx')).toMatch(/px$/);
        expect(ember?.style.getPropertyValue('--dy')).toMatch(/px$/);
        expect(ember?.style.animationDuration).toBe('630ms');
        expect(ember?.style.width).toBe('3.1px');
        expect(ember?.style.height).toBe('3.1px');
    });

    it('sends the smoke slower and shorter than the embers', () => {
        const { blasts: effects } = setup({ random: (): number => 0 });

        effects.add({ x: 0, y: 0 }, 250);

        const [ember] = parts(blasts()[0], 'ember');
        const [smoke] = parts(blasts()[0], 'smoke');
        const reachOf = (element: HTMLElement | undefined): number =>
            parseFloat(element?.style.getPropertyValue('--dx') ?? '');
        expect(reachOf(ember)).toBeCloseTo((9 * 0.25 * 360) / 22, 1);
        expect(reachOf(smoke)).toBeCloseTo((4 * 0.25 * 360) / 22, 1);
        expect(ember?.style.width).toBe('1.6px');
    });

    it('is gone 900 ms later, game time', () => {
        const { blasts: effects, clock } = setup();
        effects.add({ x: 300, y: 500 }, 250);

        pass(clock, 899);
        expect(blasts()).toHaveLength(1);
        pass(clock, 1);

        expect(blasts()).toEqual([]);
    });

    it('keeps at most 6 blasts, the newest', () => {
        const { blasts: effects } = setup();
        for (let i = 0; i < 7; i++) {
            effects.add({ x: 100 * i, y: 0 }, 250);
        }

        expect(blasts().map((blast) => blast.style.left)).toEqual([
            '100px',
            '200px',
            '300px',
            '400px',
            '500px',
            '600px',
        ]);
    });

    it('flashes at most once in 340 ms of game time', () => {
        const { blasts: effects, clock } = setup();

        effects.add({ x: 100, y: 0 }, 250);
        pass(clock, 100);
        effects.add({ x: 200, y: 0 }, 250);
        pass(clock, 239);
        effects.add({ x: 300, y: 0 }, 250);
        pass(clock, 1);
        effects.add({ x: 400, y: 0 }, 250);

        expect(blasts().map((blast) => parts(blast, 'flash').length)).toEqual([
            1, 0, 0, 1,
        ]);
        // The ring and the particles stay.
        expect(blasts().map((blast) => parts(blast, 'ring').length)).toEqual([
            1, 1, 1, 1,
        ]);
        expect(parts(blasts()[1], 'ember')).toHaveLength(14);
    });

    it('forgets a blast once its timer has run, so nothing cancels it later', () => {
        const timers: { run: () => void; cancel: ReturnType<typeof vi.fn> }[] =
            [];
        const clock: ClockView = {
            now: (): number => 0,
            after: (_delay, run): (() => void) => {
                const cancel = vi.fn();
                timers.push({ run, cancel });
                return cancel;
            },
        };
        const effects = new Blasts({
            parent: document.body,
            clock,
            random: (): number => 0.5,
            reducedMotion: false,
        });
        effects.add({ x: 0, y: 0 }, 250);
        effects.add({ x: 1, y: 0 }, 250);
        timers[0]?.run();

        for (let i = 2; i < 8; i++) {
            effects.add({ x: i, y: 0 }, 250);
        }
        effects.clear();

        expect(timers[0]?.cancel).not.toHaveBeenCalled();
        // The second was the oldest still showing: the cap dropped it.
        expect(timers[1]?.cancel).toHaveBeenCalledTimes(1);
    });

    it('is wiped on clear, whose timers then do nothing', () => {
        const { blasts: effects, clock } = setup();
        effects.add({ x: 300, y: 500 }, 250);

        effects.clear();
        expect(blasts()).toEqual([]);
        effects.add({ x: 100, y: 500 }, 250);
        pass(clock, 899);

        expect(blasts()).toHaveLength(1);
    });
});

describe('the timers of the blasts', () => {
    it('are cancelled for a blast dropped to make room, and for each one cleared', () => {
        const cancels: (() => void)[] = [];
        const clock: ClockView = {
            now: (): number => 0,
            after: (): (() => void) => {
                const cancel = vi.fn();
                cancels.push(cancel);
                return cancel;
            },
        };
        const effects = new Blasts({
            parent: document.body,
            clock,
            random: (): number => 0.5,
            reducedMotion: false,
        });
        for (let i = 0; i < 7; i++) {
            effects.add({ x: i, y: 0 }, 250);
        }

        expect(cancels[0]).toHaveBeenCalledTimes(1);
        expect(cancels[1]).not.toHaveBeenCalled();

        effects.clear();

        expect(cancels[1]).toHaveBeenCalledTimes(1);
        expect(cancels[6]).toHaveBeenCalledTimes(1);
    });
});

describe('a blast under reduced motion', () => {
    it('is one glow of the size of the blast that fades, with no flash, ring or particle', () => {
        const { blasts: effects } = setup({ reducedMotion: true });

        effects.add({ x: 300, y: 500 }, 250);

        const [blast] = blasts();
        const [fade] = parts(blast, 'fade');
        expect(blast?.querySelectorAll('*')).toHaveLength(1);
        expect(fade?.style.left).toBe('-250px');
        expect(fade?.style.top).toBe('-250px');
        expect(fade?.style.width).toBe('500px');
        expect(fade?.style.height).toBe('500px');
    });

    it('shows the glow without animating it, and removes it after 500 ms', () => {
        const { blasts: effects, clock } = setup({ reducedMotion: true });
        effects.add({ x: 300, y: 500 }, 250);

        const [fade] = parts(blasts()[0], 'fade');
        expect(fade?.style.animationDuration).toBe('');
        expect(fade?.style.animationName).toBe('');
        pass(clock, 499);
        expect(blasts()).toHaveLength(1);
        pass(clock, 1);

        expect(blasts()).toEqual([]);
    });
});

describe('a puff of smoke', () => {
    it('is a small group of eight grey particles where something went out, and nothing else', () => {
        const { blasts: effects } = setup();

        effects.puff({ x: 410, y: 690 });

        const [puff] = blasts();
        expect(blasts()).toHaveLength(1);
        expect(puff?.getAttribute('aria-hidden')).toBe('true');
        expect(puff?.style.left).toBe('410px');
        expect(puff?.style.top).toBe('690px');
        expect(parts(puff, 'smoke')).toHaveLength(8);
        expect(puff?.children).toHaveLength(8);
    });

    it('is gone after the longest particle, on the game clock', () => {
        const { blasts: effects, clock } = setup();
        effects.puff({ x: 410, y: 690 });

        pass(clock, 899);
        expect(blasts()).toHaveLength(1);
        pass(clock, 1);

        expect(blasts()).toHaveLength(0);
    });

    it('is skipped under reduced motion', () => {
        const { blasts: effects } = setup({ reducedMotion: true });

        effects.puff({ x: 410, y: 690 });

        expect(blasts()).toHaveLength(0);
    });

    it('counts among the six groups that live at once', () => {
        const { blasts: effects } = setup();

        for (let i = 0; i < 7; i++) {
            effects.puff({ x: i, y: 0 });
        }

        expect(blasts()).toHaveLength(6);
    });
});
