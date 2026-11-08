import { describe, expect, it } from 'vitest';
import {
    densityOf,
    heightScaleOf,
    kindOf,
    traitsOf,
} from '../../../../assets/game/physics/kinds';

describe('kindOf', () => {
    it.each(['letter', 'block', 'link'] as const)('knows %s', (kind) => {
        expect(kindOf(kind)).toBe(kind);
    });

    it.each([null, undefined, '', 'photo', 'Letter'])(
        'does not know %j',
        (value) => {
            expect(kindOf(value)).toBeUndefined();
        },
    );
});

describe('traitsOf', () => {
    it('gives each kind the defaults of the table in docs/architecture.md', () => {
        expect(traitsOf('letter', {})).toEqual({
            grabbable: true,
            hangable: false,
            breakable: false,
            weight: 'light',
        });
        expect(traitsOf('block', {})).toEqual({
            grabbable: true,
            hangable: false,
            breakable: false,
            weight: 'heavy',
        });
        expect(traitsOf('link', {})).toEqual({
            grabbable: true,
            hangable: true,
            breakable: false,
            weight: 'medium',
        });
    });

    it('lets each attribute override its default', () => {
        expect(
            traitsOf('letter', {
                grabbable: 'false',
                hangable: 'true',
                breakable: 'true',
                weight: 'heavy',
            }),
        ).toEqual({
            grabbable: false,
            hangable: true,
            breakable: true,
            weight: 'heavy',
        });
        expect(
            traitsOf('link', { hangable: 'false', weight: 'light' }),
        ).toEqual({
            grabbable: true,
            hangable: false,
            breakable: false,
            weight: 'light',
        });
    });

    it('keeps the default for a missing or invalid value', () => {
        expect(
            traitsOf('link', {
                grabbable: null,
                hangable: 'yes',
                breakable: '',
                weight: 'huge',
            }),
        ).toEqual(traitsOf('link', {}));
    });
});

describe('densityOf', () => {
    it('grows with the weight, the medium one being the prototype density', () => {
        expect(densityOf('medium')).toBe(0.0014);
        expect(densityOf('light')).toBeLessThan(densityOf('medium'));
        expect(densityOf('heavy')).toBeGreaterThan(densityOf('medium'));
    });
});

describe('heightScaleOf', () => {
    it('trims a letter, whose line box is taller than its glyph', () => {
        expect(heightScaleOf('letter')).toBe(0.74);
        expect(heightScaleOf('block')).toBe(1);
        expect(heightScaleOf('link')).toBe(1);
    });
});
