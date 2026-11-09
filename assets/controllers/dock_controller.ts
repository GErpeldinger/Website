import { Controller } from '@hotwired/stimulus';
import type { Point, Tool } from '../game/events/game_events';
import type { Game } from '../game/game';

// A button's state, for the assistive technology and for the CSS, which reads data attributes only.
const show = (button: Element, on: boolean): void => {
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('data-pressed', String(on));
};

// The visitor's remote. The game controller hands it the running game and the element the hand
// listens on (`game:started`); until then the dock stays hidden, so without JavaScript or without
// the game it is simply not there.
export default class extends Controller {
    static override targets = ['tool', 'gravity'];
    declare readonly toolTargets: HTMLElement[];
    declare readonly gravityTarget: HTMLElement;

    #game: Game | undefined;
    #root: HTMLElement | undefined;
    #unsubscribe: (() => void) | undefined;
    #tool: Tool = 'grab';
    // A finger that went down with a tool in hand: it places it only if a click follows, which a
    // scroll or a pinch never produces.
    #tap = false;

    start({ detail }: CustomEvent<{ game: Game; root: HTMLElement }>): void {
        this.#game = detail.game;
        this.#root = detail.root;
        // A rotation or a resize builds the world again, with gravity back on.
        this.#unsubscribe = detail.game.events.on(
            'gravity.changed',
            ({ zero }) => {
                show(this.gravityTarget, zero);
            },
        );
        this.element.setAttribute('data-ready', 'true');
    }

    stop(): void {
        this.#unsubscribe?.();
        this.#unsubscribe = undefined;
        this.#game = undefined;
        this.#root = undefined;
        this.#tap = false;
        this.#highlight('grab');
        show(this.gravityTarget, false);
        this.element.removeAttribute('data-ready');
    }

    select(event: MouseEvent & { params: { tool: Tool } }): void {
        this.#choose(event.params.tool);
        // A keyboard has no pointer to aim with: it fires at the middle of the screen. A click
        // from a pointer has a detail, one from the keyboard has none.
        if (event.detail === 0) {
            this.#place(this.#centre());
        }
    }

    // The button only asks: `gravity.changed` shows what the world did.
    gravity({ currentTarget }: Event): void {
        const on = (currentTarget as Element).getAttribute('aria-pressed');
        this.#game?.setZeroGravity(on !== 'true');
    }

    rebuild(): void {
        this.#game?.rebuild();
    }

    // Capturing, ahead of the hand: a press on the scene with a tool in hand places it, and the
    // hand never sees it. A press on the dock is the dock's own.
    place(event: PointerEvent): void {
        // A Mac ctrl-click opens the context menu, as for the hand.
        if (!this.#aimed(event) || event.button !== 0 || event.ctrlKey) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.#tap = event.pointerType === 'touch';
        if (!this.#tap) {
            this.#place(this.#pagePoint(event));
        }
    }

    // The click that follows a press must not follow a link; a finger's tap places here. The
    // keyboard's clicks have no detail and pass: Enter on a link still works.
    swallow(event: MouseEvent): void {
        if (!this.#aimed(event) || event.detail === 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (this.#tap) {
            this.#tap = false;
            this.#place(this.#pagePoint(event));
        }
    }

    escape(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.#choose('grab');
        }
    }

    // A tool is in hand and the event is on the scene, not on the dock.
    #aimed(event: Event): boolean {
        const target = event.target as Node;
        return (
            this.#tool !== 'grab' &&
            this.#root?.contains(target) === true &&
            !this.element.contains(target)
        );
    }

    #choose(tool: Tool): void {
        if (tool === this.#tool) {
            return;
        }
        this.#highlight(tool);
        this.#game?.events.emit('tool.selected', { tool });
    }

    #highlight(tool: Tool): void {
        this.#tool = tool;
        for (const button of this.toolTargets) {
            show(button, button.dataset.dockToolParam === tool);
        }
    }

    #pagePoint(event: MouseEvent): Point {
        return {
            x: window.scrollX + event.clientX,
            y: window.scrollY + event.clientY,
        };
    }

    #centre(): Point {
        return {
            x: window.scrollX + window.innerWidth / 2,
            y: window.scrollY + window.innerHeight / 2,
        };
    }

    #place(at: Point): void {
        if (this.#tool === 'bomb') {
            this.#game?.bomb(at);
        } else if (this.#tool === 'tornado') {
            this.#game?.tornado(at);
        }
    }
}
