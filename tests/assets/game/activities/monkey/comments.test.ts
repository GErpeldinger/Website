import { describe, expect, it } from 'vitest';
import comments from '../../../../../assets/game/activities/monkey/comments';
import type { GameEvents } from '../../../../../assets/game/events/game_events';
import { stage } from './stage';

const said = <Name extends keyof GameEvents>(
    name: Name,
    payload: GameEvents[Name],
    random = (): number => 0,
): string[] => {
    const { events, log } = stage({ comments }, { random });
    events.emit(name, payload);
    return log.filter((entry) => !/^[+-]/u.test(entry));
};

const at = { x: 10, y: 20 };

describe('the monkey comments on the visitor', () => {
    it('says a grab line for any piece', () => {
        expect(
            said('item.grabbed', { id: 1, kind: 'block', at }, () => 0.99),
        ).toEqual(['grab']);
    });

    it.each([
        ['letter', 'letter'],
        ['link', 'link'],
    ] as const)(
        'says the %s line 3 times in 5 for that kind, the general one otherwise',
        (kind, line) => {
            const payload = { id: 1, kind, at };
            expect(said('item.grabbed', payload, () => 0)).toEqual([line]);
            expect(said('item.grabbed', payload, () => 0.59)).toEqual([line]);
            expect(said('item.grabbed', payload, () => 0.6)).toEqual(['grab']);
        },
    );

    it('says a line when a piece is thrown', () => {
        expect(
            said('item.thrown', { id: 1, kind: 'block', speed: 12 }),
        ).toEqual(['drop']);
    });

    it('says a line for a tornado', () => {
        expect(said('tornado.started', { x: 300 })).toEqual(['stormTool']);
    });

    it('says a line when gravity goes off, not when it comes back', () => {
        expect(said('gravity.changed', { zero: true })).toEqual(['float']);
        expect(said('gravity.changed', { zero: false })).toEqual([]);
    });

    it('answers being grabbed even right after another line', () => {
        const { events, log } = stage({ comments });

        events.emit('item.grabbed', { id: 1, kind: 'block', at });
        events.emit('monkey.grabbed', { at });

        expect(log.filter((entry) => !/^[+-]/u.test(entry))).toEqual([
            'grab',
            'me',
        ]);
    });
});
