import type { Point } from '../events/game_events';

const SIZE = 170;

// A bomb leaves a mark until the next rebuild. It is positioned and sized here; how it looks
// is the CSS's: `[data-scorch]`.
export class Scorches {
    readonly #parent: HTMLElement;
    readonly #limit: number;
    #marks: HTMLElement[] = [];

    constructor(parent: HTMLElement, limit: number) {
        this.#parent = parent;
        this.#limit = limit;
    }

    add(at: Point): void {
        const mark = document.createElement('div');
        mark.dataset.scorch = '';
        mark.setAttribute('aria-hidden', 'true');
        mark.style.position = 'absolute';
        mark.style.left = `${String(at.x - SIZE / 2)}px`;
        mark.style.top = `${String(at.y - SIZE / 2)}px`;
        mark.style.width = `${String(SIZE)}px`;
        mark.style.height = `${String(SIZE)}px`;
        this.#parent.append(mark);
        this.#marks.push(mark);
        for (const old of this.#marks.splice(
            0,
            this.#marks.length - this.#limit,
        )) {
            old.remove();
        }
    }

    clear(): void {
        for (const mark of this.#marks) {
            mark.remove();
        }
        this.#marks = [];
    }
}
