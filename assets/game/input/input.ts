import type { ClockView } from '../clock/clock';
import type { Point } from '../events/game_events';
import { scrollOffset } from '../page/page';
import { PointerTracker } from './pointer_tracker';

// What the visitor's hand can do to the game.
export interface InputHooks {
    // The piece an element belongs to, if the visitor may take it.
    pick(target: Element | null): number | undefined;
    grab(id: number, at: Point): boolean;
    drag(to: Point): void;
    release(velocity: Point): void;
    // Where the pointer is, for the tornado to follow.
    aim(x: number): void;
    // Something happened that may start the loop.
    wake(): void;
}

export interface InputOptions {
    root: HTMLElement;
    clock: ClockView;
    hooks: InputHooks;
    // Every listener is attached with it: aborting it detaches them all.
    signal: AbortSignal;
    // How far the page is scrolled; the window's, unless a test says otherwise.
    scroll?: () => Point;
}

// A mouse grabs as soon as it moves past this, in CSS pixels. Not before, or a click on a link
// would free it and let it fall.
const MOUSE_SLOP = 4;
// A finger that moves further than this before the long press is swiping to scroll.
const TOUCH_SLOP = 10;
// The click of a release comes within this many ms of it.
const CLICK_WINDOW = 50;
// A touch grabs after this long a press, in ms of game time.
const LONG_PRESS = 450;

interface Gesture {
    pointerId: number;
    id: number;
    touch: boolean;
    // Where the press began: on the screen, for the slop, and on the page, for the grab.
    startClient: Point;
    startPage: Point;
    client: Point;
    held: boolean;
    cancelPress: (() => void) | undefined;
}

// Turns pointer events into grabs, drags and throws. Pointer events cover mouse, pen and touch;
// a touch grabs after a long press so that a swipe still scrolls the page.
export class Input {
    readonly #clock: ClockView;
    readonly #hooks: InputHooks;
    readonly #scroll: () => Point;
    readonly #tracker = new PointerTracker();
    #gesture: Gesture | undefined;
    // When a mouse or pen drag ended, by the event's own clock: the click it produces, right
    // after, must not follow a link or press a button. A click long after is the keyboard's.
    #releasedAt: number | undefined;

    constructor({ root, clock, hooks, signal, scroll }: InputOptions) {
        this.#clock = clock;
        this.#hooks = hooks;
        this.#scroll = scroll ?? scrollOffset;

        root.addEventListener(
            'pointerdown',
            (event) => {
                this.#press(event);
            },
            { signal },
        );
        root.addEventListener(
            'dragstart',
            (event) => {
                if (hooks.pick(event.target as Element | null) !== undefined) {
                    event.preventDefault();
                }
            },
            { signal },
        );
        root.addEventListener(
            'contextmenu',
            (event) => {
                // A long press opens the menu on touch: a gesture of ours.
                if (this.#gesture) {
                    event.preventDefault();
                }
            },
            { signal },
        );
        window.addEventListener(
            'click',
            (event) => {
                this.#click(event);
            },
            { signal, capture: true },
        );
        window.addEventListener(
            'pointermove',
            (event) => {
                this.#move(event);
            },
            { signal },
        );
        window.addEventListener(
            'pointerup',
            (event) => {
                this.#lift(event, true);
            },
            { signal },
        );
        window.addEventListener(
            'pointercancel',
            (event) => {
                this.#lift(event, false);
            },
            { signal },
        );
        window.addEventListener(
            'blur',
            () => {
                this.#end({ x: 0, y: 0 });
            },
            { signal },
        );
        // A scroll under a still pointer moves the point the piece is held at.
        window.addEventListener(
            'scroll',
            () => {
                const gesture = this.#gesture;
                if (gesture?.held) {
                    hooks.drag(this.#toPage(gesture.client));
                }
            },
            { signal },
        );
        // Once a piece is held, a touch must drag it and not scroll the page. Not passive: the
        // browser only lets a listener cancel the scroll if it says so.
        window.addEventListener(
            'touchmove',
            (event) => {
                if (this.#gesture?.held) {
                    event.preventDefault();
                }
            },
            { signal, passive: false },
        );
    }

    // A press or a hold is going on: the loop must run (a long press is timed by the clock).
    get busy(): boolean {
        return this.#gesture !== undefined;
    }

    // The screen's coordinates plus the scroll: CSS pixels either way, so a Retina display
    // changes nothing.
    #toPage(client: Point): Point {
        const scroll = this.#scroll();
        return { x: client.x + scroll.x, y: client.y + scroll.y };
    }

