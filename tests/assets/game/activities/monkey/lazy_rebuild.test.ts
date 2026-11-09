import { describe, expect, it } from 'vitest';
import comments from '../../../../../assets/game/activities/monkey/comments';
import lazyRebuild from '../../../../../assets/game/activities/monkey/lazy_rebuild';
import type { ContextFields } from '../../../../../assets/game/brain/behaviour';
import { stage, type LiveContext } from './stage';

const pieces = (...xs: number[]): ContextFields['loosePieces'] =>
    xs.map((x, id) => ({ id, x }));

// The stage names a behaviour by its key, as the registry does by its file.
const lazy = { lazy_rebuild: lazyRebuild };

describe('the monkey tidying up on his own', () => {
    it('starts when the visitor has been quiet and a piece is broken, and walks', () => {
        const { events, motor, log } = stage(lazy, {
            context: { monkeyX: 0, loosePieces: pieces(100) },
        });

        events.emit('visitor.idle', undefined);

        expect(log).toEqual(['+monkey/lazy_rebuild', 'lazyBack']);
        expect(motor.requests).toEqual([
            { type: 'carry', piece: 0, pace: 'walk' },
        ]);
    });

    it('says so even right after another line, at the start and at the end', () => {
        const context: LiveContext = { monkeyX: 0, loosePieces: pieces(100) };
        const { events, motor, log } = stage(
            { ...lazy, comments },
            { context },
        );
        events.emit('item.grabbed', {
            id: 0,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        events.emit('visitor.idle', undefined);
        motor.finish();
        context.loosePieces = [];
        motor.finish();

        expect(log).toContain('lazyBack');
        expect(log).toContain('lazyDone');
    });

    it('does nothing when nothing is broken, or without the pieces being known', () => {
        for (const context of [{ loosePieces: [] }, {}]) {
            const { events, motor, log } = stage(lazy, { context });

            events.emit('visitor.idle', undefined);

            expect(log).toEqual([]);
            expect(motor.requests).toEqual([]);
        }
    });

    it('does not start under reduced motion, and starts when it is explicitly off', () => {
        for (const [reducedMotion, started] of [
            [true, false],
            [false, true],
        ] as const) {
            const { events, motor } = stage(lazy, {
                context: { loosePieces: pieces(100), reducedMotion },
            });

            events.emit('visitor.idle', undefined);

            expect(motor.requests.length > 0).toBe(started);
        }
    });

    it('rests and grumbles after every second piece, and says so when done', () => {
        const context: LiveContext = {
            monkeyX: 0,
            loosePieces: pieces(100, 200, 300),
        };
        const { events, motor, log, advance } = stage(lazy, { context });
        events.emit('visitor.idle', undefined);
        advance(2000);
        motor.finish();
        context.loosePieces = pieces(100, 200, 300).slice(1);
        motor.finish();
        // The first piece is home: no rest yet.
        expect(motor.requests.at(-1)).toMatchObject({
            type: 'carry',
            piece: 1,
        });
        advance(2000);
        motor.finish();
        context.loosePieces = pieces(100, 200, 300).slice(2);

        motor.finish();

        expect(log).toEqual(['+monkey/lazy_rebuild', 'lazyBack', 'lazy']);
        // He is resting: the next piece is not asked for until the rest is over.
        expect(motor.requests).toHaveLength(4);
        advance(2199);
        expect(motor.requests).toHaveLength(4);
        advance(1);
        expect(motor.requests.at(-1)).toMatchObject({
            type: 'carry',
            piece: 2,
        });
        motor.finish();
        context.loosePieces = [];
        motor.finish();
        expect(log.slice(-2)).toEqual([
            'lazyDone',
            '-monkey/lazy_rebuild:done',
        ]);
    });
});

describe('the lazy rebuild’s rest', () => {
    it('is skipped after the last piece, even the second', () => {
        const context: LiveContext = {
            monkeyX: 0,
            loosePieces: pieces(100, 200),
        };
        const { events, motor, log, advance } = stage(lazy, { context });
        events.emit('visitor.idle', undefined);
        advance(2000);
        motor.finish();
        context.loosePieces = pieces(100, 200).slice(1);
        motor.finish();
        motor.finish();
        context.loosePieces = [];

        motor.finish();

        expect(log).toEqual([
            '+monkey/lazy_rebuild',
            'lazyBack',
            'lazyDone',
            '-monkey/lazy_rebuild:done',
        ]);
    });
});
