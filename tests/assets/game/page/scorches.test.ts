import { afterEach, describe, expect, it } from 'vitest';
import { Scorches } from '../../../../assets/game/page/scorches';

afterEach(() => {
    document.body.innerHTML = '';
});

const marks = (): HTMLElement[] =>
    Array.from(document.body.querySelectorAll<HTMLElement>('[data-scorch]'));

describe('Scorches', () => {
    it('burns a 170 px mark centred on the blast, that nobody can click', () => {
        const scorches = new Scorches(document.body, 12);

        scorches.add({ x: 300, y: 500 });

        const [mark] = marks();
        expect(marks()).toHaveLength(1);
        expect(mark?.style.position).toBe('absolute');
        expect(mark?.style.left).toBe('215px');
        expect(mark?.style.top).toBe('415px');
        expect(mark?.style.width).toBe('170px');
        expect(mark?.style.height).toBe('170px');
        expect(mark?.getAttribute('aria-hidden')).toBe('true');
        expect(mark?.getAttribute('data-scorch')).toBe('');
    });

    it('keeps the newest marks only', () => {
        const scorches = new Scorches(document.body, 2);

        scorches.add({ x: 100, y: 100 });
        scorches.add({ x: 200, y: 100 });
        scorches.add({ x: 300, y: 100 });

        expect(marks().map((mark) => mark.style.left)).toEqual([
            '115px',
            '215px',
        ]);
    });

    it('keeps exactly its limit', () => {
        const scorches = new Scorches(document.body, 2);

        scorches.add({ x: 100, y: 100 });
        scorches.add({ x: 200, y: 100 });

        expect(marks()).toHaveLength(2);
    });

    it('wipes every mark on clear, and starts afresh', () => {
        const scorches = new Scorches(document.body, 2);
        scorches.add({ x: 100, y: 100 });
        scorches.add({ x: 200, y: 100 });

        scorches.clear();
        expect(marks()).toEqual([]);

        scorches.add({ x: 300, y: 100 });
        scorches.add({ x: 400, y: 100 });
        expect(marks()).toHaveLength(2);
    });
});
