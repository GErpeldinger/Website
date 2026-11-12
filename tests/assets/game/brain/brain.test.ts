import { describe, expect, it, vi } from 'vitest';
import type {
    Context,
    ContextSource,
    Run,
} from '../../../../assets/game/brain/behaviour';
import { Brain } from '../../../../assets/game/brain/brain';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { FakeMotor } from '../../../../assets/game/ports/fake_motor';
import type {
    Motor,
    MotorTask,
    Outcome,
} from '../../../../assets/game/ports/motor';
import {
    behaviour,
    freed,
    setup,
    steps,
    wait,
    walk,
    type Walk,
} from './brain_fixture';

const reducedMotion: ContextSource = () => ({ reducedMotion: true });
const hijack: ContextSource = () => ({ actor: 'drone', now: 99 }) as never;

const fire = (
    s: ReturnType<typeof setup>,
    name: 'item.freed' = 'item.freed',
): void => {
    s.events.emit(name, freed);
};

describe('an activity', () => {
    it('starts on its event, asks the Motor for each step in turn, and ends when the steps do', () => {
        const script = steps(walk(1), walk(2));
        const s = setup([behaviour('walker', { run: script.run })]);

        fire(s);
        expect(s.log).toEqual(['+walker']);
        expect(s.motor.requests).toEqual([walk(1)]);
        expect(s.motor.layers).toEqual(['body']);

        s.motor.finish();
        expect(s.motor.requests).toEqual([walk(1), walk(2)]);
        expect(s.log).toEqual(['+walker']);

        s.motor.finish();
        expect(s.log).toEqual(['+walker', '-walker:done']);
        expect(s.brain.snapshot().body).toBeUndefined();
    });

    it('gives the generator the outcome of each request', () => {
        const script = steps(walk(1), walk(2));
        const s = setup([behaviour('walker', { run: script.run })]);

        fire(s);
        s.motor.finish('failed');
        s.motor.finish('done');

        expect(script.outcomes).toEqual(['failed', 'done']);
    });

    it('waits on the game clock, not on the Motor', () => {
        const script = steps(wait(500), walk(2));
        const s = setup([behaviour('pauser', { run: script.run })]);

        fire(s);
        expect(s.motor.requests).toEqual([]);
        s.advance(499);
        expect(s.motor.requests).toEqual([]);
        s.advance(1);

        expect(script.outcomes).toEqual(['done']);
        expect(s.motor.requests).toEqual([walk(2)]);
    });

    it('runs steps the Motor finishes at once without losing one', () => {
        const script = steps(walk(1), walk(2), walk(3));
        const s = setup([behaviour('walker', { run: script.run })], {
            motor: new FakeMotor({ instant: true }),
        });

        fire(s);

        expect(s.motor.requests).toEqual([walk(1), walk(2), walk(3)]);
        expect(s.log).toEqual(['+walker', '-walker:done']);
        expect(s.brain.busy).toBe(false);
    });

    it('ends at once when it has no step', () => {
        const s = setup([
            behaviour('empty', {
                *run(): Run<Walk> {},
            }),
        ]);

        fire(s);

        expect(s.log).toEqual(['+empty', '-empty:done']);
    });

    it('ignores events it is not triggered by', () => {
        const s = setup([behaviour('walker', { triggers: ['item.dropped'] })]);

        fire(s);

        expect(s.log).toEqual([]);
    });

    it('starts on any of its events, whoever emitted it', () => {
        const s = setup([
            behaviour('walker', { triggers: ['item.freed', 'item.dropped'] }),
        ]);

        s.events.emit('item.dropped', { id: 1, kind: 'block' }, 'director');

        expect(s.log).toEqual(['+walker']);
    });

    it('is not started twice while it runs or waits', () => {
        const s = setup([behaviour('walker')]);

        fire(s);
        fire(s);

        expect(s.log).toEqual(['+walker']);
        expect(s.motor.requests).toHaveLength(1);
        expect(s.brain.snapshot().waiting).toEqual([]);
    });
});

describe('canStart and the context', () => {
    it('keeps a behaviour from starting when it says no', () => {
        const s = setup([behaviour('walker', { canStart: () => false })]);

        fire(s);

        expect(s.log).toEqual([]);
    });

    it('gives the actor, the time, the trigger and the fields of the sources', () => {
        const canStart = vi.fn(() => true);
        const s = setup([behaviour('walker', { canStart })], {
            sources: [
                reducedMotion,
                // The base fields are the Brain's: a source cannot change them.
                hijack,
            ],
        });
        s.advance(300);

        fire(s);

        expect(canStart).toHaveBeenCalledExactlyOnceWith({
            actor: 'monkey',
            now: 300,
            reducedMotion: true,
            trigger: { name: 'item.freed', payload: freed },
        });
    });

    it('gives run the context it started on, and act.context() a fresh one', () => {
        const seen: Context[] = [];
        const s = setup([
            behaviour('walker', {
                *run(context, act): Run<Walk> {
                    seen.push(context);
                    yield walk(1);
                    seen.push(act.context());
                },
            }),
        ]);

        fire(s);
        s.advance(40);
        s.motor.finish();

        expect(seen.map(({ now }) => now)).toEqual([0, 40]);
        expect(seen[1]?.trigger).toEqual({
            name: 'item.freed',
            payload: freed,
        });
    });

    it('treats a canStart that throws as a no, and reports it', () => {
        const error = new Error('bad');
        const s = setup([
            behaviour('broken', {
                canStart: () => {
                    throw error;
                },
            }),
            behaviour('fine', { priority: 1 }),
        ]);

        fire(s);

        expect(s.errors).toEqual([{ id: 'broken', error }]);
        expect(s.log).toEqual(['+fine']);
    });
});

describe('cooldown', () => {
    it('keeps a behaviour from starting again for its cooldown, from its start', () => {
        const s = setup([
            behaviour('walker', {
                cooldown: 1000,
                *run(): Run<Walk> {
                    yield walk(1);
                },
            }),
        ]);

        fire(s);
        s.advance(600);
        s.motor.finish();
        fire(s);
        expect(s.log).toEqual(['+walker', '-walker:done']);

        s.advance(399);
        fire(s);
        expect(s.log).toHaveLength(2);

        s.advance(1);
        fire(s);
        expect(s.log).toEqual(['+walker', '-walker:done', '+walker']);
    });

    it('lets a behaviour without one start again at once', () => {
        const s = setup([behaviour('walker')]);

        fire(s);
        s.motor.finish();
        fire(s);

        expect(s.log).toEqual(['+walker', '-walker:done', '+walker']);
    });

    it('does not spend a cooldown on a behaviour that could not start', () => {
        let allowed = false;
        const s = setup([
            behaviour('walker', { cooldown: 1000, canStart: () => allowed }),
        ]);

        fire(s);
        allowed = true;
        fire(s);

        expect(s.log).toEqual(['+walker']);
    });
});

