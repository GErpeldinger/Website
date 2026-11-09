import '../../styles/blocks/effects.css';
import type { ClockView } from '../clock/clock';
import type { TornadoView } from '../physics/world';

const SVG = 'http://www.w3.org/2000/svg';
const BANDS = 12;
// The funnel is this high at most, and always ends this far under the top of the page.
const REACH = 620;
const MARGIN = 20;
// The widest ellipse is 206 px each side of the axis, and sways up to 40 more.
const HALF = 250;
// How long the funnel fades after the tornado is over, in ms of game time.
const FADE = 300;
// The prototype's dashes run 34 px per unit of phase, 9.6 units a second.
const DASH_SPEED = 34 * 9.6;

// The tornado's funnel: stacked, dashed ellipses that sway with the vortex's phase. One SVG,
// made while the world has a tornado and gone a moment after; the CSS animates the dashes
// (`effects.css`) and this moves the SVG with the axis and each ellipse with its sway.
export class Tornado {
    readonly #parent: HTMLElement;
    readonly #clock: ClockView;
    readonly #floor: () => number;
    #drawn: { funnel: SVGSVGElement; bands: SVGEllipseElement[] } | undefined;
    #fading: { funnel: SVGSVGElement; cancel: () => void } | undefined;
    #height = 0;

    // `floor` is where the page's ground is, in page coordinates, read when a funnel is drawn.
    constructor(parent: HTMLElement, clock: ClockView, floor: () => number) {
        this.#parent = parent;
        this.#clock = clock;
        this.#floor = floor;
    }

    // One frame: the world's tornado, or undefined once it is over.
    step(view: TornadoView | undefined): void {
        if (!view) {
            this.#fade();
            return;
        }
        const { funnel, bands } = this.#drawn ?? this.#draw();
        const top = this.#floor() - this.#height + MARGIN;
        funnel.style.transform = `translate(${(view.x - HALF).toFixed(2)}px, ${top.toFixed(2)}px)`;
        bands.forEach((band, index) => {
            const t = index / (BANDS - 1);
            const wobble = Math.sin(view.phase * 1.3 + t * 5) * (10 + t * 30);
            band.style.transform = `translateX(${wobble.toFixed(1)}px)`;
        });
    }

    clear(): void {
        this.#drawn?.funnel.remove();
        this.#drawn = undefined;
        this.#dropFading();
    }

    #fade(): void {
        if (!this.#drawn) {
            return;
        }
        const { funnel } = this.#drawn;
        funnel.dataset.ending = '';
        this.#drawn = undefined;
        this.#fading = {
            funnel,
            cancel: this.#clock.after(FADE, () => {
                funnel.remove();
                this.#fading = undefined;
            }),
        };
    }

    #dropFading(): void {
        this.#fading?.cancel();
        this.#fading?.funnel.remove();
        this.#fading = undefined;
    }

    #draw(): { funnel: SVGSVGElement; bands: SVGEllipseElement[] } {
        this.#dropFading();
        const reach = Math.min(this.#floor() - 10, REACH);
        this.#height = reach + 2 * MARGIN;
        const funnel = document.createElementNS(SVG, 'svg');
        funnel.dataset.tornado = '';
        funnel.setAttribute('aria-hidden', 'true');
        funnel.setAttribute('focusable', 'false');
        funnel.setAttribute(
            'viewBox',
            `0 0 ${String(2 * HALF)} ${String(this.#height)}`,
        );
        const bands: SVGEllipseElement[] = [];
        for (let index = 0; index < BANDS; index++) {
            const t = index / (BANDS - 1);
            const band = document.createElementNS(SVG, 'ellipse');
            const width = 16 + t * t * 190;
            // Every other ellipse runs half as fast again.
            const speed = DASH_SPEED * (index % 2 ? 1 : 1.5);
            band.setAttribute('cx', String(HALF));
            band.setAttribute(
                'cy',
                (this.#height - MARGIN - t * reach).toFixed(1),
            );
            band.setAttribute('rx', width.toFixed(1));
            band.setAttribute('ry', (6 + t * 13).toFixed(1));
            band.setAttribute('stroke-width', (2 + 2 * t).toFixed(1));
            band.setAttribute(
                'stroke-opacity',
                (0.2 + (1 - t) * 0.35).toFixed(2),
            );
            band.setAttribute(
                'stroke-dasharray',
                `${(width * 0.9).toFixed(1)} ${(width * 0.45).toFixed(1)}`,
            );
            band.style.setProperty('--period', (width * 1.35).toFixed(1));
            band.style.animationDuration = `${(((width * 1.35) / speed) * 1000).toFixed(0)}ms`;
            funnel.append(band);
            bands.push(band);
        }
        this.#parent.append(funnel);
        this.#drawn = { funnel, bands };
        return this.#drawn;
    }
}
