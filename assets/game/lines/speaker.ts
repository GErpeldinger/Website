import type { ClockView } from '../clock/clock';
import { formatLine, type LineParams } from './format';

// The lines of the page's language: pools of variants by key, as the server renders them from the
// translation catalogue.
export interface LineBook {
    readonly locale: string;
    readonly pools: Readonly<Record<string, readonly string[]>>;
}

export interface SpeakerOptions {
    book: LineBook;
    clock: ClockView;
    // The quiet time after a line, in ms of game time.
    cooldown?: number;
}

export interface SayOptions {
    // Plays whatever the cooldown says.
    force?: boolean;
}

// Picks what one speaker says: each pool in turn, and never two lines closer than the cooldown.
export class Speaker {
    readonly #book: LineBook;
    readonly #clock: ClockView;
    readonly #cooldown: number;
    readonly #turns = new Map<string, number>();
    #lastAt: number | undefined;

    constructor({ book, clock, cooldown = 1700 }: SpeakerOptions) {
        this.#book = book;
        this.#clock = clock;
        this.#cooldown = cooldown;
    }

    has(key: string): boolean {
        return this.#pool(key) !== undefined;
    }

    // The line to show, or undefined when the cooldown held it back. A key the book lacks fails
    // either way, so a typo shows at once rather than whenever the cooldown allows.
    say(
        key: string,
        params: LineParams = {},
        { force = false }: SayOptions = {},
    ): string | undefined {
        const pool = this.#pool(key);
        if (pool === undefined) {
            throw new Error(
                `No line "${key}" in the ${this.#book.locale} book.`,
            );
        }
        const now = this.#clock.now();
        if (
            !force &&
            this.#lastAt !== undefined &&
            now - this.#lastAt < this.#cooldown
        ) {
            return undefined;
        }
        // Formatted first: a line that fails does not spend the cooldown or its turn.
        const turn = this.#turns.get(key) ?? 0;
        const text = formatLine(
            // Stryker disable next-line StringLiteral: the pool is not empty; this satisfies the compiler
            pool[turn % pool.length] ?? '',
            params,
            this.#book.locale,
        );
        this.#turns.set(key, turn + 1);
        this.#lastAt = now;
        return text;
    }

    #pool(key: string): readonly string[] | undefined {
        const pool = Object.hasOwn(this.#book.pools, key)
            ? this.#book.pools[key]
            : undefined;
        return pool === undefined || pool.length === 0 ? undefined : pool;
    }
}
