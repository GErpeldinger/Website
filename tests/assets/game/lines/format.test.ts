import { describe, expect, it } from 'vitest';
import { formatLine } from '../../../../assets/game/lines/format';

const en = (message: string, params = {}): string =>
    formatLine(message, params, 'en');

describe('plain text', () => {
    it('is returned as it is', () => {
        expect(en('Put that back.')).toBe('Put that back.');
        expect(en('')).toBe('');
    });

    it('keeps an apostrophe that quotes nothing', () => {
        expect(en("Don't touch l'écran, it's mine")).toBe(
            "Don't touch l'écran, it's mine",
        );
    });

    it('turns two apostrophes into one', () => {
        expect(en("It''s mine")).toBe("It's mine");
    });

    it('quotes braces between apostrophes', () => {
        expect(en("Type '{name}' to continue")).toBe('Type {name} to continue');
        expect(en("A '}' and a '{'")).toBe('A } and a {');
    });

    it('reads an apostrophe quote up to its closing apostrophe, and a doubled one inside it', () => {
        expect(en("'{a''b}' ok")).toBe("{a'b} ok");
    });

    it('quotes up to the end of the message when the quote is not closed', () => {
        expect(en("x '{y")).toBe('x {y');
    });
});

describe('arguments', () => {
    it('inserts a text parameter', () => {
        expect(en('Hello {name}!', { name: 'Naïa' })).toBe('Hello Naïa!');
    });

    it('inserts a parameter more than once, and ignores spaces in the braces', () => {
        expect(en('{ a } and {a}', { a: 'x' })).toBe('x and x');
        expect(en('{   a   }', { a: 'x' })).toBe('x');
        expect(
            en('{  n  ,  plural  ,  one  {x}   other  {y}  }', { n: 1 }),
        ).toBe('x');
    });

    it('writes a number in the language of the line', () => {
        expect(en('{n} bombs', { n: 1284 })).toBe('1,284 bombs');
        expect(formatLine('{n} bombes', { n: 1284 }, 'fr')).toMatch(
            /^1\s284 bombes$/u,
        );
    });

    it('fails on a parameter the caller did not give', () => {
        expect(() => en('Hello {name}!')).toThrow(
            'The line parameter "name" is missing.',
        );
    });

    it('does not take an inherited property for a parameter', () => {
        expect(() => en('{toString}')).toThrow('"toString" is missing');
    });

    it('fails on an unclosed or empty argument', () => {
        expect(() => en('Hello {name')).toThrow('closing brace');
        expect(() => en('Hello {}')).toThrow('argument name');
        expect(() => en('Hello }')).toThrow('Unexpected "}"');
    });
});

describe('select', () => {
    const message =
        '{place, select, kitchen {In the kitchen} garage {In the garage} other {Somewhere}}';

    it('picks the case that matches the parameter', () => {
        expect(en(message, { place: 'garage' })).toBe('In the garage');
        expect(en(message, { place: 'kitchen' })).toBe('In the kitchen');
    });

    it('falls back to other', () => {
        expect(en(message, { place: 'roof' })).toBe('Somewhere');
    });

    it('fails without an other case', () => {
        expect(() =>
            en('{place, select, kitchen {a}}', { place: 'roof' }),
        ).toThrow('no case "roof" and no "other"');
    });

    it('takes a number as its text', () => {
        expect(en('{n, select, 1 {one} other {many}}', { n: 1 })).toBe('one');
    });

    it('needs no parameter for the cases it does not choose', () => {
        const message =
            '{kind, select, a {Hi {name}} b {{n, plural, one {#}}} other {Bye}}';

        expect(en(message, { kind: 'other' })).toBe('Bye');
    });

    it('nests arguments in a case', () => {
        expect(
            en('{kind, select, a {Hi {name}} other {Bye}}', {
                kind: 'a',
                name: 'Bob',
            }),
        ).toBe('Hi Bob');
    });
});

describe('plural', () => {
    const message =
        '{n, plural, =0 {No piece} one {# piece} other {# pieces}} left';

    it('picks the category of the language', () => {
        expect(en(message, { n: 1 })).toBe('1 piece left');
        expect(en(message, { n: 5 })).toBe('5 pieces left');
    });

    it('prefers an exact value to the category', () => {
        expect(en(message, { n: 0 })).toBe('No piece left');
    });

    it('follows the language: French counts zero as one', () => {
        const french = '{n, plural, one {# pièce} other {# pièces}}';
        expect(formatLine(french, { n: 0 }, 'fr')).toBe('0 pièce');
        expect(formatLine(french, { n: 2 }, 'fr')).toBe('2 pièces');
    });

    it('falls back to other when the language has a category the line lacks', () => {
        const polish = '{n, plural, one {# plik} other {# plików}}';

        // Two is "few" in Polish.
        expect(formatLine(polish, { n: 2 }, 'pl')).toBe('2 plików');
    });

    it('writes # in the language of the line', () => {
        expect(en('{n, plural, other {# pieces}}', { n: 12345 })).toBe(
            '12,345 pieces',
        );
    });

    it('leaves # alone outside a plural, and in a select inside one', () => {
        expect(en('Item #1')).toBe('Item #1');
        expect(en("A '#' here")).toBe("A '#' here");
        expect(
            en('{n, plural, other {{kind, select, other {# of #}}}}', {
                n: 2,
                kind: 'x',
            }),
        ).toBe('# of #');
    });

    it('does not pass the # of a plural down to a select inside it, quotes included', () => {
        const nested = (inner: string): string =>
            `{n, plural, other {{g, select, other {${inner}}}}}`;

        expect(en(nested('# x'), { n: 3, g: 'm' })).toBe('# x');
        expect(en(nested("'#' x"), { n: 3, g: 'm' })).toBe("'#' x");
        expect(
            en('{n, plural, other {# {g, select, other {y}} #}}', {
                n: 3,
                g: 'm',
            }),
        ).toBe('3 y 3');
    });

    it('keeps an apostrophe in a plural that quotes nothing', () => {
        expect(en("{n, plural, other {It's # pieces}}", { n: 3 })).toBe(
            "It's 3 pieces",
        );
    });

    it('quotes # between apostrophes', () => {
        expect(en("{n, plural, other {'#' is # }}", { n: 3 })).toBe('# is 3 ');
    });

    it('fails on a text parameter', () => {
        expect(() => en('{n, plural, other {#}}', { n: 'many' })).toThrow(
            'The plural parameter "n" must be a number',
        );
    });

    it('fails without an other case', () => {
        expect(() => en('{n, plural, one {#}}', { n: 5 })).toThrow(
            'no case for 5 and no "other"',
        );
    });
});

describe('what it refuses', () => {
    it('an argument type it does not know', () => {
        expect(() => en('{n, date, short}', { n: 1 })).toThrow(
            'type "date" is not supported',
        );
    });

    it('a type without cases or a case without a message', () => {
        expect(() => en('{n, plural}', { n: 1 })).toThrow('Expected ","');
        expect(() => en('{n, plural, one}', { n: 1 })).toThrow('Expected "{"');
        expect(() => en('{n, plural, one {x}', { n: 1 })).toThrow(
            'closing brace',
        );
        expect(() => en('{n, plural, one {x', { n: 1 })).toThrow(
            'closing brace',
        );
    });

    it('a case without a name', () => {
        expect(() => en('{n, select, {x}}', { n: 1 })).toThrow('case name');
    });
});
