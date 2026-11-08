import { describe, expect, it } from 'vitest';
import type {
    BehaviourSpec,
    Run,
} from '../../../../assets/game/brain/behaviour';
import { wait } from '../../../../assets/game/brain/behaviour';
import type { AnyReaction } from '../../../../assets/game/brain/reaction';
import { discover } from '../../../../assets/game/registry/discover';

const spec = (actor = 'monkey'): BehaviourSpec => ({
    actor,
    kind: 'activity',
    priority: 3,
    triggers: ['item.freed'],
    canStart: () => true,
    *run(): Run {
        yield wait(1);
    },
});

const reaction = (actor = 'monkey'): AnyReaction => ({
    actor,
    on: 'item.grabbed',
    line: 'grab',
});

describe('discover', () => {
    it('names each behaviour after its file: the actor, then the name', () => {
        const behaviours = discover({
            '../activities/monkey/flinch.ts': { default: spec() },
        });

        expect(behaviours).toHaveLength(1);
        expect(behaviours[0]).toMatchObject({
            id: 'monkey/flinch',
            actor: 'monkey',
            kind: 'activity',
            priority: 3,
        });
    });

    it('keeps the behaviour as declared', () => {
        const declared = spec();

        const [behaviour] = discover({
            '../activities/monkey/flinch.ts': { default: declared },
        });

        const context = { actor: 'monkey', now: 0 };
        expect(behaviour?.canStart(context)).toBe(true);
        expect(
            behaviour
                ?.run(context, { say: () => true, context: () => context })
                .next(),
        ).toEqual({ done: false, value: wait(1) });
    });

    it('turns a list of reactions into line behaviours, numbered', () => {
        const behaviours = discover({
            '../activities/monkey/comments.ts': {
                default: [reaction(), reaction()],
            },
        });

        expect(
            behaviours.map(({ id, kind, lines }) => [id, kind, lines]),
        ).toEqual([
            ['monkey/comments#0', 'line', ['grab']],
            ['monkey/comments#1', 'line', ['grab']],
        ]);
    });

    it('lists the files in path order, whatever order the glob gave', () => {
        const behaviours = discover({
            '../activities/monkey/walk.ts': { default: spec() },
            '../activities/drone/hover.ts': { default: spec('drone') },
            '../activities/monkey/comments.ts': { default: [reaction()] },
        });

        expect(behaviours.map(({ id }) => id)).toEqual([
            'drone/hover',
            'monkey/comments#0',
            'monkey/walk',
        ]);
    });

    it('finds nothing in an empty folder', () => {
        expect(discover({})).toEqual([]);
    });

    it('reads the folder and the name from the end of the path', () => {
        const [behaviour] = discover({
            'assets/game/activities/drone/hover.ts': { default: spec('drone') },
        });

        expect(behaviour?.id).toBe('drone/hover');
    });

    it('refuses a file with no default export', () => {
        expect(() =>
            discover({ '../activities/monkey/walk.ts': { walk: spec() } }),
        ).toThrow(
            '../activities/monkey/walk.ts must export a behaviour (defineBehaviour) or reactions (defineReactions) by default',
        );
    });

    it('refuses a default export that is neither', () => {
        for (const value of [undefined, null, 'x', 3, {}, { run: 1 }]) {
            expect(() =>
                discover({
                    '../activities/monkey/walk.ts': { default: value },
                }),
            ).toThrow('must export a behaviour');
        }
        expect(() => discover({ '../activities/monkey/walk.ts': {} })).toThrow(
            'must export a behaviour',
        );
        expect(() =>
            discover({ '../activities/monkey/walk.ts': undefined }),
        ).toThrow('must export a behaviour');
    });

    it('refuses a path that is not an actor folder and a .ts file', () => {
        for (const path of [
            'walk.ts',
            '../activities/monkey/walk.ts.bak',
            '../activities/monkey/walk.js',
            '../activities/monkey/.ts',
        ]) {
            expect(() => discover({ [path]: { default: spec() } })).toThrow(
                `${path} is not in an actor folder`,
            );
        }
    });

    it('takes the folder and the name of a path from its end only', () => {
        const [behaviour] = discover({
            'src/monkey/activities/monkey/walk.v2.ts': { default: spec() },
        });

        expect(behaviour?.id).toBe('monkey/walk.v2');
    });

    it('refuses a behaviour that sits in another actor’s folder', () => {
        expect(() =>
            discover({
                '../activities/monkey/hover.ts': { default: spec('drone') },
            }),
        ).toThrow(
            '../activities/monkey/hover.ts declares the actor "drone" but sits at "monkey/hover"',
        );
        expect(() =>
            discover({
                '../activities/monkey/comments.ts': {
                    default: [reaction(), reaction('drone')],
                },
            }),
        ).toThrow('declares the actor "drone" but sits at "monkey/comments"');
    });
});
