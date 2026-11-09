import '../../styles/blocks/effects.css';
import type { ClockView } from '../clock/clock';
import type { Point } from '../events/game_events';

const EMBERS = 14;
const SMOKE = 6;
// The longest particle lives this long, in ms of game time: the group goes with it.
const LASTS = 900;
// The glow of reduced motion does not animate: it simply stays this long.
const GLOW = 500;
// Flashes closer than this, in ms of game time, are skipped: WCAG 2.3.1 allows three a second.
const FLASH_GAP = 340;
const MAX_BLASTS = 6;
// A ring grows 13 px a frame in the prototype: 1.28 ms of a 60 Hz frame per px of radius.
const RING_MS_PER_PX = 1.28;

// How far a kind of particle throws, in px per frame at its fastest.
const SPEED = { ember: 9, smoke: 4 };

export interface BlastOptions {
    parent: HTMLElement;
    clock: ClockView;
    random: () => number;
    reducedMotion: boolean;
}

// What a bomb's blast shows: a flash, a ring and a handful of particles, which are short-lived
// elements animated by the CSS (`effects.css`) and removed once the last one is done. Only
// transforms and opacity move. Under reduced motion the blast is one glow that fades.
export class Blasts {
    readonly #options: BlastOptions;
    #blasts: { element: HTMLElement; cancel: () => void }[] = [];
    #flashedAt = -Infinity;

    constructor(options: BlastOptions) {
        this.#options = options;
    }

    add(at: Point, radius: number): void {
        const { parent, clock, reducedMotion } = this.#options;
        const element = document.createElement('div');
        element.dataset.blast = '';
        element.setAttribute('aria-hidden', 'true');
        element.style.left = `${String(at.x)}px`;
        element.style.top = `${String(at.y)}px`;
        if (reducedMotion) {
            element.append(this.#round('fade', radius));
        } else {
            if (clock.now() - this.#flashedAt >= FLASH_GAP) {
                this.#flashedAt = clock.now();
                element.append(this.#part('i', 'flash'));
            }
            element.append(this.#ring(radius));
            for (let i = 0; i < EMBERS; i++) {
                element.append(this.#particle('ember'));
            }
            for (let i = 0; i < SMOKE; i++) {
                element.append(this.#particle('smoke'));
            }
        }
        parent.append(element);
        const entry = {
            element,
            cancel: clock.after(reducedMotion ? GLOW : LASTS, () => {
                element.remove();
                this.#blasts = this.#blasts.filter((other) => other !== entry);
            }),
        };
        this.#blasts.push(entry);
        for (const old of this.#blasts.splice(
            0,
            this.#blasts.length - MAX_BLASTS,
        )) {
            old.cancel();
            old.element.remove();
        }
    }

    clear(): void {
        for (const { element, cancel } of this.#blasts) {
            cancel();
            element.remove();
        }
        this.#blasts = [];
    }

    #part(tag: string, name: string): HTMLElement {
        const element = document.createElement(tag);
        element.dataset.part = name;
        return element;
    }

    // A circle of the blast's radius, centred on the point.
    #round(name: string, radius: number): HTMLElement {
        const element = this.#part('i', name);
        element.style.left = `${String(-radius)}px`;
        element.style.top = `${String(-radius)}px`;
        element.style.width = `${String(2 * radius)}px`;
        element.style.height = `${String(2 * radius)}px`;
        return element;
    }

    #ring(radius: number): HTMLElement {
        const ring = this.#round('ring', radius);
        ring.style.animationDuration = `${(radius * RING_MS_PER_PX).toFixed(0)}ms`;
        return ring;
    }

    // Thrown at a random angle, then drawn down: the end of its path is all the CSS needs.
    #particle(kind: keyof typeof SPEED): HTMLElement {
        const { random } = this.#options;
        const angle = random() * 2 * Math.PI;
        const speed = SPEED[kind] * (0.25 + random());
        const life = 360 + 540 * random();
        const size = 1.6 + 3 * random();
        const reach = (speed * life) / 22;
        const fall = (life * life) / 3500;
        const element = this.#part('i', kind);
        element.style.setProperty(
            '--dx',
            `${(Math.cos(angle) * reach).toFixed(1)}px`,
        );
        element.style.setProperty(
            '--dy',
            `${(Math.sin(angle) * reach + fall).toFixed(1)}px`,
        );
        element.style.animationDuration = `${life.toFixed(0)}ms`;
        element.style.width = `${size.toFixed(1)}px`;
        element.style.height = `${size.toFixed(1)}px`;
        return element;
    }
}
