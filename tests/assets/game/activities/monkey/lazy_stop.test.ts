import { describe, expect, it } from 'vitest';
import lazyRebuild from '../../../../../assets/game/activities/monkey/lazy_rebuild';
import lazyStop from '../../../../../assets/game/activities/monkey/lazy_stop';
import type { ContextFields } from '../../../../../assets/game/brain/behaviour';
import { stage, type LiveContext } from './stage';

const pieces = (...xs: number[]): ContextFields['loosePieces'] =>
    xs.map((x, id) => ({ id, x }));

const LAZY = 'monkey/lazy_rebuild';
// The stage names a behaviour by its key, as the registry does by its file.
const lazy = { lazy_rebuild: lazyRebuild };
const stop = { lazy_stop: lazyStop };

describe('the monkey stopped by the visitor', () => {
    it('is stopped by the visitor taking a piece, and sulks', () => {
        const context: LiveContext = {
            monkeyX: 0,
            loosePieces: pieces(100),
        };
        const { events, motor, log } = stage({ ...lazy, ...stop }, { context });
        events.emit('visitor.idle', undefined);
        context.running = [LAZY];

        events.emit('item.grabbed', {
            id: 0,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        expect(log).toEqual([
            '+monkey/lazy_rebuild',
            'lazyBack',
            '-monkey/lazy_rebuild:interrupted',
            '+monkey/lazy_stop',
            'lazyStop',
        ]);
        expect(motor.requests.at(-1)).toEqual({
            type: 'mood',
            mood: 'cross',
            ms: 1400,
        });
        motor.finish();
        // Not resumed.
        expect(log.at(-1)).toBe('-monkey/lazy_stop:done');
        expect(motor.requests).toHaveLength(2);
    });

    it('is not stopped by a grab when he is not tidying slowly', () => {
        const { events, log } = stage(stop, {
            context: { running: ['monkey/rebuild'] },
        });

        events.emit('item.grabbed', {
            id: 0,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        expect(log).toEqual([]);
    });
});
