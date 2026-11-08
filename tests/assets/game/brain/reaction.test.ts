import { describe, expect, it, vi } from 'vitest';
import type {
    Act,
    Context,
    Trigger,
} from '../../../../assets/game/brain/behaviour';
import {
    defineReactions,
    reactionBehaviour,
    type AnyReaction,
} from '../../../../assets/game/brain/reaction';

const grabbed: Trigger = {
    name: 'item.grabbed',
    payload: { id: 1, kind: 'letter', at: { x: 0, y: 0 } },
};

const context = (trigger?: Trigger, fields = {}): Context => ({
    actor: 'monkey',
    now: 0,
    trigger,
    ...fields,
});

const behaviour = (
    reaction: Partial<AnyReaction> = {},
): ReturnType<typeof reactionBehaviour> =>
    reactionBehaviour(
        {
            actor: 'monkey',
            on: 'item.grabbed',
            line: 'grab',
            ...reaction,
        } as AnyReaction,
        'monkey/comments#0',
    );

const run = (
    reaction: Partial<AnyReaction>,
    ctx: Context,
): { say: ReturnType<typeof vi.fn>; steps: unknown[] } => {
    const say = vi.fn(() => true);
    const act = { say, context: () => ctx } as Act;
    const generator = behaviour(reaction).run(ctx, act);
    const steps: unknown[] = [];
    for (let next = generator.next('done'); next.done !== true;) {
        steps.push(next.value);
        next = generator.next('done');
    }
    return { say, steps };
};

describe('a reaction as a behaviour', () => {
    it('is a line of its actor, started by its event, with the key it says', () => {
        expect(behaviour({ priority: undefined })).toMatchObject({
            id: 'monkey/comments#0',
            actor: 'monkey',
            kind: 'line',
            priority: 0,
            triggers: ['item.grabbed'],
            lines: ['grab'],
        });
    });

    it('carries the priority, the weight and the cooldown it declares', () => {
        expect(
            behaviour({ priority: 4, weight: 2, cooldown: 900 }),
        ).toMatchObject({ priority: 4, weight: 2, cooldown: 900 });
    });

    it('says its line and has no step to wait for', () => {
        const { say, steps } = run({}, context(grabbed));

        expect(steps).toEqual([]);
        expect(say).toHaveBeenCalledExactlyOnceWith('grab', undefined, {
            force: undefined,
        });
    });

    it('can force its line, and gives its parameters from the context', () => {
        const ctx = context(grabbed);
        const { say } = run(
            {
                force: true,
                params: ({ now }) => ({ now }),
            },
            ctx,
        );

        expect(say).toHaveBeenCalledExactlyOnceWith(
            'grab',
            { now: 0 },
            { force: true },
        );
    });
});

describe('its conditions', () => {
    it('starts on its event only', () => {
        const reaction = behaviour();

        expect(reaction.canStart(context(grabbed))).toBe(true);
        expect(reaction.canStart(context())).toBe(false);
        expect(
            reaction.canStart(
                context({
                    name: 'item.dropped',
                    payload: { id: 1, kind: 'letter' },
                }),
            ),
        ).toBe(false);
    });

    it('holds the payload to what it names', () => {
        const letter = behaviour({ where: { kind: 'letter' } } as never);
        const links = behaviour({
            where: { kind: ['link', 'block'] },
        } as never);

        expect(letter.canStart(context(grabbed))).toBe(true);
        expect(links.canStart(context(grabbed))).toBe(false);
    });

    it('holds the context to what it names', () => {
        const calm = behaviour({ when: { reducedMotion: false } });

        expect(calm.canStart(context(grabbed, { reducedMotion: false }))).toBe(
            true,
        );
        expect(calm.canStart(context(grabbed, { reducedMotion: true }))).toBe(
            false,
        );
        expect(calm.canStart(context(grabbed))).toBe(false);
    });

    it('does not read the trigger as a field of the context', () => {
        const odd = behaviour({ when: { trigger: 'x' } } as never);

        expect(odd.canStart(context(grabbed))).toBe(false);
    });

    it('starts on an event with no payload when it names nothing in it', () => {
        const ended = reactionBehaviour(
            { actor: 'monkey', on: 'tornado.ended', line: 'calm' },
            'monkey/comments#1',
        );
        const trigger: Trigger = { name: 'tornado.ended', payload: undefined };

        expect(ended.canStart(context(trigger))).toBe(true);
    });
});

describe('defineReactions', () => {
    it('hands the list back as it is', () => {
        const list: readonly AnyReaction[] = [
            { actor: 'monkey', on: 'item.grabbed', line: 'grab' },
        ];

        expect(defineReactions(list)).toBe(list);
    });

    it('checks the conditions against the payload of the event, at compile time', () => {
        // Never called: tsc is the test.
        const misuse = (): void => {
            defineReactions([
                {
                    actor: 'monkey',
                    on: 'item.grabbed',
                    line: 'x',
                    // @ts-expect-error `kind` is not 'planet'.
                    where: { kind: 'planet' },
                },
                {
                    actor: 'monkey',
                    on: 'item.dropped',
                    line: 'x',
                    // @ts-expect-error An item.dropped has no `speed`.
                    where: { speed: 3 },
                },
                {
                    actor: 'monkey',
                    // @ts-expect-error No such event.
                    on: 'item.fred',
                    line: 'x',
                },
            ]);
        };

        expect(misuse).toBeTypeOf('function');
    });
});
