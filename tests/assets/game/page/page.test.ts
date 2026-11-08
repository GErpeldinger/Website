import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    clearPlacement,
    measureBounds,
    measurePieces,
    pieceAt,
    prefersReducedMotion,
    resetPiece,
    scrollOffset,
    setState,
    writePlacements,
} from '../../../../assets/game/page/page';
import { byId, rect } from '../dom';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

// Each element gets the box the test says.
const measured = (html: string, boxes: Record<string, DOMRect>): void => {
    document.body.innerHTML = html;
    for (const [selector, box] of Object.entries(boxes)) {
        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`No ${selector}`);
        }
        vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(box);
    }
};

describe('measurePieces', () => {
    it('turns each data-physics element into a spec at its page position', () => {
        measured(
            `<main>
                <p id="a" data-physics="block" data-weight="light">A</p>
                <a id="b" data-physics="link" data-hangable="false" href="/">B</a>
                <span id="c" data-physics="letter">C</span>
            </main>`,
            {
                '#a': rect(10, 20, 200, 60),
                '#b': rect(30, 100, 80, 20),
                '#c': rect(50, 150, 40, 100),
            },
        );

        const { specs } = measurePieces(document.body, { x: 5, y: 1000 });

        expect(specs).toEqual([
            {
                id: 0,
                kind: 'block',
                traits: {
                    grabbable: true,
                    hangable: false,
                    breakable: false,
                    weight: 'light',
                },
                x: 10 + 100 + 5,
                y: 20 + 30 + 1000,
                width: 200,
                height: 60,
            },
            {
                id: 1,
                kind: 'link',
                traits: {
                    grabbable: true,
                    hangable: false,
                    breakable: false,
                    weight: 'medium',
                },
                x: 30 + 40 + 5,
                y: 100 + 10 + 1000,
                width: 80,
                height: 20,
            },
            {
                id: 2,
                kind: 'letter',
                traits: {
                    grabbable: true,
                    hangable: false,
                    breakable: false,
                    weight: 'light',
                },
                x: 50 + 20 + 5,
                y: 150 + 50 + 1000,
                width: 40,
                // A letter's body is trimmed to its glyph.
                height: 74,
            },
        ]);
    });

    it('pins every piece before measuring any, so the states styles are in place', () => {
        measured(
            `<p id="a" data-physics="block">A</p>
             <p id="b" data-physics="photo">B</p>
             <p id="c" data-physics="block">C</p>`,
            {
                '#a': rect(0, 0, 50, 50),
                '#b': rect(0, 0, 50, 50),
                '#c': rect(0, 0, 50, 50),
            },
        );
        const statesWhenMeasured: (string | undefined)[][] = [];
        for (const id of ['a', 'c']) {
            vi.spyOn(byId(id), 'getBoundingClientRect').mockImplementation(
                () => {
                    statesWhenMeasured.push(
                        ['a', 'b', 'c'].map(
                            (other) => byId(other).dataset.state,
                        ),
                    );
                    return rect(0, 0, 50, 50);
                },
            );
        }

        measurePieces(document.body, { x: 0, y: 0 });

        expect(statesWhenMeasured).toEqual([
            ['pinned', undefined, 'pinned'],
            ['pinned', undefined, 'pinned'],
        ]);
    });

    it('reads every override attribute', () => {
        measured(
            `<p id="a" data-physics="letter" data-grabbable="false"
                data-hangable="true" data-breakable="true" data-weight="heavy">A</p>`,
            { '#a': rect(0, 0, 20, 20) },
        );

        const { specs } = measurePieces(document.body, { x: 0, y: 0 });

        expect(specs[0]?.traits).toEqual({
            grabbable: false,
            hangable: true,
            breakable: true,
            weight: 'heavy',
        });
    });

    it('gives a body at least 10 px each way', () => {
        measured('<p id="a" data-physics="block">A</p>', {
            '#a': rect(0, 0, 0, 3),
        });

        const { specs } = measurePieces(document.body, { x: 0, y: 0 });

        expect(specs[0]).toMatchObject({ width: 10, height: 10 });
    });

    it('keeps a body of exactly 10 px as it is', () => {
        measured('<p id="a" data-physics="block">A</p>', {
            '#a': rect(0, 0, 10, 10),
        });

        const { specs } = measurePieces(document.body, { x: 0, y: 0 });

        expect(specs[0]).toMatchObject({ width: 10, height: 10 });
    });

    it('skips an unknown kind and numbers the others without a gap', () => {
        measured(
            `<p id="a" data-physics="photo">A</p>
             <p id="b" data-physics="block">B</p>
             <p id="c">C</p>`,
            {
                '#a': rect(0, 0, 50, 50),
                '#b': rect(0, 0, 50, 50),
                '#c': rect(0, 0, 50, 50),
            },
        );

        const { specs, elements } = measurePieces(document.body, {
            x: 0,
            y: 0,
        });

        expect(specs.map((spec) => spec.id)).toEqual([0]);
        expect(elements.get(0)?.id).toBe('b');
        expect(elements.size).toBe(1);
    });
});

