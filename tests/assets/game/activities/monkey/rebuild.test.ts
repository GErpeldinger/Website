import { describe, expect, it } from 'vitest';
import comments from '../../../../../assets/game/activities/monkey/comments';
import flee from '../../../../../assets/game/activities/monkey/flee';
import rebuild from '../../../../../assets/game/activities/monkey/rebuild';
import type { ContextFields } from '../../../../../assets/game/brain/behaviour';
import { stage, type LiveContext } from './stage';

const pieces = (...xs: number[]): ContextFields['loosePieces'] =>
    xs.map((x, id) => ({ id, x }));

describe('the monkey rebuilding', () => {
    it('says he is back, carries the nearest piece home first, and says he is done', () => {
        const { events, motor, log } = stage(
            { rebuild },
            {
                context: {
                    monkeyX: 450,
                    loosePieces: pieces(100, 500, 900),
                },
            },
        );

        events.emit('rebuild.requested', undefined);

        expect(log).toEqual(['+monkey/rebuild', 'back']);
        expect(motor.requests).toEqual([
            { type: 'carry', piece: 1, pace: 'run' },
        ]);
        expect(motor.layers).toEqual(['body']);
    });

    it('says he is back even right after another line', () => {
        const { events, log } = stage(
            { rebuild, comments },
            { context: { loosePieces: pieces(100) } },
        );
        events.emit('item.grabbed', {
            id: 0,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        events.emit('rebuild.requested', undefined);

        expect(log).toContain('back');
    });

    it('goes on to the next nearest piece once one is home, reading the pieces again', () => {
        const context: LiveContext = {
            monkeyX: 450,
            loosePieces: pieces(100, 500, 900),
        };
        const { events, motor, log } = stage({ rebuild }, { context });
        events.emit('rebuild.requested', undefined);

        motor.finish();
        expect(motor.requests.at(-1)).toEqual({
            type: 'place',
            piece: 1,
            pace: 'run',
        });
        // The piece is home, he stands by its home, and the visitor broke another meanwhile.
        context.monkeyX = 500;
        context.loosePieces = [
            { id: 0, x: 100 },
            { id: 2, x: 900 },
            { id: 3, x: 520 },
        ];
        motor.finish();

        expect(motor.requests.at(-1)).toEqual({
            type: 'carry',
            piece: 3,
            pace: 'run',
        });
        motor.finish();
        expect(motor.requests.at(-1)).toEqual({
            type: 'place',
            piece: 3,
            pace: 'run',
        });
        expect(log).toEqual(['+monkey/rebuild', 'back']);
    });

    it('ends saying he is done when nothing is left', () => {
        const context: LiveContext = {
            monkeyX: 0,
            loosePieces: pieces(100),
        };
        const { events, motor, log } = stage({ rebuild }, { context });
        events.emit('rebuild.requested', undefined);
        motor.finish();
        context.loosePieces = [];

        motor.finish();

        expect(log).toEqual([
            '+monkey/rebuild',
            'back',
            'done',
            '-monkey/rebuild:done',
        ]);
    });

    it('does not start when nothing is away from home', () => {
        const { events, log } = stage(
            { rebuild },
            { context: { loosePieces: [] } },
        );

        events.emit('rebuild.requested', undefined);

        expect(log).toEqual([]);
    });

    it('puts the piece in his hands home first, then goes on', () => {
        const context: LiveContext = {
            monkeyX: 0,
            loosePieces: pieces(100),
            carrying: 7,
        };
        const { events, motor } = stage({ rebuild }, { context });

        events.emit('rebuild.requested', undefined);

        expect(motor.requests).toEqual([
            { type: 'place', piece: 7, pace: 'run' },
        ]);
        delete context.carrying;
        motor.finish();
        expect(motor.requests.at(-1)).toEqual({
            type: 'carry',
            piece: 0,
            pace: 'run',
        });
    });

    it('does not wait or speak after the last piece', () => {
        const context: LiveContext = { monkeyX: 0, loosePieces: pieces(100) };
        const { events, motor, log } = stage({ rebuild }, { context });
        events.emit('rebuild.requested', undefined);
        motor.finish();
        context.loosePieces = [];

        motor.finish();

        expect(log.slice(-2)).toEqual(['done', '-monkey/rebuild:done']);
    });

    it('says something about the work on the third piece, then every seventh', () => {
        const context: LiveContext = {
            monkeyX: 0,
            loosePieces: pieces(...Array.from({ length: 12 }, (_, i) => i)),
        };
        const { events, motor, log, advance } = stage({ rebuild }, { context });
        events.emit('rebuild.requested', undefined);
        const said: number[] = [];
        for (let placed = 1; placed <= 12; placed++) {
            const before = log.length;
            advance(2000);
            motor.finish();
            context.loosePieces = (context.loosePieces ?? []).slice(1);
            motor.finish();
            if (log.slice(before).includes('build')) {
                said.push(placed);
            }
        }

        expect(log.filter((entry) => entry === 'build')).toHaveLength(2);
        expect(said).toEqual([3, 10]);
    });

    it('leaves a piece he cannot carry, and does not try it again', () => {
        const { events, motor, log } = stage(
            { rebuild },
            { context: { monkeyX: 0, loosePieces: pieces(100, 900) } },
        );
        events.emit('rebuild.requested', undefined);

        motor.finish('failed');

        expect(motor.requests.at(-1)).toEqual({
            type: 'carry',
            piece: 1,
            pace: 'run',
        });
        motor.finish('failed');
        expect(log.slice(-2)).toEqual(['done', '-monkey/rebuild:done']);
        expect(motor.requests).toHaveLength(2);
    });

    it('lets a piece he cannot place fall, and goes on without it', () => {
        const { events, motor } = stage(
            { rebuild },
            { context: { monkeyX: 0, loosePieces: pieces(100, 900) } },
        );
        events.emit('rebuild.requested', undefined);
        motor.finish();

        motor.finish('failed');

        expect(motor.requests.slice(1)).toEqual([
            { type: 'place', piece: 0, pace: 'run' },
            { type: 'drop' },
        ]);
        motor.finish();
        expect(motor.requests.at(-1)).toEqual({
            type: 'carry',
            piece: 1,
            pace: 'run',
        });
    });

    it('is interrupted by a bomb, and goes on with the request he was in afterwards', () => {
        const context: LiveContext = {
            pageWidth: 1000,
            monkeyX: 0,
            loosePieces: pieces(100, 900),
        };
        const { events, motor, log } = stage({ rebuild, flee }, { context });
        events.emit('rebuild.requested', undefined);
        motor.finish();

        events.emit('bomb.placed', { id: 1, at: { x: 300, y: 700 } });

        expect(log.slice(-3)).toEqual([
            '-monkey/rebuild:interrupted',
            '+monkey/flee',
            'run',
        ]);
        motor.finish();
        expect(log.at(-2)).toBe('-monkey/flee:done');
        expect(log.at(-1)).toBe('+monkey/rebuild');
        expect(motor.requests.at(-1)).toEqual({
            type: 'place',
            piece: 0,
            pace: 'run',
        });
    });

    it('is not started twice by a second press', () => {
        const { events, motor } = stage(
            { rebuild },
            { context: { monkeyX: 0, loosePieces: pieces(100) } },
        );
        events.emit('rebuild.requested', undefined);

        events.emit('rebuild.requested', undefined);

        expect(motor.requests).toHaveLength(1);
    });
});
