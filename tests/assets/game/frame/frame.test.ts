import { describe, expect, it, vi, type Mock } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { Frame, browserEnvironment } from '../../../../assets/game/frame/frame';
import { FakeBrowser } from './fake_environment';

interface Harness {
    browser: FakeBrowser;
    clock: Clock;
    onFrame: Mock<(elapsed: number) => void>;
    frame: Frame;
}

const setup = (idle: () => boolean = () => false): Harness => {
    const browser = new FakeBrowser();
    const clock = new Clock();
    const onFrame = vi.fn<(elapsed: number) => void>();
    const frame = new Frame({ clock, onFrame, idle, environment: browser });
    return { browser, clock, onFrame, frame };
};

describe('waking', () => {
    it('does not run before the first input', () => {
        const { browser, frame } = setup();

        expect(frame.running).toBe(false);
        expect(browser.requested).toBe(0);
    });

    it('starts the loop, and a second wake changes nothing', () => {
        const { browser, frame } = setup();

        frame.wake();
        frame.wake();

        expect(frame.running).toBe(true);
        expect(browser.requested).toBe(1);
    });

    it('measures the first frame from the wake, not from the page load', () => {
        const { browser, clock, onFrame, frame } = setup();
        browser.time = 5000;

        frame.wake();
        browser.frame(5016);

        expect(onFrame).toHaveBeenCalledExactlyOnceWith(16);
        expect(clock.now()).toBe(16);
    });

    it('never gives a negative step when the frame stamp precedes the wake', () => {
        const { browser, clock, onFrame, frame } = setup();
        browser.time = 100;

        frame.wake();
        browser.frame(98);

        expect(onFrame).toHaveBeenCalledExactlyOnceWith(0);
        expect(clock.now()).toBe(0);
    });

    it('does not start on a hidden tab', () => {
        const { browser, frame } = setup();
        browser.isHidden = true;

        frame.wake();

        expect(frame.running).toBe(false);
        expect(browser.requested).toBe(0);
    });
});

describe('looping', () => {
    it('ticks the clock then draws, frame after frame', () => {
        const { browser, clock, onFrame, frame } = setup();
        const order: string[] = [];
        clock.after(10, () => order.push('timer'));
        onFrame.mockImplementation(() => order.push('frame'));

        frame.wake();
        browser.frame(16);
        browser.frame(33);

        expect(order).toEqual(['timer', 'frame', 'frame']);
        expect(onFrame.mock.calls).toEqual([[16], [17]]);
        expect(clock.now()).toBe(33);
        expect(browser.pending).toBe(true);
    });

    it('stops once everything is at rest, and wakes again on input', () => {
        let idle = false;
        const { browser, frame } = setup(() => idle);
        frame.wake();
        browser.frame(16);
        idle = true;
        browser.frame(32);

        expect(frame.running).toBe(false);
        expect(browser.pending).toBe(false);

        frame.wake();
        expect(frame.running).toBe(true);
        expect(browser.pending).toBe(true);
    });

    it('stops, and lets the error out, when a frame throws', () => {
        const { browser, onFrame, frame } = setup();
        onFrame.mockImplementation(() => {
            throw new Error('boom');
        });
        frame.wake();

        expect(() => {
            browser.frame(16);
        }).toThrow('boom');
        expect(frame.running).toBe(false);

        onFrame.mockImplementation(() => undefined);
        frame.wake();
        expect(browser.pending).toBe(true);
    });
});

describe('visibility', () => {
    it('freezes a hidden tab, then resumes it with no time jump', () => {
        const { browser, clock, onFrame, frame } = setup();
        frame.wake();
        browser.frame(16);

        browser.changeVisibility(true);
        expect(frame.running).toBe(false);
        expect(browser.pending).toBe(false);
        expect(browser.cancelled).toHaveLength(1);

        browser.time = 60_000;
        browser.changeVisibility(false);
        expect(frame.running).toBe(true);
        browser.frame(60_016);

        expect(onFrame).toHaveBeenLastCalledWith(16);
        expect(clock.now()).toBe(32);
    });

    it('does nothing when a hidden tab was already stopped', () => {
        const { browser, frame } = setup();

        browser.changeVisibility(true);

        expect(frame.running).toBe(false);
        expect(browser.cancelled).toEqual([]);
    });

    it('wakes up when the tab shows again, even if it was idle', () => {
        const { browser, frame } = setup();

        browser.changeVisibility(false);

        expect(frame.running).toBe(true);
    });
});