describe('variants', () => {
    const variants = (roll: number): ReturnType<typeof setup> =>
        setup(
            [
                behaviour('a', { priority: 5, weight: 1 }),
                behaviour('b', { priority: 5, weight: 3 }),
                behaviour('strong', {
                    priority: 9,
                    triggers: ['item.dropped'],
                }),
                behaviour('weak', { priority: 1 }),
            ],
            { random: () => roll },
        );

    it('picks among the behaviours of equal priority by their weights', () => {
        const first = variants(0.1);
        const second = variants(0.9);
        fire(first);
        fire(second);

        expect(first.log).toEqual(['+a']);
        expect(second.log).toEqual(['+b']);
    });

    it('never starts a lower priority while a higher one could', () => {
        const s = variants(0.99);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });

        expect(s.log).toEqual(['+strong']);
    });

    it('only considers the behaviours that can start', () => {
        const s = setup([
            behaviour('strong', { priority: 9, canStart: () => false }),
            behaviour('weak', { priority: 1 }),
        ]);

        fire(s);

        expect(s.log).toEqual(['+weak']);
    });

    it('starts one behaviour of each kind for one event, an ambient one giving way to the activity', () => {
        const s = setup([
            behaviour('flinch', { kind: 'reflex' }),
            behaviour('chase', { kind: 'activity' }),
            behaviour('ouch', {
                kind: 'line',
                lines: ['hurt'],
                *run(_, act): Run<Walk> {
                    act.say('hurt');
                    yield wait(1);
                },
            }),
            behaviour('smoke', { kind: 'ambient' }),
        ]);

        fire(s);

        expect(s.log).toEqual(['+flinch', '+chase', '+ouch', '"Ouch!"']);
        expect(s.brain.snapshot()).toMatchObject({
            body: 'chase',
            overlays: ['flinch', 'ouch'],
        });
    });
});