describe('pieceAt', () => {
    it('finds the piece an event target belongs to, the nearest one', () => {
        document.body.innerHTML = `
            <section id="outer" data-physics="block">
                <a id="link" data-physics="link" href="/"><b id="inner">x</b></a>
                <p id="text">text</p>
            </section>
            <p id="plain">plain</p>`;
        const found = measurePieces(document.body, { x: 0, y: 0 });
        const byId = (id: string): Element =>
            document.getElementById(id) as Element;

        expect(pieceAt(found, byId('inner'))).toBe(1);
        expect(pieceAt(found, byId('link'))).toBe(1);
        expect(pieceAt(found, byId('text'))).toBe(0);
        expect(pieceAt(found, byId('plain'))).toBeUndefined();
        expect(pieceAt(found, null)).toBeUndefined();
    });
});

describe('measureBounds', () => {
    it('puts the floor at the top of the ground strip, on the page', () => {
        document.body.innerHTML = '<footer id="ground" data-ground></footer>';
        vi.spyOn(
            document.documentElement,
            'clientWidth',
            'get',
        ).mockReturnValue(1000);
        vi.spyOn(
            document.getElementById('ground') as Element,
            'getBoundingClientRect',
        ).mockReturnValue(rect(0, 400, 1000, 100));

        expect(measureBounds({ x: 0, y: 250 })).toEqual({
            width: 1000,
            floor: 650,
        });
    });

    it('falls back to the bottom of the document without a ground strip', () => {
        vi.spyOn(
            document.documentElement,
            'clientWidth',
            'get',
        ).mockReturnValue(800);
        vi.spyOn(
            document.documentElement,
            'clientHeight',
            'get',
        ).mockReturnValue(600);
        vi.spyOn(
            document.documentElement,
            'scrollHeight',
            'get',
        ).mockReturnValue(2400);

        expect(measureBounds({ x: 0, y: 0 })).toEqual({
            width: 800,
            floor: 2400,
        });
    });

    it('never puts the floor above the viewport on a short page', () => {
        vi.spyOn(
            document.documentElement,
            'clientHeight',
            'get',
        ).mockReturnValue(900);
        vi.spyOn(
            document.documentElement,
            'scrollHeight',
            'get',
        ).mockReturnValue(500);

        expect(measureBounds({ x: 0, y: 0 }).floor).toBe(900);
    });
});

describe('scrollOffset', () => {
    it('reads the scroll of the window', () => {
        vi.spyOn(window, 'scrollX', 'get').mockReturnValue(12);
        vi.spyOn(window, 'scrollY', 'get').mockReturnValue(345);

        expect(scrollOffset()).toEqual({ x: 12, y: 345 });
    });
});

describe('writePlacements', () => {
    it('moves each element by its offset and turn', () => {
        document.body.innerHTML = '<p id="a"></p><p id="b"></p>';
        const a = byId('a');
        const b = byId('b');
        const elements = new Map([
            [0, a],
            [1, b],
        ]);

        writePlacements(elements, [
            { id: 1, dx: 12.3456, dy: -7, angle: 0.123456 },
        ]);

        expect(b.style.transform).toBe(
            'translate(12.35px, -7.00px) rotate(0.1235rad)',
        );
        expect(a.style.transform).toBe('');
    });

    it('ignores a placement of an unknown piece', () => {
        expect(() => {
            writePlacements(new Map(), [{ id: 4, dx: 0, dy: 0, angle: 0 }]);
        }).not.toThrow();
    });
});

describe('clearPlacement', () => {
    it('puts an element back where the page has it', () => {
        document.body.innerHTML =
            '<p id="a" style="transform: translate(1px, 1px)"></p>';
        const a = byId('a');

        clearPlacement(a);

        expect(a.style.transform).toBe('');
    });
});

describe('resetPiece', () => {
    it('gives the element back as the server rendered it', () => {
        document.body.innerHTML =
            '<p id="a" data-state="loose" style="transform: translate(1px, 1px)"></p>';
        const a = byId('a');

        resetPiece(a);

        expect(a.style.transform).toBe('');
        expect(a.hasAttribute('data-state')).toBe(false);
    });
});

describe('prefersReducedMotion', () => {
    it.each([true, false])('reads the media query: %s', (matches) => {
        const query = vi.fn().mockReturnValue({ matches });
        vi.spyOn(window, 'matchMedia').mockImplementation(query);

        expect(prefersReducedMotion()).toBe(matches);
        expect(query).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });
});

describe('setState', () => {
    it('states the piece on its element for the CSS', () => {
        document.body.innerHTML = '<p id="a"></p>';
        const a = byId('a');

        setState(a, 'held');

        expect(a.dataset.state).toBe('held');
    });
});
