// What the Brain and the activities see of the clock: they read and schedule, the frame driver ticks.
export interface ClockView {
    now(): number;
    // Runs the callback once `delay` ms of game time have passed. Returns a function that cancels it.
    after(delay: number, callback: () => void): () => void;
}

export interface ClockOptions {
    // The longest game time one tick may add, in ms.
    maxStep?: number;
}

interface Timer {
    due: number;
    callback: () => void;
}

const assertDuration = (what: string, value: number): void => {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(
            `The ${what} must be a finite number >= 0, got ${String(value)}.`,
        );
    }
};

// Game time moves only through tick(): no real clock, so it runs and tests the same everywhere.
export class Clock implements ClockView {
    readonly #maxStep: number;
    // Insertion order is scheduling order, which breaks ties between equal due times.
    readonly #timers = new Set<Timer>();
    #now = 0;

    // A hidden tab hands the next tick a huge delta: the default cap keeps it from fast-forwarding the game.
    constructor({ maxStep = 250 }: ClockOptions = {}) {
        if (!Number.isFinite(maxStep) || maxStep <= 0) {
            throw new RangeError(
                `The maximum step must be a finite number > 0, got ${String(maxStep)}.`,
            );
        }
        this.#maxStep = maxStep;
    }

    tick(elapsed: number): void {
        assertDuration('elapsed time', elapsed);
        this.#now += Math.min(elapsed, this.#maxStep);

        // Only the timers already scheduled: one scheduled by a callback waits for the next tick,
        // even if it is already due, so callbacks cannot loop within a tick.
        const due = [...this.#timers]
            .filter((timer) => timer.due <= this.#now)
            .sort((a, b) => a.due - b.due);
        for (const timer of due) {
            // Gone when an earlier callback cancelled it. One that throws leaves the rest queued.
            if (this.#timers.delete(timer)) {
                timer.callback();
            }
        }
    }

    now(): number {
        return this.#now;
    }

    // When the next timer is due, in game time, or undefined when none is pending.
    next(): number | undefined {
        return [...this.#timers].reduce<number | undefined>(
            (soonest, { due }) =>
                soonest === undefined ? due : Math.min(soonest, due),
            undefined,
        );
    }

    after(delay: number, callback: () => void): () => void {
        assertDuration('delay', delay);
        const timer = { due: this.#now + delay, callback };
        this.#timers.add(timer);
        return () => {
            this.#timers.delete(timer);
        };
    }
}
