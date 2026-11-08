import type { Clock } from '../clock/clock';

// What the loop needs from the browser: the only place the game touches its frame loop and clock.
export interface FrameEnvironment {
    request(callback: (time: number) => void): number;
    cancel(handle: number): void;
    now(): number;
    hidden(): boolean;
    watchVisibility(listener: () => void, signal: AbortSignal): void;
}

export const browserEnvironment: FrameEnvironment = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => {
        cancelAnimationFrame(handle);
    },
    now: () => performance.now(),
    hidden: () => document.hidden,
    watchVisibility: (listener, signal) => {
        document.addEventListener('visibilitychange', listener, { signal });
    },
};

export interface FrameOptions {
    clock: Clock;
    // Runs once per frame, after the clock ticked: the step of the physics, then the drawing.
    onFrame: (elapsed: number) => void;
    // True when nothing moves and nothing is pending: the loop then stops until the next wake.
    idle: () => boolean;
    environment?: FrameEnvironment;
}

// The game's one loop. It only runs while something moves, and never on a hidden tab.
export class Frame {
    readonly #options: FrameOptions;
    readonly #environment: FrameEnvironment;
    readonly #abort = new AbortController();
    #handle: number | undefined;
    #running = false;
    #last = 0;

    constructor(options: FrameOptions) {
        this.#options = options;
        this.#environment = options.environment ?? browserEnvironment;
        this.#environment.watchVisibility(() => {
            this.#onVisibility();
        }, this.#abort.signal);
    }

    get running(): boolean {
        return this.#running;
    }

    // Input, a timer or an effect calls this: it starts the loop if it was asleep.
    wake(): void {
        if (
            this.#running ||
            this.#abort.signal.aborted ||
            this.#environment.hidden()
        ) {
            return;
        }
        this.#running = true;
        // The time asleep is not game time: measure from now.
        this.#last = this.#environment.now();
        this.#schedule();
    }

    stop(): void {
        this.#abort.abort();
        this.#pause();
    }

    #schedule(): void {
        this.#handle = this.#environment.request((time) => {
            this.#frame(time);
        });
    }

    #pause(): void {
        this.#running = false;
        if (this.#handle !== undefined) {
            this.#environment.cancel(this.#handle);
            this.#handle = undefined;
        }
    }

    #frame(time: number): void {
        this.#handle = undefined;
        // The frame's stamp can precede the wake's reading by a hair.
        const elapsed = Math.max(0, time - this.#last);
        this.#last = time;
        try {
            this.#options.clock.tick(elapsed);
            this.#options.onFrame(elapsed);
        } catch (error) {
            this.#running = false;
            throw error;
        }
        if (this.#options.idle()) {
            this.#running = false;
        } else {
            this.#schedule();
        }
    }

    #onVisibility(): void {
        if (this.#environment.hidden()) {
            this.#pause();
        } else {
            this.wake();
        }
    }
}
