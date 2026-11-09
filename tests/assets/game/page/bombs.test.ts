import { afterEach, describe, expect, it } from 'vitest';
import { Bombs } from '../../../../assets/game/page/bombs';
import type { BombView } from '../../../../assets/game/physics/world';

afterEach(() => {
    document.body.innerHTML = '';
});

const bombs = (): SVGElement[] =>
    Array.from(document.body.querySelectorAll<SVGElement>('[data-bomb]'));

const view = (over: Partial<BombView> = {}): BombView => ({
    id: 1,
    x: 300,
    y: 500,
    angle: 0,
    fuse: 0,
    ...over,
});

const prop = (element: Element | undefined, name: string): string =>
    (element as SVGElement | undefined)?.style.getPropertyValue(name) ?? '';

describe('a bomb', () => {
    it('is a hidden, untouchable picture, one for each bomb', () => {
        const effects = new Bombs(document.body, false);

        effects.step([view({ id: 1 }), view({ id: 2, x: 100 })]);

        const [first, second] = bombs();
        expect(bombs()).toHaveLength(2);
        expect(first?.getAttribute('aria-hidden')).toBe('true');
        expect(first?.tagName.toLowerCase()).toBe('svg');
        expect(first?.dataset.bomb).toBe('1');
        expect(second?.dataset.bomb).toBe('2');
    });

    it('is centred on its body and turned with it', () => {
        const effects = new Bombs(document.body, false);

        effects.step([view({ x: 300, y: 500, angle: 0.5 })]);

        expect(bombs()[0]?.style.transform).toBe(
            'translate(276.00px, 476.00px) rotate(0.5000rad)',
        );
    });

    it('follows its body from one frame to the next, without a second picture', () => {
        const effects = new Bombs(document.body, false);
        effects.step([view({ x: 300, y: 500 })]);
        const [first] = bombs();

        effects.step([view({ x: 320, y: 540, angle: -1 })]);

        expect(bombs()).toHaveLength(1);
        expect(bombs()[0]).toBe(first);
        expect(first?.style.transform).toBe(
            'translate(296.00px, 516.00px) rotate(-1.0000rad)',
        );
    });

    it('burns its spark down the fuse, from the tip to the bomb', () => {
        const effects = new Bombs(document.body, false);

        effects.step([view({ fuse: 0 })]);
        const [bomb] = bombs();
        expect(prop(bomb, '--spark-x')).toBe('18.00px');
        expect(prop(bomb, '--spark-y')).toBe('-20.00px');
        expect(prop(bomb, '--fuse-left')).toBe('1.000');

        effects.step([view({ fuse: 0.5 })]);
        expect(prop(bomb, '--spark-x')).toBe('11.50px');
        expect(prop(bomb, '--spark-y')).toBe('-19.25px');
        expect(prop(bomb, '--fuse-left')).toBe('0.500');

        effects.step([view({ fuse: 1 })]);
        expect(prop(bomb, '--spark-x')).toBe('6.00px');
        expect(prop(bomb, '--spark-y')).toBe('-13.00px');
        expect(prop(bomb, '--fuse-left')).toBe('0.000');
    });

    it('swells its spark for the last half second', () => {
        const effects = new Bombs(document.body, false);

        effects.step([view({ fuse: 0.66 })]);
        expect(bombs()[0]?.hasAttribute('data-urgent')).toBe(false);

        effects.step([view({ fuse: 0.67 })]);
        expect(bombs()[0]?.getAttribute('data-urgent')).toBe('');
    });

    it('swells it only past two thirds of the fuse, and no longer if the bomb is set back', () => {
        const effects = new Bombs(document.body, false);

        effects.step([view({ fuse: 1 - 500 / 1500 })]);
        expect(bombs()[0]?.hasAttribute('data-urgent')).toBe(false);

        effects.step([view({ fuse: 0.9 })]);
        expect(bombs()[0]?.hasAttribute('data-urgent')).toBe(true);
        effects.step([view({ fuse: 0.1 })]);
        expect(bombs()[0]?.hasAttribute('data-urgent')).toBe(false);
    });

    it('keeps its spark still under reduced motion, at the tip, with nothing burning down', () => {
        const effects = new Bombs(document.body, true);

        effects.step([view({ fuse: 0.9 })]);

        const [bomb] = bombs();
        expect(bomb?.getAttribute('data-still')).toBe('');
        expect(prop(bomb, '--spark-x')).toBe('');
        expect(prop(bomb, '--fuse-left')).toBe('');
        expect(bomb?.hasAttribute('data-urgent')).toBe(false);
        expect(bomb?.style.transform).toContain(
            'translate(276.00px, 476.00px)',
        );
    });

    it('does not carry the still mark when motion is allowed', () => {
        const effects = new Bombs(document.body, false);

        effects.step([view()]);

        expect(bombs()[0]?.hasAttribute('data-still')).toBe(false);
    });
});

describe('the art', () => {
    it('must hold a picture', () => {
        const effects = new Bombs(document.body, false, '<p>no picture</p>');

        expect(() => {
            effects.step([view()]);
        }).toThrow('The bomb art has no <svg>.');
    });
});

describe('taking bombs away', () => {
    it('removes one by its id', () => {
        const effects = new Bombs(document.body, false);
        effects.step([view({ id: 1 }), view({ id: 2 })]);

        effects.remove(1);

        expect(bombs().map((bomb) => bomb.dataset.bomb)).toEqual(['2']);
    });

    it('draws a bomb again if the world lists it again after it was removed', () => {
        const effects = new Bombs(document.body, false);
        effects.step([view({ id: 1 })]);
        effects.remove(1);

        effects.step([view({ id: 1 })]);

        expect(bombs()).toHaveLength(1);
    });

    it('does not draw a removed bomb again unless the world still lists it', () => {
        const effects = new Bombs(document.body, false);
        effects.step([view({ id: 1 })]);
        effects.remove(1);

        effects.step([]);
        expect(bombs()).toEqual([]);
        effects.remove(1);
        expect(bombs()).toEqual([]);
    });

    it('clears them all', () => {
        const effects = new Bombs(document.body, false);
        effects.step([view({ id: 1 }), view({ id: 2 })]);

        effects.clear();
        expect(bombs()).toEqual([]);

        effects.step([view({ id: 3 })]);
        expect(bombs()).toHaveLength(1);
    });

    it('draws a bomb again after a clear, even under the same id', () => {
        const effects = new Bombs(document.body, false);
        effects.step([view({ id: 1 })]);
        effects.clear();

        effects.step([view({ id: 1 })]);

        expect(bombs()).toHaveLength(1);
    });
});
