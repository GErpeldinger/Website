import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { Clock, type ClockView } from '../../../../assets/game/clock/clock';

describe('time', () => {
    it('starts at zero', () => {
        expect(new Clock().now()).toBe(0);
    });

    it('advances by the elapsed time of each tick', () => {
        const clock = new Clock();

        clock.tick(16);
        clock.tick(0);
        clock.tick(4.5);

        expect(clock.now()).toBe(20.5);
    });

    it('clamps one step to 250 ms by default', () => {
        const clock = new Clock();

        clock.tick(60_000);

        expect(clock.now()).toBe(250);
    });

    it('does not clamp a step equal to the maximum', () => {
        const clock = new Clock({ maxStep: 100 });

        clock.tick(100);

        expect(clock.now()).toBe(100);
    });

    it('clamps one step to the configured maximum', () => {
        const clock = new Clock({ maxStep: 100 });

        clock.tick(101);
        clock.tick(30);

        expect(clock.now()).toBe(130);
    });

    it.each([Number.NaN, Infinity, -Infinity, -1, -0.001])(
        'rejects an elapsed time of %s',
        (elapsed) => {
            const clock = new Clock();

            expect(() => {
                clock.tick(elapsed);
            }).toThrow(
                new RangeError(
                    `The elapsed time must be a finite number >= 0, got ${String(elapsed)}.`,
                ),
            );
            expect(clock.now()).toBe(0);
        },
    );

    it.each([Number.NaN, Infinity, -1, 0])(
        'rejects a maximum step of %s',
        (maxStep) => {
            expect(() => new Clock({ maxStep })).toThrow(
                new RangeError(
                    `The maximum step must be a finite number > 0, got ${String(maxStep)}.`,
                ),
            );
        },
    );
});

describe('scheduling', () => {
    it('runs a callback once its delay has elapsed, and only once', () => {
        const clock = new Clock();
        const callback = vi.fn();
        clock.after(100, callback);

        clock.tick(99);
        expect(callback).not.toHaveBeenCalled();

        clock.tick(1);
        expect(callback).toHaveBeenCalledTimes(1);

        clock.tick(200);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('measures the delay from the current game time', () => {
        const clock = new Clock();
        const callback = vi.fn();
        clock.tick(40);

        clock.after(50, callback);
        clock.tick(49);
        expect(callback).not.toHaveBeenCalled();

        clock.tick(1);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('runs the callbacks due within one tick in due order', () => {
        const clock = new Clock();
        const order: string[] = [];
        clock.after(30, () => order.push('c'));
        clock.after(10, () => order.push('a'));
        clock.after(20, () => order.push('b'));

        clock.tick(100);

        expect(order).toEqual(['a', 'b', 'c']);
    });

    it('runs callbacks with the same due time in scheduling order', () => {
        const clock = new Clock();
        const order: string[] = [];
        clock.after(10, () => order.push('first'));
        clock.after(10, () => order.push('second'));

        clock.tick(10);

        expect(order).toEqual(['first', 'second']);
    });

    it('leaves a callback that is not due yet for a later tick', () => {
        const clock = new Clock();
        const order: string[] = [];
        clock.after(200, () => order.push('later'));
        clock.after(10, () => order.push('sooner'));

        clock.tick(100);
        expect(order).toEqual(['sooner']);

        clock.tick(100);
        expect(order).toEqual(['sooner', 'later']);
    });

    it('runs a callback scheduled with no delay on the next tick', () => {
        const clock = new Clock();
        const callback = vi.fn();
        clock.after(0, callback);
        expect(callback).not.toHaveBeenCalled();

        clock.tick(0);

        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('runs a callback scheduled during a tick for a time already passed on the next tick', () => {
        const clock = new Clock();
        const inner = vi.fn();
        clock.after(10, () => {
            clock.after(0, inner);
            clock.after(5, inner);
        });

        clock.tick(100);
        expect(inner).not.toHaveBeenCalled();

        clock.tick(0);
        expect(inner).toHaveBeenCalledTimes(1);

        clock.tick(5);
        expect(inner).toHaveBeenCalledTimes(2);
    });

    it('reads the game time at the end of the step from a callback', () => {
        const clock = new Clock();
        let seen = -1;
        clock.after(10, () => {
            seen = clock.now();
        });

        clock.tick(100);

        expect(seen).toBe(100);
    });

    it('does not run a cancelled callback', () => {
        const clock = new Clock();
        const callback = vi.fn();
        const cancel = clock.after(10, callback);

        cancel();
        clock.tick(100);

        expect(callback).not.toHaveBeenCalled();
    });

    it('cancels only its own callback, and cancelling twice is harmless', () => {
        const clock = new Clock();
        const kept = vi.fn();
        const cancel = clock.after(10, vi.fn());
        clock.after(10, kept);

        cancel();
        cancel();
        clock.tick(10);

        expect(kept).toHaveBeenCalledTimes(1);
    });

    it('does not run a callback cancelled by an earlier one in the same tick', () => {
        const clock = new Clock();
        const late = vi.fn();
        const cancelLate = clock.after(20, late);
        clock.after(10, cancelLate);

        clock.tick(100);

        expect(late).not.toHaveBeenCalled();
    });

    it('cancelling a callback that already ran does nothing', () => {
        const clock = new Clock();
        const callback = vi.fn();
        const cancel = clock.after(10, callback);
        clock.tick(10);

        cancel();
        clock.tick(10);

        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('keeps the callbacks that did not run when one throws', () => {
        const clock = new Clock();
        const after = vi.fn();
        clock.after(10, () => {
            throw new Error('boom');
        });
        clock.after(20, after);

        expect(() => {
            clock.tick(100);
        }).toThrow('boom');
        expect(clock.now()).toBe(100);
        expect(after).not.toHaveBeenCalled();

        clock.tick(0);
        expect(after).toHaveBeenCalledTimes(1);
    });

    it.each([Number.NaN, Infinity, -1])('rejects a delay of %s', (delay) => {
        const clock = new Clock();

        expect(() => clock.after(delay, vi.fn())).toThrow(
            new RangeError(
                `The delay must be a finite number >= 0, got ${String(delay)}.`,
            ),
        );
    });
});

describe('the read-only view', () => {
    it('reads and schedules on the clock it views', () => {
        const clock = new Clock();
        const view: ClockView = clock;
        const callback = vi.fn();

        view.after(10, callback);
        clock.tick(10);

        expect(view.now()).toBe(10);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('has no way to advance time', () => {
        expectTypeOf<ClockView>().not.toHaveProperty('tick');
    });
});

describe('next', () => {
    it('is undefined with no timer', () => {
        expect(new Clock().next()).toBeUndefined();
    });

    it('is when the soonest timer is due, and follows the clock', () => {
        const clock = new Clock();
        clock.tick(40);
        clock.after(500, () => undefined);
        const cancel = clock.after(100, () => undefined);
        clock.after(300, () => undefined);

        expect(clock.next()).toBe(140);
        cancel();
        expect(clock.next()).toBe(340);
        clock.tick(250);
        clock.tick(100);
        expect(clock.next()).toBe(540);
    });
});
