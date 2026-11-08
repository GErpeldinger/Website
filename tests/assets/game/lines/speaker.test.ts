import { describe, expect, it } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { Speaker, type LineBook } from '../../../../assets/game/lines/speaker';

const book: LineBook = {
    locale: 'en',
    pools: {
        grab: ['One', 'Two', 'Three'],
        hurt: ['Ouch!'],
        count: ['{n, plural, one {# piece} other {# pieces}}'],
        empty: [],
    },
};

const setup = (
    cooldown?: number,
): { clock: Clock; speaker: Speaker; wait: (ms: number) => void } => {
    // One tick can span the whole wait: the default cap would split it.
    const clock = new Clock({ maxStep: 100_000 });
    return {
        clock,
        speaker: new Speaker({ book, clock, cooldown }),
        wait: (ms): void => {
            clock.tick(ms);
        },
    };
};

describe('rotation', () => {
    it('goes through a pool in order and starts again, never repeating a line twice in a row', () => {
        const { speaker, wait } = setup();
        const said: (string | undefined)[] = [];
        for (let turn = 0; turn < 5; turn++) {
            said.push(speaker.say('grab'));
            wait(2000);
        }

        expect(said).toEqual(['One', 'Two', 'Three', 'One', 'Two']);
    });

    it('rotates each pool on its own', () => {
        const { speaker, wait } = setup();

        expect(speaker.say('grab')).toBe('One');
        wait(2000);
        expect(speaker.say('hurt')).toBe('Ouch!');
        wait(2000);
        expect(speaker.say('grab')).toBe('Two');
    });

    it('keeps its place when the cooldown held a line back', () => {
        const { speaker, wait } = setup();
        speaker.say('grab');

        expect(speaker.say('grab')).toBeUndefined();
        wait(2000);

        expect(speaker.say('grab')).toBe('Two');
    });

    it('says a pool of one line again and again', () => {
        const { speaker, wait } = setup();
        speaker.say('hurt');
        wait(2000);

        expect(speaker.say('hurt')).toBe('Ouch!');
    });
});

describe('cooldown', () => {
    it('holds a line back for 1.7 s after the last one, whatever its pool', () => {
        const { speaker, wait } = setup();
        speaker.say('grab');
        wait(1699);

        expect(speaker.say('hurt')).toBeUndefined();
        wait(1);
        expect(speaker.say('hurt')).toBe('Ouch!');
    });

    it('counts from the last line, not from the start of the game', () => {
        const { speaker, wait } = setup();
        wait(1000);
        speaker.say('grab');
        wait(500);

        expect(speaker.say('hurt')).toBeUndefined();
        wait(1200);
        expect(speaker.say('hurt')).toBe('Ouch!');
    });

    it('lets the very first line through at the start of the game', () => {
        expect(setup().speaker.say('hurt')).toBe('Ouch!');
    });

    it('does not count a line it held back', () => {
        const { speaker, wait } = setup();
        speaker.say('grab');
        wait(1000);
        speaker.say('hurt');
        wait(700);

        expect(speaker.say('hurt')).toBe('Ouch!');
    });

    it('uses the cooldown it is given', () => {
        const { speaker, wait } = setup(500);
        speaker.say('grab');
        wait(499);
        expect(speaker.say('hurt')).toBeUndefined();
        wait(1);
        expect(speaker.say('hurt')).toBe('Ouch!');
    });

    it('can be overridden for a line that must play, which restarts the cooldown', () => {
        const { speaker, wait } = setup();
        speaker.say('grab');

        expect(speaker.say('hurt', {}, { force: true })).toBe('Ouch!');
        wait(1000);
        expect(speaker.say('grab')).toBeUndefined();
    });

    it('is not overridden by force: false', () => {
        const { speaker } = setup();
        speaker.say('grab');

        expect(speaker.say('hurt', {}, { force: false })).toBeUndefined();
    });
});

describe('parameters', () => {
    it('formats the line in the language of the book', () => {
        const { speaker, wait } = setup();

        expect(speaker.say('count', { n: 1 })).toBe('1 piece');
        wait(2000);
        expect(speaker.say('count', { n: 4 })).toBe('4 pieces');
    });

    it('formats with the locale of the book', () => {
        const clock = new Clock();
        const speaker = new Speaker({
            book: { locale: 'fr', pools: { count: ['{n} pièces'] } },
            clock,
        });

        expect(speaker.say('count', { n: 12345 })).toMatch(/^12\s345 pièces$/u);
    });
});

describe('a key the book lacks', () => {
    it('fails, even when the cooldown would hold the line back', () => {
        const { speaker } = setup();
        speaker.say('grab');

        expect(() => speaker.say('nope')).toThrow('No line "nope"');
    });

    it('fails for an empty pool, and for a name of the object prototype', () => {
        const { speaker } = setup();

        expect(() => speaker.say('empty')).toThrow('No line "empty"');
        expect(() => speaker.say('toString')).toThrow('No line "toString"');
    });

    it('does not move the cooldown when it fails', () => {
        const { speaker } = setup();
        expect(() => speaker.say('nope')).toThrow();

        expect(speaker.say('hurt')).toBe('Ouch!');
    });
});

describe('has', () => {
    it('tells whether a pool has lines', () => {
        const { speaker } = setup();

        expect(speaker.has('grab')).toBe(true);
        expect(speaker.has('empty')).toBe(false);
        expect(speaker.has('nope')).toBe(false);
        expect(speaker.has('toString')).toBe(false);
    });
});
