import { Controller } from '@hotwired/stimulus';
import type { Game } from '../game/game';
import type { LineBook } from '../game/lines/speaker';

// The content shows first: the game, and Matter.js with it, load after the first paint.
const afterFirstPaint = (): Promise<void> =>
    new Promise((resolve) => {
        requestAnimationFrame(() => {
            setTimeout(resolve, 0);
        });
    });

export default class extends Controller {
    // The lines of the page's language, rendered by Twig from the translation catalogue.
    static override values = { lines: Object };
    declare readonly linesValue: LineBook;

    #abort: AbortController | undefined;
    #game: Game | undefined;
    #unmountDirector: (() => void) | undefined;

    override connect(): void {
        const abort = new AbortController();
        this.#abort = abort;
        void this.#start(abort.signal);
    }

    override disconnect(): void {
        this.#abort?.abort();
        this.#unmountDirector?.();
        this.#unmountDirector = undefined;
        this.#game?.stop();
        this.#game = undefined;
    }

    async #start(signal: AbortSignal): Promise<void> {
        // The element can leave at any await: the check reads the signal again each time.
        const left = (): boolean => signal.aborted;
        // The fonts decide the layout the bodies are measured from.
        await Promise.all([afterFirstPaint(), document.fonts.ready]);
        if (left()) {
            return;
        }
        // A tab left open across a deploy asks for a chunk that is gone: the page stays as the
        // server rendered it, readable and static.
        const loaded = await import('../game/game').catch(() => undefined);
        if (!loaded || left()) {
            return;
        }
        const game = loaded.startGame(this.element as HTMLElement, {
            lines: this.linesValue,
        });
        this.#game = game;
        // The director panel is for development: this branch, and the import in it, are gone
        // from a production build, which is how the panel stays out of the bundle.
        if (import.meta.env.DEV) {
            const { mountDirector } = await import('../game/director/director');
            if (!left()) {
                this.#unmountDirector = mountDirector(game);
            }
        }
    }
}
