import { describe, expect, it } from 'vitest';
import flee from '../../../../../assets/game/activities/monkey/flee';
import hurry from '../../../../../assets/game/activities/monkey/hurry';
import lazyRebuild from '../../../../../assets/game/activities/monkey/lazy_rebuild';
import rebuild from '../../../../../assets/game/activities/monkey/rebuild';
import type { ContextFields } from '../../../../../assets/game/brain/behaviour';
import { stage, type LiveContext } from './stage';

const pieces = (...xs: number[]): ContextFields['loosePieces'] =>
    xs.map((x, id) => ({ id, x }));

const LAZY = 'monkey/lazy_rebuild';
// The stage names a behaviour by its key, as the registry does by its file.
const lazy = { lazy_rebuild: lazyRebuild };

describe('the monkey hurrying', () => {
    it('is hurried by a pressed Rebuild, which says so and goes on at a run', () => {
        const context: LiveContext = {
            monkeyX: 0,
            loosePieces: pieces(100, 200),
        };
        const { events, motor, log } = stage(
            { ...lazy, hurry, rebuild },
            { context },
        );
        events.emit('visitor.idle', undefined);
        context.running = [LAZY];

        events.emit('rebuild.requested', undefined);

        expect(log).toEqual([
            '+monkey/lazy_rebuild',
            'lazyBack',
            '-monkey/lazy_rebuild:interrupted',
            '+monkey/hurry',
            'hurry',
        ]);
        expect(motor.requests.at(-1)).toEqual({
            type: 'carry',
            piece: 0,
            pace: 'run',
        });
        // Pressed again while he hurries: nothing more, nothing queued.
        context.running = ['monkey/hurry'];
        events.emit('rebuild.requested', undefined);
        expect(motor.requests).toHaveLength(2);
        expect(log).not.toContain('back');
        motor.finish();
        context.loosePieces = [];
        motor.finish();
        expect(log.slice(-2)).toEqual(['done', '-monkey/hurry:done']);
    });

    it('goes on after a bomb, from the request he was in', () => {
        const context: LiveContext = {
            pageWidth: 1000,
            monkeyX: 0,
            loosePieces: pieces(100),
            running: [LAZY],
        };
        const { events, motor, log } = stage(
            { ...lazy, hurry, flee },
            { context },
        );
        events.emit('rebuild.requested', undefined);
        expect(log).toEqual(['+monkey/hurry', 'hurry']);

        events.emit('bomb.placed', { id: 1, at: { x: 300, y: 700 } });
        motor.finish();

        expect(log.at(-1)).toBe('+monkey/hurry');
        expect(motor.requests.at(-1)).toEqual({
            type: 'carry',
            piece: 0,
            pace: 'run',
        });
    });

    it('has no running list to read in a bare world: the rebuild takes the press', () => {
        const { events, motor } = stage(
            { hurry, rebuild },
            { context: { monkeyX: 0, loosePieces: pieces(100) } },
        );

        events.emit('rebuild.requested', undefined);

        expect(motor.requests).toEqual([
            { type: 'carry', piece: 0, pace: 'run' },
        ]);
    });
});

describe('the lazy rebuild and the rebuild', () => {
    it('does not take a press when he is tidying slowly: the hurry does', () => {
        expect(
            rebuild.canStart({ actor: 'monkey', now: 0, running: [LAZY] }),
        ).toBe(false);
        expect(
            rebuild.canStart({
                actor: 'monkey',
                now: 0,
                running: ['monkey/hurry'],
            }),
        ).toBe(false);
        expect(
            rebuild.canStart({
                actor: 'monkey',
                now: 0,
                running: [],
                loosePieces: [{ id: 0, x: 1 }],
            }),
        ).toBe(true);
        expect(
            hurry.canStart({ actor: 'monkey', now: 0, running: [LAZY] }),
        ).toBe(true);
        expect(hurry.canStart({ actor: 'monkey', now: 0, running: [] })).toBe(
            false,
        );
    });
});
