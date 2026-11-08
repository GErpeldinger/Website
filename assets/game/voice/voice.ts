import '../../styles/blocks/bubble.css';
import type { ClockView } from '../clock/clock';
import type { EventBus } from '../events/event_bus';
import type { Box, GameEvents, Point } from '../events/game_events';

export interface VoiceOptions {
    // The element the bubble goes into: the scene, whose box starts at the page's origin.
    host: HTMLElement;
    events: EventBus<GameEvents>;
    clock: ClockView;
    // Only the lines of this actor are drawn.
    actor: string;
    // Where the speaker is now, on the page.
    anchor: () => Point;
    // What the visitor sees of the page, in page coordinates.
    viewport: () => Box;
}

// How long a line stays up, in ms of game time (the prototype's).
export const LINE_TIME = 3200;
// Between the speaker's centre and the bubble's bottom edge, and from the viewport's edges.
const ABOVE = 58;
const MARGIN = 8;

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

// The speech bubble: one at a time, above the speaker and kept inside the viewport, gone after
// 3.2 s. The element is in the page from the start and only its text changes, so that a screen
// reader (`role="status"`, polite) announces each line as it arrives.
export class Voice {
    readonly #options: VoiceOptions;
    readonly #bubble: HTMLElement;
    readonly #unsubscribe: () => void;
    #cancelHide: (() => void) | undefined;
    #cancelSet: (() => void) | undefined;
    #shown = false;
    // Measured when a line is set and when the window is resized, not each frame: reading a
    // size flushes the layout.
    #size = { width: 0, height: 0 };

    constructor(options: VoiceOptions) {
        this.#options = options;
        const bubble = document.createElement('p');
        bubble.className = 'bubble';
        bubble.setAttribute('role', 'status');
        bubble.setAttribute('aria-live', 'polite');
        bubble.dataset.state = 'hidden';
        options.host.append(bubble);
        this.#bubble = bubble;
        this.#unsubscribe = options.events.on('line.said', (line) => {
            if (line.actor === options.actor) {
                this.#say(line.text);
            }
        });
    }

    // Keeps the bubble above the speaker: called whenever he or the viewport moves. `measure`
    // when the bubble itself may have changed size (the window was resized).
    place(measure = false): void {
        if (!this.#shown) {
            return;
        }
        if (measure) {
            this.#measure();
        }
        const { anchor, viewport } = this.#options;
        const at = anchor();
        const view = viewport();
        const { width, height } = this.#size;
        const x = clamp(
            at.x - width / 2,
            view.x + MARGIN,
            view.x + view.width - width - MARGIN,
        );
        const y = clamp(
            at.y - ABOVE - height,
            view.y + MARGIN,
            view.y + view.height - height - MARGIN,
        );
        this.#bubble.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }

    stop(): void {
        this.#unsubscribe();
        this.#cancelHide?.();
        this.#cancelSet?.();
        this.#bubble.remove();
    }

    #say(text: string): void {
        this.#cancelHide?.();
        this.#cancelSet?.();
        this.#cancelSet = undefined;
        if (this.#bubble.textContent === text) {
            // The same words again: a live region announces a change, so it is emptied first
            // and filled on the next frame.
            this.#bubble.textContent = '';
            this.#cancelSet = this.#options.clock.after(0, () => {
                this.#cancelSet = undefined;
                this.#show(text);
            });
        } else {
            this.#show(text);
        }
        this.#cancelHide = this.#options.clock.after(LINE_TIME, () => {
            this.#hide();
        });
    }

    #show(text: string): void {
        this.#bubble.textContent = text;
        this.#bubble.dataset.state = 'shown';
        this.#shown = true;
        this.#measure();
        this.place();
    }

    #measure(): void {
        this.#size = {
            width: this.#bubble.offsetWidth,
            height: this.#bubble.offsetHeight,
        };
    }

    #hide(): void {
        this.#cancelHide = undefined;
        this.#shown = false;
        this.#bubble.dataset.state = 'hidden';
        this.#bubble.textContent = '';
    }
}
