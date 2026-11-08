import { describe, expect, expectTypeOf, it } from 'vitest';
import { matches, type Match } from '../../../../assets/game/brain/match';

describe('matches', () => {
    const source = { kind: 'letter', id: 3, zero: false, at: { x: 1 } };

    it('holds with no condition', () => {
        expect(matches(source, {})).toBe(true);
        expect(matches({}, {})).toBe(true);
    });

    it('compares a field to a value', () => {
        expect(matches(source, { kind: 'letter' })).toBe(true);
        expect(matches(source, { kind: 'block' })).toBe(false);
        expect(matches(source, { id: 3 })).toBe(true);
        expect(matches(source, { id: 4 })).toBe(false);
    });

    it('compares strictly', () => {
        expect(matches(source, { id: '3' })).toBe(false);
        expect(matches(source, { zero: 0 })).toBe(false);
        expect(matches(source, { zero: false })).toBe(true);
    });

    it('accepts any value of a list', () => {
        expect(matches(source, { kind: ['block', 'letter'] })).toBe(true);
        expect(matches(source, { kind: ['block', 'link'] })).toBe(false);
        expect(matches(source, { kind: [] })).toBe(false);
    });

    it('needs every field to hold', () => {
        expect(matches(source, { kind: 'letter', id: 3 })).toBe(true);
        expect(matches(source, { kind: 'letter', id: 4 })).toBe(false);
        expect(matches(source, { kind: 'block', id: 3 })).toBe(false);
    });

    it('never matches a field the source lacks', () => {
        expect(matches(source, { missing: 'x' })).toBe(false);
        expect(matches(source, { missing: ['x'] })).toBe(false);
    });

    it('does not read the prototype for a field', () => {
        expect(matches({}, { toString: undefined })).toBe(true);
        expect(matches({}, { constructor: Object })).toBe(false);
    });
});

describe('Match', () => {
    it('names only the fields that hold a string, a number or a boolean', () => {
        interface Payload {
            id: number;
            kind: 'letter' | 'block';
            at: { x: number };
            freed: number[];
        }

        expectTypeOf<Match<Payload>>().toEqualTypeOf<{
            readonly id?: number | readonly number[];
            readonly kind?:
                'letter' | 'block' | readonly ('letter' | 'block')[];
        }>();
    });
});
