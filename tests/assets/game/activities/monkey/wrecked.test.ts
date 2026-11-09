import { describe, expect, it } from 'vitest';
import wrecked from '../../../../../assets/game/activities/monkey/wrecked';
import comments from '../../../../../assets/game/activities/monkey/comments';
import { stage } from './stage';

const freed = { id: 0, kind: 'block', by: 'bomb' } as const;

describe('the monkey seeing his work wrecked', () => {
    it('says so, crossly, when a piece is freed just after one was put home', () => {
        const { events, motor, log, advance } = stage(
            { wrecked },
            { context: { restoredAt: 1000 } },
        );
        advance(11_000);

        events.emit('item.freed', freed);

        expect(log).toEqual(['+monkey/wrecked', 'cancel']);
        expect(motor.requests).toEqual([
            { type: 'mood', mood: 'cross', ms: 2000 },
        ]);
        expect(motor.layers).toEqual(['overlay']);
    });

    it('says so even right after another line', () => {
        const { events, log } = stage(
            { wrecked, comments },
            { context: { restoredAt: 0 } },
        );
        events.emit('item.grabbed', {
            id: 0,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        events.emit('item.freed', freed);

        expect(log).toContain('cancel');
    });

    it('lets it go once the window has closed, or when nothing was rebuilt', () => {
        const late = stage({ wrecked }, { context: { restoredAt: 0 } });
        late.advance(10_001);
        late.events.emit('item.freed', freed);
        const never = stage({ wrecked });
        never.events.emit('item.freed', freed);

        expect(late.log).toEqual([]);
        expect(never.log).toEqual([]);
    });

    it('leaves a visitor’s grab to the lazy rebuild’s stop', () => {
        const { events, log } = stage(
            { wrecked },
            { context: { restoredAt: 0, running: ['monkey/lazy_rebuild'] } },
        );

        events.emit('item.freed', { ...freed, by: 'grab' });

        expect(log).toEqual([]);
    });

    it('still complains of a bomb during a lazy rebuild', () => {
        const { events, log } = stage(
            { wrecked },
            { context: { restoredAt: 0, running: ['monkey/lazy_rebuild'] } },
        );

        events.emit('item.freed', freed);

        expect(log).toContain('cancel');
    });

    it('complains once for a blast that frees several pieces', () => {
        const { events, log, advance, motor } = stage(
            { wrecked },
            { context: { restoredAt: 0 } },
        );

        events.emit('item.freed', freed);
        events.emit('item.freed', { ...freed, id: 1 });

        expect(log.filter((entry) => entry === 'cancel')).toHaveLength(1);
        advance(3999);
        motor.finish();
        events.emit('item.freed', { ...freed, id: 3 });
        expect(log.filter((entry) => entry === 'cancel')).toHaveLength(1);
        advance(1);
        events.emit('item.freed', { ...freed, id: 2 });
        expect(log.filter((entry) => entry === 'cancel')).toHaveLength(2);
    });
});
