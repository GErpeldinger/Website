import '../../styles/blocks/effects.css';
import type { BombView } from '../physics/world';
import art from './bomb.svg?raw';

// The art is drawn in a 48 x 48 frame centred on the bomb's body, shown at that size in CSS
// pixels (`--bomb-size`).
const HALF = 24;
// The fuse is a quadratic curve from the bomb to its tip, in the art's units.
const BASE = { x: 6, y: -13 };
const BEND = { x: 11, y: -22 };
const TIP = { x: 18, y: -20 };
// The spark swells for the last 500 ms of the 1.5 s fuse.
const URGENT = 1 - 500 / 1500;

const along = (s: number, from: number, bend: number, to: number): number =>
    (1 - s) ** 2 * from + 2 * (1 - s) * s * bend + s ** 2 * to;

// The bombs waiting to blow, drawn where their bodies are. The picture is made here and the CSS
// (`effects.css`) does the rest; what moves is a transform and the spark's place on the fuse.
export class Bombs {
    readonly #parent: HTMLElement;
    readonly #still: boolean;
    readonly #source: string;
    readonly #drawn = new Map<number, SVGElement>();

    // `still`: reduced motion, the spark stays put at the tip of the fuse. The art is the bomb's
    // unless a test brings its own.
    constructor(parent: HTMLElement, still: boolean, source: string = art) {
        this.#parent = parent;
        this.#still = still;
        this.#source = source;
    }

    // One frame: each bomb the world lists is drawn, or moved if it already is.
    step(views: BombView[]): void {
        for (const { id, x, y, angle, fuse } of views) {
            const element = this.#drawn.get(id) ?? this.#draw(id);
            element.style.transform = `translate(${(x - HALF).toFixed(2)}px, ${(y - HALF).toFixed(2)}px) rotate(${angle.toFixed(4)}rad)`;
            if (!this.#still) {
                this.#burn(element, fuse);
            }
        }
    }

    remove(id: number): void {
        this.#drawn.get(id)?.remove();
        this.#drawn.delete(id);
    }

    clear(): void {
        for (const element of this.#drawn.values()) {
            element.remove();
        }
        this.#drawn.clear();
    }

    #draw(id: number): SVGElement {
        const template = document.createElement('template');
        template.innerHTML = this.#source;
        const element = template.content.querySelector('svg');
        if (!element) {
            throw new Error('The bomb art has no <svg>.');
        }
        element.dataset.bomb = String(id);
        if (this.#still) {
            element.dataset.still = '';
        }
        this.#parent.append(element);
        this.#drawn.set(id, element);
        return element;
    }

    // `fuse` is how far it has burnt: the spark has come that far down from the tip.
    #burn(element: SVGElement, fuse: number): void {
        const left = 1 - fuse;
        element.style.setProperty(
            '--spark-x',
            `${along(left, BASE.x, BEND.x, TIP.x).toFixed(2)}px`,
        );
        element.style.setProperty(
            '--spark-y',
            `${along(left, BASE.y, BEND.y, TIP.y).toFixed(2)}px`,
        );
        element.style.setProperty('--fuse-left', left.toFixed(3));
        if (fuse > URGENT) {
            element.dataset.urgent = '';
        } else {
            delete element.dataset.urgent;
        }
    }
}