describe('priorities among activities', () => {
    it('lets a stronger activity interrupt, stopping the Motor and the generator', () => {
        const cleaned = vi.fn();
        const s = setup([
            behaviour('rebuild', {
                priority: 5,
                *run(): Run<Walk> {
                    try {
                        yield walk(1);
                        yield walk(2);
                    } finally {
                        cleaned();
                    }
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });

        expect(s.log).toEqual(['+rebuild', '-rebuild:interrupted', '+flee']);
        expect(s.motor.cancelled).toEqual([walk(1)]);
        expect(cleaned).toHaveBeenCalledTimes(1);
        expect(s.brain.snapshot()).toMatchObject({
            body: 'flee',
            waiting: [],
            suspended: [],
        });
    });

    it('does not hear the Motor of an interrupted activity any more', () => {
        const script = steps(walk(1), walk(2));
        const motor = new FakeMotor();
        const answers: ((outcome: Outcome) => void)[] = [];
        const perform = motor.perform.bind(motor);
        motor.perform = (request, done, layer): MotorTask => {
            answers.push(done);
            return perform(request, done, layer);
        };
        const s = setup(
            [
                behaviour('rebuild', { priority: 5, run: script.run }),
                behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
            ],
            { motor },
        );
        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });

        answers[0]?.('done');

        expect(script.outcomes).toEqual([]);
        expect(s.motor.requests).toEqual([walk(1), walk(1)]);
    });

    it('makes an activity of equal or lower priority wait its turn', () => {
        const s = setup([
            behaviour('first', { priority: 5 }),
            behaviour('equal', { priority: 5, triggers: ['item.dropped'] }),
            behaviour('lower', { priority: 1, triggers: ['item.grabbed'] }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });
        expect(s.brain.snapshot()).toMatchObject({
            body: 'first',
            waiting: ['equal', 'lower'],
        });

        s.motor.finish();
        expect(s.log).toEqual(['+first', '-first:done', '+equal']);
        s.motor.finish();
        expect(s.log.at(-1)).toBe('+lower');
        expect(s.brain.snapshot().waiting).toEqual([]);
    });

    it('runs the waiting ones by priority, then in the order they asked', () => {
        const s = setup([
            behaviour('current', { priority: 9 }),
            behaviour('late-low', { priority: 1, triggers: ['item.grabbed'] }),
            behaviour('high', { priority: 5, triggers: ['item.dropped'] }),
            behaviour('first-low', { priority: 1, triggers: ['item.thrown'] }),
        ]);

        fire(s);
        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.events.emit('item.thrown', { id: 1, kind: 'block', speed: 1 });
        s.motor.finish();
        s.motor.finish();
        s.motor.finish();

        expect(s.log.filter((entry) => entry.startsWith('+'))).toEqual([
            '+current',
            '+high',
            '+late-low',
            '+first-low',
        ]);
    });

    it('asks again whether a waiting activity can still start, and drops it if not', () => {
        let allowed = true;
        const s = setup([
            behaviour('current', { priority: 9 }),
            behaviour('waiter', {
                priority: 1,
                triggers: ['item.dropped'],
                canStart: () => allowed,
            }),
            behaviour('next', { priority: 0, triggers: ['item.grabbed'] }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });
        allowed = false;
        s.motor.finish();

        expect(s.log).toEqual(['+current', '-current:done', '+next']);
        expect(s.brain.snapshot().waiting).toEqual([]);
    });

    it('reports a waiting activity whose canStart throws, and moves on', () => {
        let broken = false;
        const s = setup([
            behaviour('current', { priority: 9 }),
            behaviour('waiter', {
                priority: 1,
                triggers: ['item.dropped'],
                canStart: () => {
                    if (broken) {
                        throw new Error('late');
                    }
                    return true;
                },
            }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        broken = true;
        s.motor.finish();

        expect(s.errors.map(({ id }) => id)).toEqual(['waiter']);
        expect(s.brain.busy).toBe(false);
    });

    it('does not queue an activity that is already waiting', () => {
        const s = setup([
            behaviour('current', { priority: 9 }),
            behaviour('waiter', { priority: 1, triggers: ['item.dropped'] }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.events.emit('item.dropped', { id: 1, kind: 'block' });

        expect(s.brain.snapshot().waiting).toEqual(['waiter']);
    });
});

describe('resuming', () => {
    const build = (): ReturnType<typeof setup> & {
        outcomes: string[];
    } => {
        const outcomes: string[] = [];
        const s = setup([
            behaviour('rebuild', {
                priority: 5,
                resumes: true,
                *run(): Run<Walk> {
                    outcomes.push(`first:${yield walk(1)}`);
                    outcomes.push(`second:${yield walk(2)}`);
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
            behaviour('chat', { priority: 1, triggers: ['item.grabbed'] }),
        ]);
        return { ...s, outcomes };
    };

    it('lets an interrupted activity that resumes go on once the stronger one ends, asking its request again', () => {
        const s = build();

        fire(s);
        s.motor.finish();
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        expect(s.brain.snapshot()).toMatchObject({
            body: 'flee',
            suspended: ['rebuild'],
        });
        s.motor.finish();

        expect(s.log).toEqual([
            '+rebuild',
            '-rebuild:interrupted',
            '+flee',
            '-flee:done',
            '+rebuild (resumed)',
        ]);
        // The second step was cut short and is asked again; the first is not repeated.
        expect(s.motor.requests).toEqual([walk(1), walk(2), walk(1), walk(2)]);
        s.motor.finish();
        expect(s.outcomes).toEqual(['first:done', 'second:done']);
        expect(s.log.at(-1)).toBe('-rebuild:done');
    });

    it('resumes before a waiting activity of lower priority, after one of higher', () => {
        const s = build();

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });
        s.motor.finish();

        expect(s.log.at(-1)).toBe('+rebuild (resumed)');
        expect(s.brain.snapshot().waiting).toEqual(['chat']);
    });

    it('drops an activity that does not resume', () => {
        const s = setup([
            behaviour('rebuild', { priority: 5 }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.motor.finish();

        expect(s.log).toEqual([
            '+rebuild',
            '-rebuild:interrupted',
            '+flee',
            '-flee:done',
        ]);
        expect(s.brain.busy).toBe(false);
    });

    it('resumes in turn when interrupted twice', () => {
        const s = setup([
            behaviour('low', { priority: 1, resumes: true }),
            behaviour('mid', {
                priority: 5,
                resumes: true,
                triggers: ['item.dropped'],
            }),
            behaviour('high', { priority: 9, triggers: ['item.grabbed'] }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });
        s.motor.finish();
        s.motor.finish();

        expect(s.log.filter((entry) => entry.startsWith('+'))).toEqual([
            '+low',
            '+mid',
            '+high',
            '+mid (resumed)',
            '+low (resumed)',
        ]);
    });

    it('does not resume what an ambient behaviour gave way for', () => {
        const s = setup([
            behaviour('smoke', { kind: 'ambient', resumes: true }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        s.advance(5000);

        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.motor.finish();

        expect(s.log.filter((entry) => entry.includes('smoke'))).toEqual([
            '+smoke',
            '-smoke:interrupted',
        ]);
    });
});

describe('ambient behaviours', () => {
    it('fill idle time, after the idle delay', () => {
        const s = setup([
            behaviour('smoke', { kind: 'ambient', triggers: [] }),
        ]);

        s.advance(4999);
        expect(s.log).toEqual([]);
        s.advance(1);

        expect(s.log).toEqual(['+smoke']);
        expect(s.brain.snapshot().body).toBe('smoke');
    });

    it('use the idle delay they are given', () => {
        const s = setup(
            [behaviour('smoke', { kind: 'ambient', triggers: [] })],
            { idleDelay: 200 },
        );

        s.advance(199);
        expect(s.log).toEqual([]);
        s.advance(1);
        expect(s.log).toEqual(['+smoke']);
    });

    it('try again later when none can start', () => {
        let allowed = false;
        const s = setup(
            [
                behaviour('smoke', {
                    kind: 'ambient',
                    triggers: [],
                    canStart: () => allowed,
                }),
            ],
            { idleDelay: 100 },
        );

        s.advance(100);
        allowed = true;
        s.advance(99);
        expect(s.log).toEqual([]);
        s.advance(1);

        expect(s.log).toEqual(['+smoke']);
    });

    it('start again after the next idle delay once one ends', () => {
        const s = setup(
            [behaviour('smoke', { kind: 'ambient', triggers: [] })],
            { idleDelay: 100 },
        );

        s.advance(100);
        s.motor.finish();
        s.advance(99);
        expect(s.log).toEqual(['+smoke', '-smoke:done']);
        s.advance(1);

        expect(s.log).toEqual(['+smoke', '-smoke:done', '+smoke']);
    });

    it('give way to an activity', () => {
        const s = setup([
            behaviour('smoke', { kind: 'ambient', triggers: [] }),
            behaviour('rebuild', { priority: 1 }),
        ]);
        s.advance(5000);

        fire(s);

        expect(s.log).toEqual(['+smoke', '-smoke:interrupted', '+rebuild']);
        expect(s.motor.cancelled).toEqual([walk(1)]);
    });

    it('do not start while an activity runs, and not on an event either', () => {
        const s = setup([
            behaviour('smoke', { kind: 'ambient' }),
            behaviour('rebuild', { priority: 1, triggers: ['item.dropped'] }),
        ]);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.advance(60_000);
        fire(s);

        expect(s.log).toEqual(['+rebuild']);
    });

    it('can start on an event when idle', () => {
        const s = setup([behaviour('smoke', { kind: 'ambient' })]);

        fire(s);

        expect(s.log).toEqual(['+smoke']);
    });

    it('do not wait for their turn, but start once the queue is empty', () => {
        const s = setup(
            [
                behaviour('current', { priority: 5 }),
                behaviour('smoke', { kind: 'ambient', triggers: [] }),
            ],
            { idleDelay: 100 },
        );

        fire(s);
        s.advance(1000);
        expect(s.log).toEqual(['+current']);
        s.motor.finish();
        s.advance(100);

        expect(s.log).toEqual(['+current', '-current:done', '+smoke']);
    });

    it('wait for the activities that are waiting, which hold the body first', () => {
        const s = setup(
            [
                behaviour('current', { priority: 5 }),
                behaviour('waiter', {
                    priority: 1,
                    triggers: ['item.dropped'],
                }),
                behaviour('smoke', { kind: 'ambient', triggers: [] }),
            ],
            { idleDelay: 100 },
        );

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.motor.finish();
        s.advance(1000);

        expect(s.log.filter((entry) => entry.includes('smoke'))).toEqual([]);
    });

    it('forget the idle timer of a stopped Brain', () => {
        const s = setup(
            [behaviour('smoke', { kind: 'ambient', triggers: [] })],
            { idleDelay: 100 },
        );

        s.brain.stop();
        s.advance(1000);

        expect(s.log).toEqual([]);
    });
});

describe('reflexes', () => {
    it('overlay the activity without stopping it', () => {
        const s = setup([
            behaviour('rebuild', { priority: 5 }),
            behaviour('flinch', {
                kind: 'reflex',
                priority: 0,
                triggers: ['item.dropped'],
                *run(): Run<Walk> {
                    yield walk(99);
                },
            }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });

        expect(s.log).toEqual(['+rebuild', '+flinch']);
        expect(s.motor.requests).toEqual([walk(1), walk(99)]);
        expect(s.motor.layers).toEqual(['body', 'overlay']);
        expect(s.motor.cancelled).toEqual([]);

        s.motor.finish('done', 'overlay');
        expect(s.log).toEqual(['+rebuild', '+flinch', '-flinch:done']);
        expect(s.brain.snapshot()).toMatchObject({
            body: 'rebuild',
            overlays: [],
        });
        s.motor.finish('done', 'body');
        expect(s.log.at(-1)).toBe('-rebuild:done');
    });

    it('run with no activity at all, and do not occupy the body', () => {
        const s = setup([
            behaviour('flinch', { kind: 'reflex' }),
            behaviour('rebuild', { priority: 0, triggers: ['item.dropped'] }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });

        expect(s.brain.snapshot()).toMatchObject({
            body: 'rebuild',
            overlays: ['flinch'],
        });
        expect(s.log).toEqual(['+flinch', '+rebuild']);
    });

    it('do not start again while they play, and can once they ended', () => {
        const s = setup([behaviour('flinch', { kind: 'reflex' })]);

        fire(s);
        fire(s);
        expect(s.log).toEqual(['+flinch']);
        s.motor.finish();
        fire(s);

        expect(s.log).toEqual(['+flinch', '-flinch:done', '+flinch']);
    });
});

describe('lines', () => {
    const talker = (key: string, extra = {}): ReturnType<typeof behaviour> =>
        behaviour('talker', {
            kind: 'line',
            lines: ['grab', 'hurt'],
            *run(_, act): Run<Walk> {
                act.say(key);
                yield wait(10);
            },
            ...extra,
        });

    it('say a line of the speaker, in rotation, and put it on the bus', () => {
        const s = setup([talker('grab')]);

        fire(s);
        s.advance(10);
        s.advance(2000);
        fire(s);

        expect(s.log).toEqual([
            '+talker',
            '"Put that back."',
            '-talker:done',
            '+talker',
            '"Hey!"',
        ]);
    });

    it('put the actor, the key and the text on the bus', () => {
        const s = setup([talker('hurt')]);
        const said = vi.fn();
        s.events.on('line.said', said);

        fire(s);

        expect(said).toHaveBeenCalledExactlyOnceWith(
            { actor: 'monkey', key: 'hurt', text: 'Ouch!' },
            'game',
        );
    });

    it('tell run whether the line played or the cooldown held it back', () => {
        const results: boolean[] = [];
        const s = setup([
            behaviour('talker', {
                kind: 'line',
                lines: ['grab'],
                *run(_, act): Run<Walk> {
                    results.push(act.say('grab'), act.say('grab'));
                    yield wait(1);
                },
            }),
        ]);

        fire(s);

        expect(results).toEqual([true, false]);
        expect(s.log.filter((entry) => entry.startsWith('"'))).toHaveLength(1);
    });

    it('can force a line and pass parameters', () => {
        const s = setup([
            behaviour('talker', {
                kind: 'line',
                lines: ['grab'],
                *run(_, act): Run<Walk> {
                    act.say('grab');
                    act.say('grab', {}, { force: true });
                    yield wait(1);
                },
            }),
        ]);

        fire(s);

        expect(s.log.filter((entry) => entry.startsWith('"'))).toEqual([
            '"Put that back."',
            '"Hey!"',
        ]);
    });

    it('fail for a key the behaviour did not declare', () => {
        const s = setup([talker('nope', { lines: ['grab'] })]);

        fire(s);

        expect(s.log).toEqual(['+talker', '-talker:failed']);
        expect(s.errors).toHaveLength(1);
        expect(String(s.errors[0]?.error)).toContain(
            'talker says "nope" without declaring it',
        );
    });

    it('fail for an actor with no voice', () => {
        const s = setup([talker('grab')], { voiced: false });

        fire(s);

        expect(s.log).toEqual(['+talker', '-talker:failed']);
        expect(String(s.errors[0]?.error)).toContain('monkey has no voice');
    });

    it('only wait: a request for the Motor fails them', () => {
        const s = setup([behaviour('talker', { kind: 'line' })]);

        fire(s);

        expect(s.log).toEqual(['+talker', '-talker:failed']);
        expect(String(s.errors[0]?.error)).toContain('only wait');
        expect(s.motor.requests).toEqual([]);
    });
});

describe('failures', () => {
    it('end a behaviour whose run throws, report it, and free the body', () => {
        const error = new Error('boom');
        const s = setup([
            behaviour('broken', {
                priority: 5,
                *run(): Run<Walk> {
                    yield walk(1);
                    throw error;
                },
            }),
            behaviour('next', { priority: 1, triggers: ['item.dropped'] }),
        ]);

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.motor.finish();

        expect(s.errors).toEqual([{ id: 'broken', error }]);
        expect(s.log).toEqual(['+broken', '-broken:failed', '+next']);
    });

    it('end a behaviour whose Motor throws', () => {
        const motor = new FakeMotor();
        const error = new Error('no legs');
        vi.spyOn(motor, 'perform').mockImplementation(() => {
            throw error;
        });
        const s = setup([behaviour('walker')], { motor });

        fire(s);

        expect(s.errors).toEqual([{ id: 'walker', error }]);
        expect(s.log).toEqual(['+walker', '-walker:failed']);
        expect(s.brain.busy).toBe(false);
    });

    it('report a listener of the bus that throws, and carry on', () => {
        const error = new Error('listener');
        const s = setup([behaviour('walker')]);
        s.events.on('behaviour.started', () => {
            throw error;
        });

        fire(s);

        expect(s.errors).toEqual([{ id: 'monkey', error }]);
        expect(s.motor.requests).toEqual([walk(1)]);
    });
});

describe('a listener that reacts while a behaviour runs', () => {
    it('interrupting a generator that is running is deferred until it yields', () => {
        const s = setup([
            behaviour('talker', {
                priority: 5,
                lines: ['grab'],
                *run(_, act): Run<Walk> {
                    act.say('grab');
                    yield walk(1);
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        // The line that talker says makes something happen that interrupts it.
        s.events.on('line.said', () => {
            s.events.emit('item.dropped', { id: 1, kind: 'block' });
        });

        fire(s);

        expect(s.errors).toEqual([]);
        expect(s.log).toEqual([
            '+talker',
            '"Put that back."',
            '-talker:interrupted',
            '+flee',
        ]);
        expect(s.motor.requests).toEqual([walk(1)]);
        expect(s.brain.snapshot().body).toBe('flee');
    });

    it('a resumable one interrupted that way asks for its next step when it resumes', () => {
        const s = setup([
            behaviour('talker', {
                priority: 5,
                resumes: true,
                lines: ['grab'],
                *run(_, act): Run<Walk> {
                    act.say('grab');
                    yield walk(1);
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        s.events.on('line.said', () => {
            s.events.emit('item.dropped', { id: 1, kind: 'block' });
        });

        fire(s);
        expect(s.motor.requests).toEqual([walk(1)]);
        s.motor.finish();

        expect(s.log).toContain('+talker (resumed)');
        expect(s.motor.requests).toEqual([walk(1), walk(1)]);
    });

    it('a resumable one interrupted that finishes meanwhile ends for good', () => {
        const s = setup([
            behaviour('talker', {
                priority: 5,
                resumes: true,
                lines: ['grab'],
                // eslint-disable-next-line require-yield
                *run(_, act): Run<Walk> {
                    act.say('grab');
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        s.events.on('line.said', () => {
            s.events.emit('item.dropped', { id: 1, kind: 'block' });
        });

        fire(s);
        s.motor.finish();

        expect(s.log).toEqual([
            '+talker',
            '"Put that back."',
            '-talker:interrupted',
            '+flee',
            '-flee:done',
        ]);
        expect(s.brain.busy).toBe(false);
    });
});

describe('start, for the director panel', () => {
    it('starts a behaviour on its own, with no trigger, whatever canStart or the cooldown say', () => {
        const canStart = vi.fn(() => false);
        const s = setup([
            behaviour('walker', { canStart, cooldown: 99_999, triggers: [] }),
        ]);

        expect(s.brain.start('walker')).toBe(true);
        expect(canStart).not.toHaveBeenCalled();
        expect(s.log).toEqual(['+walker']);
        s.motor.finish();
        expect(s.brain.start('walker')).toBe(true);
        expect(s.log).toEqual(['+walker', '-walker:done', '+walker']);
    });

    it('gives the behaviour a context with no trigger', () => {
        const seen: Context[] = [];
        const s = setup([
            behaviour('walker', {
                *run(context): Run<Walk> {
                    seen.push(context);
                    yield walk(1);
                },
            }),
        ]);

        s.brain.start('walker');

        expect(seen[0]?.trigger).toBeUndefined();
    });

    it('follows the rules of priority', () => {
        const s = setup([
            behaviour('strong', { priority: 9 }),
            behaviour('weak', { priority: 1 }),
        ]);

        s.brain.start('strong');
        expect(s.brain.start('weak')).toBe(true);

        expect(s.brain.snapshot()).toMatchObject({
            body: 'strong',
            waiting: ['weak'],
        });
    });

    it('says no for an unknown id, a behaviour that is already there, and an ambient one that gives way', () => {
        const s = setup([
            behaviour('walker'),
            behaviour('smoke', { kind: 'ambient' }),
        ]);

        expect(s.brain.start('nobody')).toBe(false);
        s.brain.start('walker');
        expect(s.brain.start('walker')).toBe(false);
        expect(s.brain.start('smoke')).toBe(false);
        expect(s.log).toEqual(['+walker']);
    });

    it('starts an ambient behaviour that is stronger than the ambient one that holds the body', () => {
        const s = setup([
            behaviour('smoke', { kind: 'ambient', priority: 0 }),
            behaviour('sneeze', { kind: 'ambient', priority: 5 }),
            behaviour('twin', { kind: 'ambient', priority: 5 }),
        ]);
        s.brain.start('smoke');

        expect(s.brain.start('sneeze')).toBe(true);

        expect(s.log).toEqual(['+smoke', '-smoke:interrupted', '+sneeze']);
        expect(s.brain.start('smoke')).toBe(false);
        expect(s.brain.start('twin')).toBe(false);
        expect(s.log).toEqual(['+smoke', '-smoke:interrupted', '+sneeze']);
    });

    it('does not resume the weaker ambient behaviour it took the turn from', () => {
        const s = setup([
            behaviour('smoke', { kind: 'ambient', priority: 0, resumes: true }),
            behaviour('sneeze', { kind: 'ambient', priority: 5 }),
        ]);
        s.brain.start('smoke');
        s.brain.start('sneeze');

        s.motor.finish();

        expect(s.log.filter((entry) => entry.includes('smoke'))).toEqual([
            '+smoke',
            '-smoke:interrupted',
        ]);
    });

    it('starts an ambient behaviour when the body is free', () => {
        const s = setup([behaviour('smoke', { kind: 'ambient' })]);

        expect(s.brain.start('smoke')).toBe(true);
        expect(s.log).toEqual(['+smoke']);
    });

    it('does nothing once stopped', () => {
        const s = setup([behaviour('walker')]);
        s.brain.stop();

        expect(s.brain.start('walker')).toBe(false);
    });
});

describe('snapshot and busy', () => {
    it('is idle with nothing going on', () => {
        const s = setup([behaviour('walker')]);

        expect(s.brain.busy).toBe(false);
        expect(s.brain.snapshot()).toEqual({
            body: undefined,
            overlays: [],
            suspended: [],
            waiting: [],
        });
    });

    it('is busy while anything runs, waits or plays', () => {
        const s = setup([
            behaviour('current', { priority: 9 }),
            behaviour('waiter', { priority: 1, triggers: ['item.dropped'] }),
            behaviour('flinch', { kind: 'reflex', triggers: ['item.grabbed'] }),
        ]);

        fire(s);
        expect(s.brain.busy).toBe(true);
        s.motor.finish();
        expect(s.brain.busy).toBe(false);

        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });
        expect(s.brain.busy).toBe(true);
        s.motor.finish();
        expect(s.brain.busy).toBe(false);
    });
});

describe('stop', () => {
    it('ends everything, silences the events and the timers, and ignores the Motor', () => {
        const cleaned = vi.fn();
        const s = setup([
            behaviour('current', {
                priority: 5,
                resumes: true,
                *run(): Run<Walk> {
                    try {
                        yield walk(1);
                    } finally {
                        cleaned();
                    }
                },
            }),
            behaviour('flinch', { kind: 'reflex', triggers: ['item.dropped'] }),
            behaviour('waiter', { priority: 1, triggers: ['item.grabbed'] }),
            behaviour('smoke', { kind: 'ambient', triggers: [] }),
        ]);
        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        s.brain.stop();

        expect(s.log).toEqual([
            '+current',
            '+flinch',
            '-current:stopped',
            '-flinch:stopped',
        ]);
        expect(cleaned).toHaveBeenCalledTimes(1);
        expect(s.motor.cancelled).toEqual([walk(1), walk(1)]);
        expect(s.brain.busy).toBe(false);

        fire(s);
        s.advance(60_000);
        expect(s.log).toHaveLength(4);
    });

    it('also lets go of an interrupted activity it was keeping', () => {
        const cleaned = vi.fn();
        const s = setup([
            behaviour('rebuild', {
                priority: 5,
                resumes: true,
                *run(): Run<Walk> {
                    try {
                        yield walk(1);
                    } finally {
                        cleaned();
                    }
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });

        s.brain.stop();

        expect(cleaned).toHaveBeenCalledTimes(1);
        expect(s.log).toEqual([
            '+rebuild',
            '-rebuild:interrupted',
            '+flee',
            '-flee:stopped',
        ]);
        expect(s.brain.snapshot().suspended).toEqual([]);
    });

    it('is harmless twice', () => {
        const s = setup([behaviour('walker')]);
        fire(s);

        s.brain.stop();
        s.brain.stop();

        expect(s.log).toEqual(['+walker', '-walker:stopped']);
    });

    it('reports a generator that throws while closing', () => {
        const s = setup([
            behaviour('walker', {
                *run(): Run<Walk> {
                    try {
                        yield walk(1);
                    } finally {
                        // eslint-disable-next-line no-unsafe-finally -- a cleanup that fails
                        throw new Error('cleanup');
                    }
                },
            }),
        ]);
        fire(s);

        s.brain.stop();

        expect(s.errors.map(({ id }) => id)).toEqual(['walker']);
    });
});

describe('what the rules rest on', () => {
    const interrupting = (): ReturnType<typeof setup> & {
        answers: ((outcome: Outcome) => void)[];
    } => {
        const motor = new FakeMotor();
        const answers: ((outcome: Outcome) => void)[] = [];
        const perform = motor.perform.bind(motor);
        motor.perform = (request, done, layer): MotorTask => {
            answers.push(done);
            return perform(request, done, layer);
        };
        const s = setup(
            [
                behaviour('rebuild', {
                    priority: 5,
                    resumes: true,
                    *run(): Run<Walk> {
                        yield walk(1);
                        yield walk(2);
                        yield walk(3);
                    },
                }),
                behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
            ],
            { motor },
        );
        return { ...s, answers };
    };

    it('lets a step go on after a resume, and ignores the answer to the step that was cut', () => {
        const s = interrupting();
        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.motor.finish();
        expect(s.motor.requests).toEqual([walk(1), walk(1), walk(1)]);

        // The answer to the request that was cut short comes late.
        s.answers[0]?.('done');
        expect(s.motor.requests).toHaveLength(3);
        expect(s.brain.snapshot()).toMatchObject({
            body: 'rebuild',
            suspended: [],
        });

        s.motor.finish();
        s.motor.finish();
        s.motor.finish();
        expect(s.motor.requests).toEqual([
            walk(1),
            walk(1),
            walk(1),
            walk(2),
            walk(3),
        ]);
        expect(s.log.at(-1)).toBe('-rebuild:done');
        expect(s.brain.busy).toBe(false);
    });

    it('ignores the answer of a behaviour that ended or was stopped', () => {
        const s = interrupting();
        fire(s);
        s.brain.stop();
        const log = [...s.log];

        s.answers[0]?.('done');

        expect(s.log).toEqual(log);
        expect(s.motor.requests).toEqual([walk(1)]);
    });

    it('cancels the step in flight, not one that finished at once before it', () => {
        const cancelled: Walk[] = [];
        const motor: Motor<Walk> = {
            perform: (request, done): MotorTask => {
                // The first request is answered inside perform.
                if (request.to === 1) {
                    done('done');
                }
                return {
                    cancel: (): void => {
                        cancelled.push(request);
                    },
                };
            },
        };
        const s = setup(
            [
                behaviour('walker', {
                    priority: 1,
                    *run(): Run<Walk> {
                        yield walk(1);
                        yield walk(2);
                    },
                }),
                behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
            ],
            { motor: motor as never },
        );
        fire(s);

        s.events.emit('item.dropped', { id: 1, kind: 'block' });

        expect(cancelled).toEqual([walk(2)]);
    });

    it('does not start what a listener of the started event already took over', () => {
        const ran = vi.fn();
        const s = setup([
            behaviour('slow', {
                priority: 1,
                *run(): Run<Walk> {
                    ran();
                    yield walk(1);
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        let once = true;
        s.events.on('behaviour.started', ({ id }) => {
            if (id === 'slow' && once) {
                once = false;
                s.events.emit('item.dropped', { id: 1, kind: 'block' });
            }
        });

        fire(s);

        expect(ran).not.toHaveBeenCalled();
        expect(s.motor.requests).toEqual([walk(1)]);
        expect(s.log).toEqual(['+slow', '-slow:interrupted', '+flee']);
    });

    it('resumes from its first step what a listener took over before it began', () => {
        const s = setup([
            behaviour('slow', {
                priority: 1,
                resumes: true,
                *run(): Run<Walk> {
                    yield walk(7);
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        let once = true;
        s.events.on('behaviour.started', ({ id }) => {
            if (id === 'slow' && once) {
                once = false;
                s.events.emit('item.dropped', { id: 1, kind: 'block' });
            }
        });

        fire(s);
        s.motor.finish();

        expect(s.motor.requests).toEqual([walk(1), walk(7)]);
        expect(s.log).toEqual([
            '+slow',
            '-slow:interrupted',
            '+flee',
            '-flee:done',
            '+slow (resumed)',
        ]);
    });

    it('does not ask the Motor for a request when a listener took the resumed one over again', () => {
        const s = setup([
            behaviour('rebuild', {
                priority: 5,
                resumes: true,
                *run(): Run<Walk> {
                    yield walk(5);
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
            behaviour('panic', { priority: 20, triggers: ['item.grabbed'] }),
        ]);
        s.events.on('behaviour.started', ({ id, resumed }) => {
            if (id === 'rebuild' && resumed) {
                s.events.emit('item.grabbed', {
                    id: 1,
                    kind: 'block',
                    at: { x: 0, y: 0 },
                });
            }
        });

        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.motor.finish();

        expect(s.motor.requests).toEqual([walk(5), walk(1), walk(1)]);
        expect(s.brain.snapshot()).toMatchObject({
            body: 'panic',
            suspended: ['rebuild'],
        });
    });

    it('closes the generator of one interrupted while it ran, once it yields', () => {
        const cleaned = vi.fn();
        const s = setup([
            behaviour('talker', {
                priority: 5,
                lines: ['grab'],
                *run(_, act): Run<Walk> {
                    try {
                        act.say('grab');
                        yield walk(1);
                    } finally {
                        cleaned();
                    }
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        s.events.on('line.said', () => {
            s.events.emit('item.dropped', { id: 1, kind: 'block' });
        });

        fire(s);

        expect(cleaned).toHaveBeenCalledTimes(1);
    });

    it('ends a behaviour that throws as it is closed from inside without raising', () => {
        const s = setup([
            behaviour('talker', {
                priority: 5,
                lines: ['grab'],
                *run(_, act): Run<Walk> {
                    act.say('grab');
                    yield walk(1);
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        s.events.on('line.said', () => {
            s.events.emit('item.dropped', { id: 1, kind: 'block' });
        });

        expect(() => {
            fire(s);
        }).not.toThrow();
        expect(s.errors).toEqual([]);
    });

    it('does not start a waiting activity when a reflex ends while another holds the body', () => {
        const s = setup([
            behaviour('current', { priority: 9 }),
            behaviour('waiter', { priority: 1, triggers: ['item.dropped'] }),
            behaviour('flinch', { kind: 'reflex', triggers: ['item.grabbed'] }),
        ]);
        fire(s);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        s.motor.finish('done', 'overlay');

        expect(s.brain.snapshot()).toMatchObject({
            body: 'current',
            waiting: ['waiter'],
            overlays: [],
        });
    });

    it('does not fill idle time with a behaviour that is not ambient', () => {
        const s = setup(
            [
                behaviour('rebuild', { kind: 'activity', triggers: [] }),
                behaviour('flinch', { kind: 'reflex', triggers: [] }),
            ],
            { idleDelay: 100 },
        );

        s.advance(1000);

        expect(s.log).toEqual([]);
    });

    it('ends an activity whose run cannot even begin, reports it and moves on', () => {
        const error = new Error('no generator');
        const s = setup([
            behaviour('broken', {
                priority: 5,
                run: () => {
                    throw error;
                },
            }),
            behaviour('first', { priority: 9, triggers: ['item.dropped'] }),
            behaviour('next', { priority: 1, triggers: ['item.grabbed'] }),
        ]);
        s.events.emit('item.dropped', { id: 1, kind: 'block' });
        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        fire(s);
        s.motor.finish();

        // `broken` could not begin when `first` ended: `next` takes the body.
        expect(s.errors).toEqual([{ id: 'broken', error }]);
        expect(s.log.filter((entry) => entry.startsWith('+'))).toEqual([
            '+first',
            '+next',
        ]);
    });

    it('lets a reflex fail to begin without touching the body or the queue', () => {
        const error = new Error('no generator');
        const s = setup([
            behaviour('current', { priority: 5 }),
            behaviour('waiter', { priority: 1, triggers: ['item.grabbed'] }),
            behaviour('flinch', {
                kind: 'reflex',
                triggers: ['item.dropped'],
                run: () => {
                    throw error;
                },
            }),
        ]);
        fire(s);
        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        s.events.emit('item.dropped', { id: 1, kind: 'block' });

        expect(s.errors).toEqual([{ id: 'flinch', error }]);
        expect(s.brain.snapshot()).toMatchObject({
            body: 'current',
            waiting: ['waiter'],
        });
        expect(s.log).toEqual(['+current']);
    });

    it('ignores an event that reaches it after it was stopped', () => {
        const events = new EventBus<GameEvents>();
        // This listener is subscribed first, so it runs before the Brain's own.
        const held: { brain?: Brain<Walk> } = {};
        events.on('item.freed', () => {
            held.brain?.stop();
        });
        const motor = new FakeMotor();
        held.brain = new Brain<Walk>({
            actor: 'monkey',
            behaviours: [behaviour('walker')],
            motor,
            events,
            clock: new Clock(),
            random: (): number => 0,
            onError: (): void => undefined,
        });

        events.emit('item.freed', freed);

        expect(motor.requests).toEqual([]);
    });

    it('stops listening to the bus', () => {
        const events = new EventBus<GameEvents>();
        const off = vi.fn();
        vi.spyOn(events, 'on').mockImplementation(() => off);
        const brain = new Brain<Walk>({
            actor: 'monkey',
            behaviours: [
                behaviour('walker', {
                    triggers: ['item.freed', 'item.dropped'],
                }),
            ],
            motor: new FakeMotor(),
            events,
            clock: new Clock(),
            random: (): number => 0,
            onError: (): void => undefined,
        });

        brain.stop();

        expect(off).toHaveBeenCalledTimes(2);
    });

    it('starts nothing from the idle time of a Brain stopped while it held the body', () => {
        const s = setup(
            [
                behaviour('walker', { priority: 1 }),
                behaviour('smoke', { kind: 'ambient', triggers: [] }),
            ],
            { idleDelay: 100 },
        );
        fire(s);

        s.brain.stop();
        s.advance(10_000);

        expect(s.log).toEqual(['+walker', '-walker:stopped']);
    });
});

describe('a Motor that starts a stronger behaviour while it starts a request', () => {
    const run = (
        resumes: boolean,
    ): { cancelled: Walk[]; s: ReturnType<typeof setup> } => {
        const cancelled: Walk[] = [];
        const bus: { events?: EventBus<GameEvents> } = {};
        let first = true;
        const motor: Motor<Walk> = {
            perform: (request): MotorTask => {
                if (first) {
                    first = false;
                    bus.events?.emit('item.dropped', { id: 1, kind: 'block' });
                }
                return {
                    cancel: (): void => {
                        cancelled.push(request);
                    },
                };
            },
        };
        const s = setup(
            [
                behaviour('weak', {
                    priority: 1,
                    resumes,
                    *run(): Run<Walk> {
                        yield walk(1);
                    },
                }),
                behaviour('strong', {
                    priority: 9,
                    triggers: ['item.dropped'],
                    *run(): Run<Walk> {
                        yield walk(2);
                    },
                }),
            ],
            { motor: motor as never },
        );
        bus.events = s.events;
        fire(s);
        return { cancelled, s };
    };

    it.each([false, true])(
        'cancels the request that was cut (resumes: %s)',
        (resumes) => {
            const { cancelled, s } = run(resumes);

            expect(cancelled).toEqual([walk(1)]);
            expect(s.brain.snapshot()).toMatchObject({
                body: 'strong',
                suspended: resumes ? ['weak'] : [],
            });
        },
    );
});

describe('a behaviour that ends while it is cut short', () => {
    const build = (
        resumes: boolean,
        ending: 'done' | 'throws',
    ): ReturnType<typeof setup> => {
        const s = setup([
            behaviour('talker', {
                priority: 5,
                resumes,
                lines: ['grab'],
                // eslint-disable-next-line require-yield
                *run(_, act): Run<Walk> {
                    act.say('grab');
                    if (ending === 'throws') {
                        throw new Error('late');
                    }
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        s.events.on('line.said', () => {
            s.events.emit('item.dropped', { id: 1, kind: 'block' });
        });
        fire(s);
        return s;
    };

    it.each([false, true])(
        'says it ended once when it throws (resumes: %s)',
        (resumes) => {
            const s = build(resumes, 'throws');

            expect(s.log.filter((entry) => entry.includes('talker'))).toEqual([
                '+talker',
                '-talker:interrupted',
            ]);
            expect(s.errors.map(({ id }) => id)).toEqual(['talker']);
            expect(s.brain.snapshot()).toMatchObject({
                body: 'flee',
                suspended: [],
            });
        },
    );

    it('leaves the other interrupted activities alone when a plain one throws', () => {
        const s = setup([
            behaviour('low', { priority: 1, resumes: true }),
            behaviour('talker', {
                priority: 5,
                triggers: ['item.grabbed'],
                lines: ['grab'],
                // eslint-disable-next-line require-yield
                *run(_, act): Run<Walk> {
                    act.say('grab');
                    throw new Error('late');
                },
            }),
            behaviour('flee', { priority: 9, triggers: ['item.dropped'] }),
        ]);
        s.events.on('line.said', () => {
            s.events.emit('item.dropped', { id: 1, kind: 'block' });
        });
        fire(s);

        s.events.emit('item.grabbed', {
            id: 1,
            kind: 'block',
            at: { x: 0, y: 0 },
        });

        expect(s.brain.snapshot()).toMatchObject({
            body: 'flee',
            suspended: ['low'],
        });
    });

    it('is not resumed once it ended by itself', () => {
        const s = build(true, 'done');
        s.motor.finish();

        expect(s.log.filter((entry) => entry.includes('talker'))).toEqual([
            '+talker',
            '-talker:interrupted',
        ]);
        expect(s.brain.busy).toBe(false);
    });
});

describe('what it checks at construction', () => {
    const build =
        (behaviours: ReturnType<typeof behaviour>[]): (() => Brain<Walk>) =>
        () =>
            new Brain<Walk>({
                actor: 'monkey',
                behaviours,
                motor: new FakeMotor(),
                events: new EventBus<GameEvents>(),
                clock: new Clock(),
                random: () => 0,
                onError: () => undefined,
            });

    it('accepts no behaviours', () => {
        expect(build([])).not.toThrow();
    });

    it('refuses a behaviour of another actor', () => {
        expect(build([behaviour('x', { actor: 'drone' })])).toThrow(
            'The behaviour "x" belongs to the drone, not to the monkey',
        );
    });

    it('refuses two behaviours with one id', () => {
        expect(build([behaviour('x'), behaviour('x')])).toThrow(
            'Two behaviours are called "x"',
        );
    });

    it('refuses a priority, a weight or a cooldown that is not a number in range', () => {
        expect(build([behaviour('x', { priority: Number.NaN })])).toThrow(
            'The priority of "x" must be a number, got NaN.',
        );
        expect(build([behaviour('x', { priority: Infinity })])).toThrow(
            'The priority of "x" must be a number, got Infinity.',
        );
        expect(build([behaviour('x', { weight: 0 })])).toThrow(
            'The weight of "x" must be above 0, got 0.',
        );
        expect(build([behaviour('x', { weight: Infinity })])).toThrow(
            'The weight of "x" must be above 0, got Infinity.',
        );
        expect(build([behaviour('x', { cooldown: -1 })])).toThrow(
            'The cooldown of "x" must be at least 0, got -1.',
        );
        expect(build([behaviour('x', { cooldown: Number.NaN })])).toThrow(
            'The cooldown of "x" must be at least 0, got NaN.',
        );
    });

    it('accepts a zero cooldown and a negative priority', () => {
        expect(
            build([behaviour('x', { cooldown: 0, priority: -3, weight: 0.5 })]),
        ).not.toThrow();
    });
});
