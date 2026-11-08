import { Controller } from '@hotwired/stimulus';
import type { Game } from '../game/game';

// The content shows first: the game, and Matter.js with it, load after the first paint.
const afterFirstPaint = (): Promise<void> =>
    new Promise((resolve) => {
        requestAnimationFrame(() => {
            setTimeout(resolve, 0);
        });
    });

export default class extends Controller {
    #abort: AbortController | undefined;
    #game: Game | undefined;

    override connect(): void {
        const abort = new AbortController();
        this.#abort = abort;
        void this.#start(abort.signal);
    }

    override disconnect(): void {
        this.#abort?.abort();
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
        if (loaded && !left()) {
            const { startGame } = loaded;
            this.#game = startGame(this.element as HTMLElement);
        }
    }
}