    #press(event: PointerEvent): void {
        // Ctrl-click is a right click on a Mac.
        if (this.#gesture || event.button !== 0 || event.ctrlKey) {
            return;
        }
        const id = this.#hooks.pick(event.target as Element | null);
        if (id === undefined) {
            return;
        }
        const client = { x: event.clientX, y: event.clientY };
        const startPage = this.#toPage(client);
        const touch = event.pointerType === 'touch';
        this.#tracker.reset();
        this.#tracker.add(startPage, event.timeStamp);
        const gesture: Gesture = {
            pointerId: event.pointerId,
            id,
            touch,
            startClient: client,
            startPage,
            client,
            held: false,
            cancelPress: undefined,
        };
        this.#gesture = gesture;
        if (touch) {
            gesture.cancelPress = this.#clock.after(LONG_PRESS, () => {
                this.#grab(gesture);
            });
            this.#hooks.wake();
        } else {
            // No text selection, no native drag.
            event.preventDefault();
        }
    }

    #move(event: PointerEvent): void {
        const client = { x: event.clientX, y: event.clientY };
        const page = this.#toPage(client);
        this.#hooks.aim(page.x);
        const gesture = this.#gesture;
        if (gesture?.pointerId !== event.pointerId) {
            return;
        }
        gesture.client = client;
        this.#tracker.add(page, event.timeStamp);
        if (gesture.held) {
            this.#hooks.drag(page);
            return;
        }
        const moved = Math.hypot(
            client.x - gesture.startClient.x,
            client.y - gesture.startClient.y,
        );
        if (moved <= (gesture.touch ? TOUCH_SLOP : MOUSE_SLOP)) {
            return;
        }
        if (gesture.touch) {
            this.#abandon();
        } else {
            this.#grab(gesture);
        }
    }

    #grab(gesture: Gesture): void {
        if (!this.#hooks.grab(gesture.id, gesture.startPage)) {
            this.#gesture = undefined;
            return;
        }
        gesture.held = true;
        this.#hooks.drag(this.#toPage(gesture.client));
        this.#hooks.wake();
    }

    #abandon(): void {
        this.#gesture?.cancelPress?.();
        this.#gesture = undefined;
    }

    #lift(event: PointerEvent, released: boolean): void {
        if (this.#gesture?.pointerId !== event.pointerId) {
            return;
        }
        this.#end(
            released ? this.#tracker.velocity(event.timeStamp) : { x: 0, y: 0 },
            released ? event.timeStamp : undefined,
        );
    }

    // The gesture is over: a held piece is let go with `velocity`.
    // A touch has no click to swallow. `releasedAt` is the pointerup's timestamp.
    #end(velocity: Point, releasedAt?: number): void {
        const gesture = this.#gesture;
        this.#abandon();
        if (gesture?.held) {
            this.#hooks.release(velocity);
            this.#releasedAt = gesture.touch ? undefined : releasedAt;
        }
    }

    // The game let go of the gesture (the page was measured again): nothing is held any more.
    cancel(): void {
        this.#abandon();
    }

    #click(event: MouseEvent): void {
        const releasedAt = this.#releasedAt;
        this.#releasedAt = undefined;
        if (
            releasedAt !== undefined &&
            event.timeStamp - releasedAt <= CLICK_WINDOW
        ) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
}
