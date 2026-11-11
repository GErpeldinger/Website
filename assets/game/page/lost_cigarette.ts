import '../../styles/blocks/effects.css';
import type { CigaretteView } from '../physics/cigarette';
import art from './lost_cigarette.svg?raw';

// The art is drawn in a 16 x 24 frame whose origin (-8, -20) puts the stick's centre at the
// frame's (8, 20), shown at that size in CSS pixels (`--cigarette-width`, `--cigarette-height`).
const HALF_WIDTH = 8;
const ABOVE = 20;

// The cigarette he dropped, drawn where its body lies: a white stick with an ember, turned with
// it, and a wisp of smoke that rises from the ember. One at most. The picture is made here and
// the CSS (`effects.css`) animates the wisp; what moves is a transform.
export class LostCigarette {
    readonly #parent: HTMLElement;
    readonly #still: boolean;
    readonly #source: string;
    #drawn: { element: SVGElement; stick: Element } | undefined;

    // `still`: reduced motion, no smoke. The art is the cigarette's unless a test brings its own.
    constructor(parent: HTMLElement, still: boolean, source: string = art) {
        this.#parent = parent;
        this.#still = still;
        this.#source = source;
    }

    // One frame: it is drawn or moved where the world says it lies, or taken away when it lies
    // nowhere (picked up, given up on, or the page measured again).
    step(view: CigaretteView | undefined): void {
        if (!view) {
            this.clear();
            return;
        }
        const { element, stick } = this.#drawn ?? this.#draw();
        element.style.transform = `translate(${(view.x - HALF_WIDTH).toFixed(2)}px, ${(view.y - ABOVE).toFixed(2)}px)`;
        stick.setAttribute(
            'transform',
            `rotate(${((view.angle * 180) / Math.PI).toFixed(2)})`,
        );
    }

    clear(): void {
        this.#drawn?.element.remove();
        this.#drawn = undefined;
    }

    #draw(): { element: SVGElement; stick: Element } {
        const template = document.createElement('template');
        template.innerHTML = this.#source;
        const element = template.content.querySelector('svg');
        const stick = element?.querySelector('.stick');
        if (!element || !stick) {
            throw new Error('The cigarette art has no <svg> with a stick.');
        }
        if (this.#still) {
            element.dataset.still = '';
        }
        this.#parent.append(element);
        this.#drawn = { element, stick };
        return this.#drawn;
    }
}
