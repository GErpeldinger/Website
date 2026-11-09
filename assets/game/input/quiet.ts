import type { ClockView } from '../clock/clock';

export interface QuietOptions {
    clock: ClockView;
    // Game time, in ms, of the visitor's silence before `onQuiet`.
    after: number;
    onQuiet: () => void;
}

// Tells when the visitor has done nothing for a while: each `touch` restarts the wait, and the
// silence is told once, not again until the next touch. Nothing is waiting before the first.
export class Quiet {
    readonly #options: QuietOptions;
    #cancel: (() => void) | undefined;

    constructor(options: QuietOptions) {
        this.#options = options;
    }

    touch(): void {
        this.stop();
        this.#cancel = this.#options.clock.after(this.#options.after, () => {
            this.#cancel = undefined;
            this.#options.onQuiet();
        });
    }

    // A property, so that it can be handed over as it is to whoever stops the game's listeners.
    readonly stop = (): void => {
        this.#cancel?.();
        this.#cancel = undefined;
    };
}