describe('sleeping with a timer pending', () => {
    // Idle once the first frame ran.
    const sleeper = (): Harness => {
        let calm = false;
        const h = setup(() => calm);
        h.frame.wake();
        calm = true;
        return h;
    };

    it('sets one real timeout for the next timer, and carries the game to it', () => {
        const h = sleeper();
        const fired = vi.fn();
        h.clock.after(5000, fired);

        h.browser.frame(16);
        expect(h.frame.running).toBe(false);
        expect([...h.browser.timeouts.values()].map((t) => t.delay)).toEqual([
            4984,
        ]);

        h.browser.fireTimeout();

        expect(fired).toHaveBeenCalledTimes(1);
        expect(h.clock.now()).toBe(5000);
        expect(h.frame.running).toBe(true);
        expect(h.browser.pending).toBe(true);
    });

    it('sets none without a timer', () => {
        const h = sleeper();

        h.browser.frame(16);

        expect(h.browser.timeouts.size).toBe(0);
    });

    it('waits for the soonest timer, and not a negative time', () => {
        const h = sleeper();
        h.clock.after(300, vi.fn());
        h.clock.after(100, vi.fn());

        h.browser.frame(16);

        expect([...h.browser.timeouts.values()].map((t) => t.delay)).toEqual([
            84,
        ]);
    });

    it('is cleared when the loop wakes for another reason', () => {
        const h = sleeper();
        h.clock.after(5000, vi.fn());
        h.browser.frame(16);

        h.frame.wake();

        expect(h.browser.timeouts.size).toBe(0);
        expect(h.browser.clearedTimeouts).toEqual([1]);
    });

    it('is cleared when the tab is hidden, and again set after a quiet frame', () => {
        const h = sleeper();
        h.clock.after(5000, vi.fn());
        h.browser.frame(16);

        h.browser.changeVisibility(true);

        expect(h.browser.timeouts.size).toBe(0);
        expect(h.browser.clearedTimeouts).toEqual([1]);
    });

    it('is cleared when the game stops', () => {
        const h = sleeper();
        h.clock.after(5000, vi.fn());
        h.browser.frame(16);

        h.frame.stop();

        expect(h.browser.timeouts.size).toBe(0);
        expect(h.browser.clearedTimeouts).toEqual([1]);
    });

    it('sets none when the game was stopped during the frame', () => {
        const browser = new FakeBrowser();
        const clock = new Clock();
        clock.after(5000, vi.fn());
        const holder: { frame?: Frame } = {};
        holder.frame = new Frame({
            clock,
            idle: (): boolean => true,
            environment: browser,
            onFrame: (): void => {
                holder.frame?.stop();
            },
        });
        holder.frame.wake();

        browser.frame(16);

        expect(browser.timeouts.size).toBe(0);
    });

    it('wakes the loop even when a timer callback throws', () => {
        const h = sleeper();
        h.clock.after(100, () => {
            throw new Error('boom');
        });
        h.browser.frame(16);

        expect(() => {
            h.browser.fireTimeout();
        }).toThrow('boom');
        expect(h.frame.running).toBe(true);
    });

    it('clears nothing when nothing sleeps', () => {
        const h = sleeper();

        h.frame.stop();

        expect(h.browser.clearedTimeouts).toEqual([]);
    });
});

describe('stop', () => {
    it('cancels the pending frame, stops watching and refuses to wake again', () => {
        const { browser, frame } = setup();
        frame.wake();

        frame.stop();

        expect(frame.running).toBe(false);
        expect(browser.cancelled).toHaveLength(1);
        expect(browser.watching).toBe(false);
        frame.wake();
        expect(frame.running).toBe(false);
        expect(browser.requested).toBe(1);
    });

    it('can stop a loop that is not running', () => {
        const { browser, frame } = setup();

        frame.stop();

        expect(browser.cancelled).toEqual([]);
    });
});

describe('browserEnvironment', () => {
    it('reads the real frame loop, clock and visibility', () => {
        const request = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockReturnValue(7);
        const cancel = vi
            .spyOn(window, 'cancelAnimationFrame')
            .mockReturnValue();
        vi.spyOn(performance, 'now').mockReturnValue(123);
        const callback = vi.fn();

        expect(browserEnvironment.request(callback)).toBe(7);
        expect(request).toHaveBeenCalledWith(callback);
        browserEnvironment.cancel(7);
        expect(cancel).toHaveBeenCalledWith(7);
        expect(browserEnvironment.now()).toBe(123);
        expect(browserEnvironment.hidden()).toBe(document.hidden);

        const listener = vi.fn();
        const controller = new AbortController();
        browserEnvironment.watchVisibility(listener, controller.signal);
        document.dispatchEvent(new Event('visibilitychange'));
        expect(listener).toHaveBeenCalledTimes(1);
        controller.abort();
        document.dispatchEvent(new Event('visibilitychange'));
        expect(listener).toHaveBeenCalledTimes(1);

        vi.restoreAllMocks();
    });

    it('sets and clears a real timeout', () => {
        vi.useFakeTimers();
        const callback = vi.fn();

        const first = browserEnvironment.timeout(callback, 100);
        browserEnvironment.timeout(callback, 100);
        browserEnvironment.clearTimeout(first);
        vi.advanceTimersByTime(100);

        expect(callback).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
