import { afterEach, describe, expect, it } from 'vitest';
import { LostCigarette } from '../../../../assets/game/page/lost_cigarette';

afterEach(() => {
    document.body.innerHTML = '';
});

const drawn = (): SVGElement[] =>
    Array.from(
        document.body.querySelectorAll<SVGElement>('svg.lost-cigarette'),
    );

describe('the cigarette on the floor', () => {
    it('draws nothing while it is in his mouth', () => {
        const effect = new LostCigarette(document.body, false);

        effect.step(undefined);

        expect(drawn()).toHaveLength(0);
    });

    it('is a hidden, untouchable picture of a white stick with an ember', () => {
        const effect = new LostCigarette(document.body, false);

        effect.step({ x: 400, y: 690, angle: 0 });

        const [element] = drawn();
        expect(drawn()).toHaveLength(1);
        expect(element?.getAttribute('aria-hidden')).toBe('true');
        expect(element?.getAttribute('focusable')).toBe('false');
        const [stick, ember] = element?.querySelectorAll('.stick rect') ?? [];
        expect(stick?.getAttribute('width')).toBe('10');
        expect(stick?.getAttribute('height')).toBe('3');
        expect(stick?.getAttribute('fill')).toBe('#f5f5f5');
        expect(ember?.getAttribute('width')).toBe('2.5');
        expect(ember?.getAttribute('fill')).toBe('#ff8a4a');
        expect(element?.querySelector('.wisp')).not.toBeNull();
    });

    it('is centred on its body, the wisp above it and not turned with it', () => {
        const effect = new LostCigarette(document.body, false);

        effect.step({ x: 400, y: 690, angle: 0 });

        expect(drawn()[0]?.style.transform).toBe(
            'translate(392.00px, 670.00px)',
        );
    });

    it('turns the stick with the body, in degrees', () => {
        const effect = new LostCigarette(document.body, false);

        effect.step({ x: 400, y: 690, angle: Math.PI / 2 });

        expect(
            drawn()[0]?.querySelector('.stick')?.getAttribute('transform'),
        ).toBe('rotate(90.00)');
    });

    it('follows its body from one frame to the next, without a second picture', () => {
        const effect = new LostCigarette(document.body, false);
        effect.step({ x: 400, y: 690, angle: 0 });
        const [first] = drawn();

        effect.step({ x: 430, y: 695.5, angle: -0.5 });

        expect(drawn()).toHaveLength(1);
        expect(drawn()[0]).toBe(first);
        expect(first?.style.transform).toBe('translate(422.00px, 675.50px)');
    });

    it('goes when it is picked up', () => {
        const effect = new LostCigarette(document.body, false);
        effect.step({ x: 400, y: 690, angle: 0 });

        effect.step(undefined);

        expect(drawn()).toHaveLength(0);
    });

    it('is drawn again, new, when he loses the next', () => {
        const effect = new LostCigarette(document.body, false);
        effect.step({ x: 400, y: 690, angle: 0 });
        const [first] = drawn();
        effect.step(undefined);

        effect.step({ x: 100, y: 690, angle: 0 });

        expect(drawn()).toHaveLength(1);
        expect(drawn()[0]).not.toBe(first);
    });

    it('is cleared when the game stops', () => {
        const effect = new LostCigarette(document.body, false);
        effect.step({ x: 400, y: 690, angle: 0 });

        effect.clear();
        effect.clear();

        expect(drawn()).toHaveLength(0);
    });
});

describe('the smoke of the cigarette', () => {
    it('rises unless motion is reduced, when the picture says it is still', () => {
        const moving = new LostCigarette(document.body, false);
        moving.step({ x: 400, y: 690, angle: 0 });
        const still = new LostCigarette(document.body, true);
        still.step({ x: 100, y: 690, angle: 0 });

        const [a, b] = drawn();
        expect(a?.hasAttribute('data-still')).toBe(false);
        expect(b?.hasAttribute('data-still')).toBe(true);
        expect(b?.dataset.still).toBe('');
    });
});

describe('the art', () => {
    it('must have a stick', () => {
        const effect = new LostCigarette(
            document.body,
            false,
            '<svg><circle/></svg>',
        );

        expect(() => {
            effect.step({ x: 0, y: 0, angle: 0 });
        }).toThrow('The cigarette art has no <svg> with a stick.');
    });

    it('must be a picture', () => {
        const effect = new LostCigarette(document.body, false, '<p>no</p>');

        expect(() => {
            effect.step({ x: 0, y: 0, angle: 0 });
        }).toThrow('The cigarette art has no <svg> with a stick.');
    });
});
