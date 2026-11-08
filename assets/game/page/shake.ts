import { STEP } from '../physics/world';

// A blast shakes the page: an offset that is redrawn every frame and dies down quickly. It is
// written to `translate`, not `transform`, so it never fights a piece's own transform.
export class Shake {
    readonly #element: HTMLElement;
    readonly #random: () => number;
    #amount = 0;

    constructor(element: HTMLElement, random: () => number) {
        this.#element = element;
        this.#random = random;
    }

    get active(): boolean {
        return this.#amount !== 0;
    }

    // `amount` is the widest offset, in pixels.
    trigger(amount: number): void {
        this.#amount = amount;
    }

    // Gone at once, the element back where it was.
    stop(): void {
        this.#amount = 0;
        this.#element.style.translate = '';
    }

    // `elapsed` is game time in ms: the shake lasts as long on a 120 Hz screen as on a 60 Hz one.
    step(elapsed: number): void {
        if (!this.active) {
            return;
        }
        if (this.#amount > 0.4) {
            const x = (this.#random() - 0.5) * this.#amount;
            const y = (this.#random() - 0.5) * this.#amount;
            this.#element.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
            this.#amount *= 0.86 ** (elapsed / STEP);
        } else {
            this.stop();
        }
    }
}
