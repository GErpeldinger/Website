import { Body } from 'matter-js';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import type { Appearance } from '../../../../assets/game/look/look';
import {
    MonkeyMotor,
    lerp,
    retargets,
} from '../../../../assets/game/motor/monkey_motor';
import { traitsOf } from '../../../../assets/game/physics/kinds';
import type { MonkeyBody } from '../../../../assets/game/physics/monkey_body';
import {
    MONKEY,
    PhysicsWorld,
    STEP,
    type PieceSpec,
} from '../../../../assets/game/physics/world';
import type { MonkeyRequest } from '../../../../assets/game/ports/monkey';
import type {
    Layer,
    MotorTask,
    Outcome,
} from '../../../../assets/game/ports/motor';

// A page 1000 px wide whose ground starts at 700: the monkey, a real body in a real world,
// driven by the Motor frame by frame. `shown` is what the Look was told.
const spec = (id: number, x: number, y: number, over = {}): PieceSpec => ({
    id,
    kind: 'block',
    traits: traitsOf('block', {}),
    x,
    y,
    width: 100,
    height: 40,
    ...over,
});

interface Options {
    specs?: PieceSpec[];
    monkeyAt?: number;
}

interface Scene {
    world: PhysicsWorld;
    monkey: MonkeyBody;
}

interface Harness {
    motor: MonkeyMotor;
    clock: Clock;
    events: EventBus<GameEvents>;
    log: { name: string; payload: unknown }[];
    shown: Appearance[];
    wake: Mock;
    frame: (count?: number, elapsed?: number) => void;
    wait: (ms: number) => void;
    until: (done: () => boolean, max?: number) => void;
    ask: (
        request: MonkeyRequest,
        layer?: Layer,
    ) => { task: MotorTask; outcomes: Outcome[] };
    loosen: (id: number) => void;
    readonly world: PhysicsWorld;
    readonly monkey: MonkeyBody;
    last: () => Appearance;
    rebuild: () => void;
}

const setup = ({ specs = [], monkeyAt = 300 }: Options = {}): Harness => {
    const events = new EventBus<GameEvents>();
    const clock = new Clock();
    const log: { name: string; payload: unknown }[] = [];
    events.onAny((name, payload) => {
        log.push({ name, payload });
    });
    const build = (x: number): Scene => {
        const world = new PhysicsWorld({ width: 1000, floor: 700 }, specs, {
            events,
            clock,
            random: (): number => 0.5,
            reducedMotion: false,
        });
        return { world, monkey: world.addMonkey(x) };
    };
    let scene = build(monkeyAt);
    const shown: Appearance[] = [];
    const wake = vi.fn();
    const motor = new MonkeyMotor({
        world: (): PhysicsWorld => scene.world,
        body: (): MonkeyBody => scene.monkey,
        look: {
            show: (appearance): void => {
                shown.push(appearance);
            },
        },
        clock,
        wake,
    });
    // One frame: the clock, the world's step and the Motor's, as the game runs them.
    const frame = (count = 1, elapsed = STEP): void => {
        for (let i = 0; i < count; i++) {
            clock.tick(elapsed);
            scene.world.step(elapsed);
            motor.step(elapsed);
        }
    };
    // Game time only, in the chunks the clock accepts.
    const wait = (ms: number): void => {
        for (let left = ms; left > 0; left -= 250) {
            frame(1, Math.min(250, left));
        }
    };
    const until = (done: () => boolean, max = 1200): void => {
        for (let i = 0; i < max && !done(); i++) {
            frame();
        }
    };
    const ask = (
        request: MonkeyRequest,
        layer: Layer = 'body',
    ): { task: MotorTask; outcomes: Outcome[] } => {
        const outcomes: Outcome[] = [];
        const task = motor.perform(
            request,
            (outcome) => {
                outcomes.push(outcome);
            },
            layer,
        );
        return { task, outcomes };
    };
    // A piece of the page that came loose and rests on the floor.
    const loosen = (id: number): void => {
        const at = scene.world.piece(id)?.position ?? { x: 0, y: 0 };
        scene.world.grab(id, at);
        scene.world.release({ x: 0, y: 0 });
        until(() => scene.world.resting, 600);
    };
    return {
        motor,
        clock,
        events,
        log,
        shown,
        wake,
        frame,
        wait,
        until,
        ask,
        loosen,
        get world(): PhysicsWorld {
            return scene.world;
        },
        get monkey(): MonkeyBody {
            return scene.monkey;
        },
        last: (): Appearance => {
            const appearance = shown.at(-1);
            if (!appearance) {
                throw new Error('The Look was told nothing.');
            }
            return appearance;
        },
        // The page is measured again: a new world, with him at the same place.
        rebuild: (): void => {
            scene.world.dispose();
            scene = build(scene.monkey.position.x);
        },
    };
};

describe('the loop', () => {
    it('is woken by every request, on either layer', () => {
        const { ask, wake } = setup();

        ask({ type: 'stop' });
        expect(wake).toHaveBeenCalledTimes(1);
        ask({ type: 'mood', mood: 'scared', ms: 100 }, 'overlay');
        expect(wake).toHaveBeenCalledTimes(2);
    });

    it('is needed while a request follows the body frame by frame, and not otherwise', () => {
        const { motor, monkey, ask, until } = setup();
        expect(motor.busy).toBe(false);

        ask({ type: 'walk', x: 600 });
        expect(motor.busy).toBe(true);
        ask({ type: 'pose', pose: 'smoke', ms: 5000 });
        expect(motor.busy).toBe(false);
        ask({ type: 'mood', mood: 'scared', ms: 500 }, 'overlay');
        expect(motor.busy).toBe(false);
        Body.setAngle(monkey.body, 0.5);
        ask({ type: 'stand' });
        expect(motor.busy).toBe(true);
        until(() => !motor.busy);
        expect(motor.busy).toBe(false);
    });
});

describe('what he looks like', () => {
    it('stands calm, facing right, on his feet', () => {
        const { motor, last, frame } = setup();

        frame();

        expect(motor.busy).toBe(false);
        expect(last()).toEqual({
            pose: 'stand',
            mood: 'calm',
            facing: 'right',
            gait: undefined,
            held: false,
        });
    });

    it('is told after each frame, and after each request that changes it', () => {
        const { shown, frame, ask } = setup();

        frame();
        const afterFrame = shown.length;
        expect(afterFrame).toBeGreaterThan(0);
        frame();
        expect(shown.length).toBeGreaterThan(afterFrame);

        ask({ type: 'pose', pose: 'smoke' });
        expect(shown.at(-1)?.pose).toBe('smoke');
    });

    it('tumbles when he is sent flying, over what he was doing, and stands again after', () => {
        const { monkey, last, frame, until, ask } = setup();
        ask({ type: 'pose', pose: 'smoke' });

        Body.setVelocity(monkey.body, { x: 8, y: -14 });
        frame(2);
        expect(last().pose).toBe('tumble');

        until(() => last().pose !== 'tumble');
        expect(last().pose).toBe('smoke');
    });

    it('does not step a gait while he tumbles in the middle of a run', () => {
        const { monkey, last, frame, ask } = setup();
        ask({ type: 'walk', x: 800, pace: 'run' });
        frame(2);
        expect(last().gait).toBe('run');

        Body.setVelocity(monkey.body, { x: 8, y: -14 });
        frame(2);

        expect(last().pose).toBe('tumble');
        expect(last().gait).toBeUndefined();
    });

    it('says when the visitor has him in hand, and then does not step', () => {
        const { world, monkey, last, frame, ask } = setup();
        ask({ type: 'walk', x: 800 });
        frame(2);
        expect(last().gait).toBe('walk');

        world.grab(MONKEY, { x: 300, y: 665 });
        frame();

        expect(last().held).toBe(true);
        expect(last().gait).toBeUndefined();
        expect(monkey.destination).toBe(800);

        world.release({ x: 0, y: 0 });
        frame();
        expect(last().held).toBe(false);
        expect(last().gait).toBe('walk');
    });
});

describe('facing', () => {
    it('turns the way he goes, and stays so', () => {
        const { last, frame, ask, until, monkey } = setup();

        ask({ type: 'walk', x: 100 });
        frame(2);
        expect(last().facing).toBe('left');
        until(() => monkey.destination === undefined);
        frame();
        expect(last().facing).toBe('left');

        ask({ type: 'walk', x: 500 });
        frame(2);
        expect(last().facing).toBe('right');
    });

    it('is told by a request, which ends at once', () => {
        const { last, ask, frame } = setup();

        const left = ask({ type: 'face', direction: 'left' });
        expect(left.outcomes).toEqual(['done']);
        frame();
        expect(last().facing).toBe('left');

        const right = ask({ type: 'face', direction: 'right' });
        expect(right.outcomes).toEqual(['done']);
        frame();
        expect(last().facing).toBe('right');
    });

    it('keeps the way a request gave him until he walks the other way', () => {
        const { last, ask, frame } = setup();
        ask({ type: 'face', direction: 'left' });

        frame(30);

        expect(last().facing).toBe('left');
    });
});

describe('a pose or a mood', () => {
    it('is set until another is: the request ends at once', () => {
        const { last, ask, frame } = setup();

        const pose = ask({ type: 'pose', pose: 'smoke' });
        const mood = ask({ type: 'mood', mood: 'proud' });
        frame(120);

        expect(pose.outcomes).toEqual(['done']);
        expect(mood.outcomes).toEqual(['done']);
        expect(last().pose).toBe('smoke');
        expect(last().mood).toBe('proud');
    });

    it('lasts as long as it is told to, then gives way to the usual, and ends', () => {
        const { last, ask, clock, wait } = setup();

        const pose = ask({ type: 'pose', pose: 'smoke', ms: 1000 });
        expect(last().pose).toBe('smoke');
        wait(999);
        expect(pose.outcomes).toEqual([]);
        expect(last().pose).toBe('smoke');
        wait(1);
        expect(pose.outcomes).toEqual(['done']);
        expect(last().pose).toBe('stand');
        expect(clock.next()).toBeUndefined();

        const moody = setup();
        const mood = moody.ask({ type: 'mood', mood: 'cross', ms: 500 });
        expect(moody.last().mood).toBe('cross');
        moody.wait(499);
        expect(mood.outcomes).toEqual([]);
        moody.wait(1);
        expect(mood.outcomes).toEqual(['done']);
        expect(moody.last().mood).toBe('calm');
        expect(moody.clock.next()).toBeUndefined();
    });

    it('is given back to the usual if the request is cut short, and the timer goes', () => {
        const { last, ask, clock, wait } = setup();
        const pose = ask({ type: 'pose', pose: 'smoke', ms: 1000 });

        pose.task.cancel();
        expect(last().pose).toBe('stand');
        wait(1200);
        expect(pose.outcomes).toEqual([]);
        expect(clock.next()).toBeUndefined();

        const moody = setup();
        const mood = moody.ask({ type: 'mood', mood: 'proud', ms: 1000 });
        mood.task.cancel();
        expect(moody.last().mood).toBe('calm');
        moody.wait(1200);
        expect(mood.outcomes).toEqual([]);
    });

    it('cuts the request before it short, leaving the one that took its place alone', () => {
        const { last, ask } = setup();
        const first = ask({ type: 'pose', pose: 'smoke', ms: 1000 });
        ask({ type: 'pose', pose: 'talk' });

        first.task.cancel();

        expect(last().pose).toBe('talk');
        // Answered once, when the second came: cutting it again says nothing more.
        expect(first.outcomes).toEqual(['failed']);
    });
});

describe('an overlay', () => {
    it('shows a mood or a pose over the body for the time it is told, and ends', () => {
        const { last, ask, wait } = setup();
        ask({ type: 'pose', pose: 'smoke' });

        const talk = ask({ type: 'pose', pose: 'talk', ms: 500 }, 'overlay');
        const scared = ask(
            { type: 'mood', mood: 'scared', ms: 250 },
            'overlay',
        );
        expect(last()).toMatchObject({ pose: 'talk', mood: 'scared' });

        wait(249);
        expect(scared.outcomes).toEqual([]);
        wait(1);
        expect(scared.outcomes).toEqual(['done']);
        expect(last()).toMatchObject({ pose: 'talk', mood: 'calm' });
        expect(talk.outcomes).toEqual([]);

        wait(250);
        expect(talk.outcomes).toEqual(['done']);
        expect(last()).toMatchObject({ pose: 'smoke', mood: 'calm' });
    });

    it('does not take the body from what it does, and does not keep the loop awake', () => {
        const { motor, ask, monkey } = setup();
        ask({ type: 'walk', x: 600 });

        ask({ type: 'mood', mood: 'scared', ms: 500 }, 'overlay');

        expect(monkey.destination).toBe(600);
        expect(motor.busy).toBe(true);
        const idle = setup();
        idle.ask({ type: 'mood', mood: 'scared', ms: 500 }, 'overlay');
        expect(idle.motor.busy).toBe(false);
    });

    it('is refused without a time, since it would never end, or for anything but a pose or a mood', () => {
        const { ask, last, frame } = setup();

        const pose = ask({ type: 'pose', pose: 'talk' }, 'overlay');
        const mood = ask({ type: 'mood', mood: 'scared' }, 'overlay');
        const walk = ask({ type: 'walk', x: 600 }, 'overlay');
        const stop = ask({ type: 'stop' }, 'overlay');
        frame();

        expect(pose.outcomes).toEqual(['failed']);
        expect(mood.outcomes).toEqual(['failed']);
        expect(walk.outcomes).toEqual(['failed']);
        expect(stop.outcomes).toEqual(['failed']);
        expect(last()).toMatchObject({ pose: 'stand', mood: 'calm' });
        // Refused, so nothing was asked of the body.
        expect(() => {
            pose.task.cancel();
        }).not.toThrow();
    });

    it('lets the last of its kind show, and the one before come back when it ends', () => {
        const { last, ask, wait } = setup();

        ask({ type: 'mood', mood: 'scared', ms: 500 }, 'overlay');
        ask({ type: 'mood', mood: 'cross', ms: 250 }, 'overlay');
        ask({ type: 'pose', pose: 'talk', ms: 250 }, 'overlay');
        expect(last()).toMatchObject({ mood: 'cross', pose: 'talk' });

        wait(250);
        expect(last()).toMatchObject({ mood: 'scared', pose: 'stand' });
    });

    it('wins over the body’s own pose: tumbling, carrying', () => {
        const { monkey, last, frame, ask } = setup();
        Body.setVelocity(monkey.body, { x: 8, y: -14 });
        frame(2);
        expect(last().pose).toBe('tumble');

        ask({ type: 'pose', pose: 'talk', ms: 500 }, 'overlay');

        expect(last().pose).toBe('talk');
    });

    it('is taken off when cut short, and the time it was given goes', () => {
        const { last, ask, clock, frame } = setup();
        const scared = ask(
            { type: 'mood', mood: 'scared', ms: 500 },
            'overlay',
        );

        scared.task.cancel();

        expect(last().mood).toBe('calm');
        frame(60);
        expect(scared.outcomes).toEqual([]);
        expect(clock.next()).toBeUndefined();
    });

    it('leaves another overlay alone when it is cut short after it has ended', () => {
        const { last, ask, wait } = setup();
        const first = ask({ type: 'mood', mood: 'scared', ms: 250 }, 'overlay');
        wait(250);
        ask({ type: 'mood', mood: 'cross', ms: 500 }, 'overlay');

        first.task.cancel();

        expect(last().mood).toBe('cross');
    });
});

describe('walking', () => {
    it('goes to the spot, steps all the way, and ends within 10 px of it', () => {
        const { monkey, last, ask, until, frame } = setup();

        const walk = ask({ type: 'walk', x: 600 });
        frame(5);
        expect(last().gait).toBe('walk');
        expect(walk.outcomes).toEqual([]);
        until(() => walk.outcomes.length > 0);

        expect(walk.outcomes).toEqual(['done']);
        expect(Math.abs(monkey.position.x - 600)).toBeLessThanOrEqual(10);
        frame();
        expect(last().gait).toBeUndefined();
        expect(monkey.body.velocity.x).toBeCloseTo(0, 0);
    });

    it('runs his legs when the walk is a run, and walks them when it is not', () => {
        const gait = (request: MonkeyRequest): string | undefined => {
            const { last, ask, frame } = setup();
            ask(request);
            frame(5);
            return last().gait;
        };

        expect(gait({ type: 'walk', x: 800 })).toBe('walk');
        expect(gait({ type: 'walk', x: 800, pace: 'walk' })).toBe('walk');
        expect(gait({ type: 'walk', x: 800, pace: 'run' })).toBe('run');
    });

    it('walks again after a run', () => {
        const { last, ask, frame, until } = setup();
        const run = ask({ type: 'walk', x: 500, pace: 'run' });
        until(() => run.outcomes.length > 0);

        ask({ type: 'walk', x: 100 });
        frame(5);

        expect(last().gait).toBe('walk');
    });

    it('walks at 3 px per step, and runs at 6.5', () => {
        const pace = (request: MonkeyRequest): number[] => {
            const { monkey, ask } = setup();
            const goTo = vi.spyOn(monkey, 'goTo');
            ask(request);
            return goTo.mock.calls[0] ?? [];
        };

        expect(pace({ type: 'walk', x: 800 })).toEqual([800, 3]);
        expect(pace({ type: 'walk', x: 800, pace: 'walk' })).toEqual([800, 3]);
        expect(pace({ type: 'walk', x: 800, pace: 'run' })).toEqual([800, 6.5]);
    });

    it('stays between the walls: he cannot go nearer than his half width', () => {
        const left = setup();
        const toLeft = left.ask({ type: 'walk', x: -50 });
        left.until(() => toLeft.outcomes.length > 0);
        expect(toLeft.outcomes).toEqual(['done']);
        expect(left.monkey.position.x).toBeLessThanOrEqual(30);
        expect(left.monkey.position.x).toBeGreaterThanOrEqual(19);

        const right = setup();
        const toRight = right.ask({ type: 'walk', x: 2000 });
        right.until(() => toRight.outcomes.length > 0);
        expect(toRight.outcomes).toEqual(['done']);
        expect(right.monkey.position.x).toBeGreaterThanOrEqual(970);
        expect(right.monkey.position.x).toBeLessThanOrEqual(981);
    });

    it('is there already when the spot is within 10 px', () => {
        const { ask, until, motor } = setup();

        const walk = ask({ type: 'walk', x: 305 });
        until(() => walk.outcomes.length > 0);

        expect(walk.outcomes).toEqual(['done']);
        expect(motor.busy).toBe(false);
    });

    it('fails when something he cannot climb stands in the way, and stops there', () => {
        const { monkey, ask, until, motor } = setup({
            specs: [spec(1, 500, 300, { width: 40, height: 800 })],
        });

        const walk = ask({ type: 'walk', x: 800 });
        until(() => walk.outcomes.length > 0);

        expect(walk.outcomes).toEqual(['failed']);
        expect(monkey.destination).toBeUndefined();
        expect(monkey.blocked).toBe(false);
        expect(motor.busy).toBe(false);
        expect(monkey.position.x).toBeLessThan(500);
    });

    it('hops a low obstacle on his way', () => {
        const { monkey, ask, until } = setup({
            specs: [spec(1, 500, 680, { width: 40, height: 40 })],
        });

        const walk = ask({ type: 'walk', x: 800 });
        until(() => walk.outcomes.length > 0);

        expect(walk.outcomes).toEqual(['done']);
        expect(monkey.position.x).toBeGreaterThan(780);
    });

    it('waits for the visitor to put him down, then goes on', () => {
        const { world, ask, frame, until, monkey } = setup();
        const walk = ask({ type: 'walk', x: 800 });
        frame(3);

        world.grab(MONKEY, { x: 300, y: 665 });
        frame(60);
        expect(walk.outcomes).toEqual([]);
        world.release({ x: 0, y: 0 });
        until(() => walk.outcomes.length > 0);

        expect(walk.outcomes).toEqual(['done']);
        expect(Math.abs(monkey.position.x - 800)).toBeLessThanOrEqual(10);
    });

    it('is cut short where he is, without an outcome', () => {
        const { monkey, last, ask, frame, motor } = setup();
        const walk = ask({ type: 'walk', x: 800 });
        frame(10);

        walk.task.cancel();
        frame(5);

        expect(walk.outcomes).toEqual([]);
        expect(monkey.destination).toBeUndefined();
        expect(monkey.body.velocity.x).toBeCloseTo(0, 0);
        expect(motor.busy).toBe(false);
        expect(last().gait).toBeUndefined();
        expect(monkey.position.x).toBeLessThan(400);
    });

    it('is cut short for good: cancelling twice, or after the end, does nothing', () => {
        const { ask, until, motor } = setup();
        const first = ask({ type: 'walk', x: 800 });
        first.task.cancel();
        const second = ask({ type: 'walk', x: 400 });

        first.task.cancel();
        until(() => second.outcomes.length > 0);
        second.task.cancel();

        expect(first.outcomes).toEqual([]);
        expect(second.outcomes).toEqual(['done']);
        expect(motor.busy).toBe(false);
    });

    it('gives way to the next request, which the old one does not outlive', () => {
        const { monkey, ask, until } = setup();
        const toRight = ask({ type: 'walk', x: 800 });

        const toLeft = ask({ type: 'walk', x: 100 });
        until(() => toLeft.outcomes.length > 0);

        expect(toRight.outcomes).toEqual(['failed']);
        expect(toLeft.outcomes).toEqual(['done']);
        expect(monkey.position.x).toBeLessThan(120);
    });

    it('goes on in the new world when the page is measured again', () => {
        const harness = setup();
        const walk = harness.ask({ type: 'walk', x: 800 });
        harness.frame(20);
        const x = harness.monkey.position.x;

        harness.rebuild();
        harness.frame(2);
        expect(harness.monkey.position.x).toBeGreaterThan(x - 1);
        expect(harness.monkey.position.x).toBeLessThan(x + 10);
        expect(harness.monkey.destination).toBe(800);
        harness.until(() => walk.outcomes.length > 0);

        expect(walk.outcomes).toEqual(['done']);
        expect(Math.abs(harness.monkey.position.x - 800)).toBeLessThanOrEqual(
            10,
        );
    });

    it('does not turn to a new goal for a target that hardly moved, nor lose his count', () => {
        const harness = setup();
        const goTo = vi.spyOn(harness.monkey, 'goTo');

        harness.ask({ type: 'walk', x: 800 });
        harness.frame(30);

        expect(goTo).toHaveBeenCalledTimes(1);
    });
});

describe('retargeting', () => {
    it('is needed for a target that moved by more than 8 px', () => {
        expect(retargets(500, 508)).toBe(false);
        expect(retargets(500, 492)).toBe(false);
        expect(retargets(500, 508.5)).toBe(true);
        expect(retargets(500, 491.5)).toBe(true);
        expect(retargets(500, 500)).toBe(false);
    });
});

describe('stopping', () => {
    it('halts him at once, and ends at once', () => {
        const { monkey, ask, frame, motor } = setup();
        ask({ type: 'walk', x: 800 });
        frame(10);

        const stop = ask({ type: 'stop' });

        expect(stop.outcomes).toEqual(['done']);
        expect(monkey.destination).toBeUndefined();
        expect(monkey.body.velocity.x).toBeCloseTo(0, 0);
        expect(motor.busy).toBe(false);
    });

    it('also cuts the request that was pending, which is told it failed', () => {
        const { ask } = setup();
        const walk = ask({ type: 'walk', x: 800 });

        ask({ type: 'stop' });

        expect(walk.outcomes).toEqual(['failed']);
    });
});

describe('standing', () => {
    it('stops walking, and ends once he is upright on his feet', () => {
        const { monkey, ask, frame } = setup();
        ask({ type: 'walk', x: 800 });
        frame(10);

        const stand = ask({ type: 'stand' });
        expect(monkey.destination).toBeUndefined();
        frame(60);

        expect(stand.outcomes).toEqual(['done']);
    });

    it('is done at once when he is already on his feet and straight', () => {
        const { ask } = setup();

        const stand = ask({ type: 'stand' });

        expect(stand.outcomes).toEqual(['done']);
    });

    it('waits until he is straight: within 0.05 rad', () => {
        const { monkey, ask, motor } = setup();
        Body.setAngle(monkey.body, 0.05);
        const stand = ask({ type: 'stand' });
        expect(stand.outcomes).toEqual([]);

        Body.setAngle(monkey.body, 0.0499);
        motor.step(STEP);

        expect(stand.outcomes).toEqual(['done']);
    });

    it('waits until he is straight on the other side too', () => {
        const { monkey, ask, motor } = setup();
        Body.setAngle(monkey.body, -0.3);
        const stand = ask({ type: 'stand' });

        motor.step(STEP);

        expect(stand.outcomes).toEqual([]);
    });

    it('waits until he is on his feet', () => {
        const { monkey, ask, motor } = setup();
        Body.setPosition(monkey.body, { x: 300, y: 300 });
        Body.setVelocity(monkey.body, { x: 0, y: 5 });
        const stand = ask({ type: 'stand' });

        motor.step(STEP);

        expect(stand.outcomes).toEqual([]);
    });

    it('waits until the visitor lets go of him', () => {
        const { world, ask, motor } = setup();
        world.grab(MONKEY, { x: 300, y: 665 });
        const stand = ask({ type: 'stand' });
        motor.step(STEP);
        expect(stand.outcomes).toEqual([]);

        world.release({ x: 0, y: 0 });
        motor.step(STEP);

        expect(stand.outcomes).toEqual(['done']);
    });

    it('can be cut short', () => {
        const { monkey, ask, frame, motor } = setup();
        Body.setAngle(monkey.body, 0.5);
        const stand = ask({ type: 'stand' });

        stand.task.cancel();
        frame(60);

        expect(stand.outcomes).toEqual([]);
        expect(motor.busy).toBe(false);
    });
});

// A piece on the floor at 600 that comes loose, and a pinned one at home.
const pieces = [spec(1, 600, 680), spec(2, 200, 300)];

describe('carrying a piece', () => {
    it('walks up to it, lifts it over his head, and ends', () => {
        const { world, monkey, last, ask, until, frame, loosen } = setup({
            specs: pieces,
        });
        loosen(1);

        const carry = ask({ type: 'carry', piece: 1 });
        until(() => carry.outcomes.length > 0);

        expect(carry.outcomes).toEqual(['done']);
        expect(world.piece(1)?.taken).toBe(true);
        frame();
        expect(last().pose).toBe('carry');
        const piece = world.piece(1)?.position;
        expect(piece?.x).toBeCloseTo(monkey.position.x, 0);
        expect(piece?.y).toBeCloseTo(monkey.position.y - 52, 0);
    });

    it('stops beside it, on the side he came from, and does not push it', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const before = harness.world.piece(1)?.position.x ?? 0;

        harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => harness.world.piece(1)?.taken === true);

        // The piece is 100 wide and he is 40: their centres are 70 px apart, he on its left, give
        // or take the 10 px of his arrival.
        expect(before - harness.monkey.position.x).toBeGreaterThanOrEqual(60);
        expect(before - harness.monkey.position.x).toBeLessThanOrEqual(80);
    });

    it('comes from the right as well', () => {
        const harness = setup({ specs: pieces, monkeyAt: 900 });
        harness.loosen(1);
        const before = harness.world.piece(1)?.position.x ?? 0;

        harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => harness.world.piece(1)?.taken === true);

        expect(harness.monkey.position.x - before).toBeGreaterThanOrEqual(60);
        expect(harness.monkey.position.x - before).toBeLessThanOrEqual(80);
    });

    it('lifts it in a quarter of a second, easing in and out', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        // He is already beside it: one step of the world and he has arrived, with no time spent.
        harness.motor.step(0);
        harness.world.step(STEP);
        harness.motor.step(0);
        const start = harness.world.piece(1)?.position ?? { x: 0, y: 0 };
        const monkey = harness.monkey.position;
        expect(harness.world.piece(1)?.taken).toBe(true);
        expect(start.y).toBeGreaterThan(660);

        harness.motor.step(125);
        const middle = harness.world.piece(1)?.position ?? { x: 0, y: 0 };
        harness.motor.step(124);
        expect(carry.outcomes).toEqual([]);
        harness.motor.step(1);
        const end = harness.world.piece(1)?.position ?? { x: 0, y: 0 };

        expect(carry.outcomes).toEqual(['done']);
        expect(middle.y).toBeCloseTo((start.y + (monkey.y - 52)) / 2, 0);
        expect(middle.x).toBeCloseTo((start.x + monkey.x) / 2, 0);
        expect(end.y).toBeCloseTo(monkey.y - 52, 5);
        expect(end.x).toBeCloseTo(monkey.x, 5);
    });

    it('runs when it is told to', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const goTo = vi.spyOn(harness.monkey, 'goTo');

        harness.ask({ type: 'carry', piece: 1, pace: 'run' });

        expect(goTo).toHaveBeenCalledWith(expect.any(Number), 6.5);
    });

    it('runs his legs while he carries at a run', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);

        harness.ask({ type: 'carry', piece: 1, pace: 'run' });
        harness.frame(3);

        expect(harness.last().gait).toBe('run');
    });

    it('fails for a piece that is unknown, and for one that is pinned', () => {
        const { ask, frame } = setup({ specs: pieces });

        const pinned = ask({ type: 'carry', piece: 2 });
        const unknown = ask({ type: 'carry', piece: 9 });
        frame();

        expect(pinned.outcomes).toEqual(['failed']);
        expect(unknown.outcomes).toEqual(['failed']);
    });

    it('fails for a piece the visitor holds, and for one already taken', () => {
        const held = setup({ specs: pieces });
        held.world.grab(2, { x: 200, y: 300 });
        const byHand = held.ask({ type: 'carry', piece: 2 });
        held.frame();
        expect(byHand.outcomes).toEqual(['failed']);

        const taken = setup({ specs: pieces });
        taken.loosen(1);
        taken.world.take(1);
        const gone = taken.ask({ type: 'carry', piece: 1 });
        taken.frame();
        expect(gone.outcomes).toEqual(['failed']);
    });

    it('fails when the visitor takes the piece while he walks to it', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.frame(10);

        harness.world.grab(1, { x: 600, y: 680 });
        harness.frame(2);

        expect(carry.outcomes).toEqual(['failed']);
        expect(harness.monkey.destination).toBeUndefined();
    });

    it('fails when the way to it is blocked, and stops', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        vi.spyOn(harness.monkey, 'blocked', 'get').mockReturnValue(true);

        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.frame(2);

        expect(carry.outcomes).toEqual(['failed']);
        expect(harness.monkey.destination).toBeUndefined();
        expect(harness.world.piece(1)?.taken).toBe(false);
    });

    it('is done at once for the piece he already holds, and fails for another: his hands are full', () => {
        const harness = setup({ specs: [...pieces, spec(3, 800, 680)] });
        harness.loosen(1);
        harness.loosen(3);
        const first = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => first.outcomes.length > 0);

        const same = harness.ask({ type: 'carry', piece: 1 });
        const other = harness.ask({ type: 'carry', piece: 3 });
        harness.frame();

        expect(same.outcomes).toEqual(['done']);
        expect(other.outcomes).toEqual(['failed']);
        expect(harness.world.piece(3)?.taken).toBe(false);
    });

    it('is cut short on the way: he stops, and has taken nothing', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.frame(10);

        carry.task.cancel();
        harness.frame(5);

        expect(carry.outcomes).toEqual([]);
        expect(harness.monkey.destination).toBeUndefined();
        expect(harness.world.piece(1)?.taken).toBe(false);
    });

    it('is cut short while lifting: he keeps what he took, held overhead, not frozen half way', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.motor.step(0);
        harness.world.step(STEP);
        harness.motor.step(0);
        harness.motor.step(100);

        carry.task.cancel();
        harness.frame(2);

        expect(carry.outcomes).toEqual([]);
        expect(harness.world.piece(1)?.taken).toBe(true);
        expect(harness.world.piece(1)?.position.x).toBeCloseTo(
            harness.monkey.position.x,
            0,
        );
        expect(harness.world.piece(1)?.position.y).toBeCloseTo(
            harness.monkey.position.y - 52,
            0,
        );
        expect(harness.last().pose).toBe('carry');
        const again = harness.ask({ type: 'carry', piece: 1 });
        expect(again.outcomes).toEqual(['done']);
    });

    it('goes with him, wherever he walks', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);

        const walk = harness.ask({ type: 'walk', x: 100 });
        harness.until(() => walk.outcomes.length > 0);

        expect(harness.world.piece(1)?.position.x).toBeCloseTo(
            harness.monkey.position.x,
            0,
        );
        expect(harness.world.piece(1)?.position.y).toBeCloseTo(
            harness.monkey.position.y - 52,
            0,
        );
    });

    it('is not his any more once the page is measured again: the pose and the request end', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);
        expect(harness.last().pose).toBe('carry');

        harness.rebuild();
        harness.frame(2);

        expect(harness.last().pose).toBe('stand');
        const place = harness.ask({ type: 'place', piece: 1 });
        harness.frame();
        expect(place.outcomes).toEqual(['failed']);
    });
});

describe('putting a piece back', () => {
    // He carries piece 1, whose home is where it came loose from: (600, 680).
    const carrying = (): Harness => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);
        return harness;
    };

    it('walks to its home, throws it up there, pins it, and ends', () => {
        const harness = carrying();

        const place = harness.ask({ type: 'place', piece: 1 });
        harness.until(() => place.outcomes.length > 0);

        expect(place.outcomes).toEqual(['done']);
        expect(harness.world.piece(1)).toMatchObject({
            pinned: true,
            taken: false,
            position: { x: 600, y: 680 },
        });
        expect(Math.abs(harness.monkey.position.x - 600)).toBeLessThanOrEqual(
            10,
        );
        expect(
            harness.log.filter(({ name }) => name === 'item.restored'),
        ).toEqual([
            { name: 'item.restored', payload: { id: 1, kind: 'block' } },
        ]);
        harness.frame();
        expect(harness.last().pose).toBe('stand');
        expect(harness.motor.busy).toBe(false);
    });

    it('throws it in 0.3 s, in an arc', () => {
        const harness = carrying();
        // He is as near its home as he needs to be: one step of the world and he has arrived.
        Body.setPosition(harness.monkey.body, { x: 600, y: 665 });
        const place = harness.ask({ type: 'place', piece: 1 });
        harness.motor.step(0);
        harness.world.step(STEP);
        harness.motor.step(0);
        const from = harness.world.piece(1)?.position ?? { x: 0, y: 0 };

        harness.motor.step(150);
        const middle = harness.world.piece(1)?.position ?? { x: 0, y: 0 };
        harness.motor.step(149);
        expect(place.outcomes).toEqual([]);
        harness.motor.step(1);

        expect(place.outcomes).toEqual(['done']);
        expect(from.y).toBeCloseTo(665 - 52, 0);
        expect(middle.x).toBeCloseTo((from.x + 600) / 2, 0);
        // Half way up the straight line to home, and the arc's 54 px above it.
        expect(middle.y).toBeCloseTo((from.y + 680) / 2 - 54, 0);
    });

    it('fails for a piece that is not the one he carries, or when he carries none', () => {
        const harness = carrying();

        const other = harness.ask({ type: 'place', piece: 2 });
        harness.frame();
        expect(other.outcomes).toEqual(['failed']);
        const unknown = harness.ask({ type: 'place', piece: 9 });
        harness.frame();
        expect(unknown.outcomes).toEqual(['failed']);
        expect(harness.world.piece(1)?.taken).toBe(true);

        const empty = setup({ specs: pieces });
        const nothing = empty.ask({ type: 'place', piece: 1 });
        empty.frame();
        expect(nothing.outcomes).toEqual(['failed']);
    });

    it('fails, keeping the piece, when the way home is blocked', () => {
        const harness = carrying();
        vi.spyOn(harness.monkey, 'blocked', 'get').mockReturnValue(true);

        const place = harness.ask({ type: 'place', piece: 1 });
        harness.frame(2);

        expect(place.outcomes).toEqual(['failed']);
        expect(harness.world.piece(1)?.taken).toBe(true);
        expect(harness.monkey.destination).toBeUndefined();
    });

    it('is cut short on the way: he stops with the piece in his hands', () => {
        const harness = carrying();
        const place = harness.ask({ type: 'place', piece: 1 });
        harness.frame(10);

        place.task.cancel();
        harness.frame(5);

        expect(place.outcomes).toEqual([]);
        expect(harness.monkey.destination).toBeUndefined();
        expect(harness.world.piece(1)?.taken).toBe(true);
        expect(harness.last().pose).toBe('carry');
    });
});

describe('dropping a piece', () => {
    it('lets the piece he holds fall, and ends at once', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);

        const drop = harness.ask({ type: 'drop' });
        expect(drop.outcomes).toEqual(['done']);
        harness.frame();
        expect(harness.last().pose).toBe('stand');
        expect(harness.world.piece(1)?.taken).toBe(false);
        // Out from under it, so that it falls to the floor.
        Body.setPosition(harness.monkey.body, { x: 100, y: 665 });
        harness.frame(120);

        expect(harness.world.piece(1)?.position.y).toBeGreaterThan(640);
        expect(harness.world.piece(1)?.pinned).toBe(false);
    });

    it('is nothing when he holds nothing', () => {
        const { ask, frame, last } = setup({ specs: pieces });

        const drop = ask({ type: 'drop' });
        frame();

        expect(drop.outcomes).toEqual(['done']);
        expect(last().pose).toBe('stand');
    });
});

describe('coming back into the page', () => {
    const where = (harness: Harness): { x: number; y: number } =>
        harness.monkey.position;

    it('puts him under the top at his own x, clamped into the page, upright and still', () => {
        const harness = setup();
        Body.setPosition(harness.monkey.body, { x: 400, y: -300 });
        Body.setVelocity(harness.monkey.body, { x: 4, y: -20 });
        Body.setAngle(harness.monkey.body, 1);

        const enter = harness.ask({ type: 'enter', from: 'top' });

        expect(enter.outcomes).toEqual(['done']);
        expect(where(harness)).toEqual({ x: 400, y: 45 });
        expect(harness.monkey.body.velocity).toEqual({ x: 0, y: 0 });
        expect(harness.monkey.angle).toBe(0);

        Body.setPosition(harness.monkey.body, { x: -500, y: -300 });
        harness.ask({ type: 'enter', from: 'top' });
        expect(where(harness).x).toBe(30);

        Body.setPosition(harness.monkey.body, { x: 1500, y: -300 });
        harness.ask({ type: 'enter', from: 'top' });
        expect(where(harness).x).toBe(970);
    });

    it('leaves his x alone at the very limit of the clamp', () => {
        const harness = setup();
        Body.setPosition(harness.monkey.body, { x: 30, y: -300 });
        harness.ask({ type: 'enter', from: 'top' });
        expect(where(harness).x).toBe(30);

        Body.setPosition(harness.monkey.body, { x: 970, y: -300 });
        harness.ask({ type: 'enter', from: 'top' });
        expect(where(harness).x).toBe(970);
    });

    it('puts him on the floor just inside the edge he went by', () => {
        const harness = setup();
        Body.setPosition(harness.monkey.body, { x: -500, y: 900 });

        harness.ask({ type: 'enter', from: 'left' });
        expect(where(harness)).toEqual({ x: 30, y: 665 });

        harness.ask({ type: 'enter', from: 'right' });
        expect(where(harness)).toEqual({ x: 970, y: 665 });
    });

    it('falls in from the top and lands on his feet', () => {
        const harness = setup();
        Body.setPosition(harness.monkey.body, { x: 400, y: -300 });
        harness.ask({ type: 'enter', from: 'top' });

        harness.until(() => harness.monkey.grounded, 600);

        expect(harness.monkey.grounded).toBe(true);
        expect(where(harness).y).toBeGreaterThan(655);
    });

    it('cuts a walk and stops it', () => {
        const harness = setup();
        const walk = harness.ask({ type: 'walk', x: 800 });
        harness.frame(5);

        const enter = harness.ask({ type: 'enter', from: 'right' });

        expect(walk.outcomes).toEqual(['failed']);
        expect(enter.outcomes).toEqual(['done']);
        expect(harness.monkey.destination).toBeUndefined();
    });
});

describe('a request that comes while another is pending', () => {
    it('replaces it, whatever the two are', () => {
        const { ask, until, monkey } = setup();
        ask({ type: 'walk', x: 800 });

        const mood = ask({ type: 'mood', mood: 'scared', ms: 100 });

        expect(mood.outcomes).toEqual([]);
        expect(monkey.destination).toBeUndefined();
        until(() => mood.outcomes.length > 0);
        expect(mood.outcomes).toEqual(['done']);
    });
});

describe('lerp', () => {
    it('goes from the first number to the second as the progress goes from 0 to 1', () => {
        expect(lerp(10, 30, 0)).toBe(10);
        expect(lerp(10, 30, 1)).toBe(30);
        expect(lerp(10, 30, 0.25)).toBe(15);
        expect(lerp(-70, 0, 0.5)).toBe(-35);
        expect(lerp(30, 10, 0.5)).toBe(20);
    });
});

describe('a request that has ended', () => {
    it('is left alone when it is cut short later, so that the next one goes on', () => {
        const { monkey, ask, until } = setup();
        const first = ask({ type: 'walk', x: 400 });
        until(() => first.outcomes.length > 0);
        const second = ask({ type: 'walk', x: 900 });

        first.task.cancel();

        expect(monkey.destination).toBe(900);
        until(() => second.outcomes.length > 0);
        expect(second.outcomes).toEqual(['done']);
    });

    it('gives a pose back even when the loop sleeps and only the clock runs', () => {
        const { last, ask, clock } = setup();
        const pose = ask({ type: 'pose', pose: 'smoke', ms: 1000 });
        const mood = setup();
        const moody = mood.ask({ type: 'mood', mood: 'proud', ms: 1000 });

        clock.tick(250);
        clock.tick(250);
        clock.tick(250);
        clock.tick(250);
        mood.clock.tick(250);
        mood.clock.tick(250);
        mood.clock.tick(250);
        mood.clock.tick(250);

        expect(pose.outcomes).toEqual(['done']);
        expect(last().pose).toBe('stand');
        expect(moody.outcomes).toEqual(['done']);
        expect(mood.last().mood).toBe('calm');
    });
});

describe('stopping while carrying', () => {
    it('keeps the piece in his hands', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);

        const stop = harness.ask({ type: 'stop' });
        harness.frame();

        expect(stop.outcomes).toEqual(['done']);
        expect(harness.world.piece(1)?.taken).toBe(true);
        expect(harness.last().pose).toBe('carry');
    });
});

describe('the time given to a pose', () => {
    it('is taken back when the request is cut short, not left to run out', () => {
        const { ask, clock } = setup();
        const pose = ask({ type: 'pose', pose: 'smoke', ms: 1000 });

        pose.task.cancel();

        expect(clock.next()).toBeUndefined();
    });
});

describe('beside a piece', () => {
    it('is on its right when he is exactly where it is', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const goTo = vi.spyOn(harness.monkey, 'goTo');
        const x = harness.world.piece(1)?.position.x ?? 0;
        Body.setPosition(harness.monkey.body, { x, y: 665 });

        harness.ask({ type: 'carry', piece: 1 });

        expect(goTo.mock.calls[0]?.[0]).toBeCloseTo(x + 70, 0);
    });

    it('starts the lift from where the piece is', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const before = harness.world.piece(1)?.position ?? { x: 0, y: 0 };
        harness.ask({ type: 'carry', piece: 1 });
        harness.motor.step(0);
        harness.world.step(STEP);

        harness.motor.step(0);

        expect(harness.world.piece(1)?.position.x).toBeCloseTo(before.x, 0);
        expect(harness.world.piece(1)?.position.y).toBeCloseTo(before.y, 0);
    });
});

describe('putting a piece back, when things change', () => {
    const carrying = (): Harness => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);
        return harness;
    };

    it('lands the piece on its home from where he stands, a few pixels off', () => {
        const harness = carrying();
        Body.setPosition(harness.monkey.body, { x: 595, y: 665 });
        const place = harness.ask({ type: 'place', piece: 1 });
        harness.motor.step(0);
        harness.world.step(STEP);
        harness.motor.step(0);

        harness.motor.step(150);
        const middle = harness.world.piece(1)?.position ?? { x: 0, y: 0 };

        expect(place.outcomes).toEqual([]);
        // The 5 px between him and home are covered along with the rest.
        expect(middle.x).toBeCloseTo(harness.monkey.position.x + 2.5, 0);
    });

    it('fails when the page is measured again on the way', () => {
        const harness = carrying();
        const place = harness.ask({ type: 'place', piece: 1 });
        harness.frame(2);

        harness.rebuild();
        harness.frame(2);

        expect(place.outcomes).toEqual(['failed']);
        expect(harness.last().pose).toBe('stand');
        expect(harness.monkey.destination).toBeUndefined();
    });

    it('is answered, and not cut, by a request that the piece’s landing starts', () => {
        const harness = carrying();
        const walks: Outcome[] = [];
        harness.events.on('item.restored', () => {
            harness.motor.perform(
                { type: 'walk', x: 100 },
                (outcome) => walks.push(outcome),
                'body',
            );
        });
        const place = harness.ask({ type: 'place', piece: 1 });

        expect(() => {
            harness.until(() => harness.monkey.destination === 100);
        }).not.toThrow();
        harness.until(() => walks.length > 0);

        expect(place.outcomes).toEqual(['done']);
        expect(walks).toEqual(['done']);
        expect(harness.world.piece(1)?.pinned).toBe(true);
    });
});

describe('a request nobody knows', () => {
    it('fails, since the director sends free JSON', () => {
        const { motor } = setup();
        const outcomes: Outcome[] = [];

        motor.perform(
            { type: 'dance' } as unknown as MonkeyRequest,
            (outcome) => outcomes.push(outcome),
            'body',
        );

        expect(outcomes).toEqual(['failed']);
    });
});

describe('two body requests in a row', () => {
    it('answer the first as failed when the second comes without a cancel', () => {
        const { ask, until } = setup();
        const first = ask({ type: 'walk', x: 800 });

        const second = ask({ type: 'walk', x: 100 });

        expect(first.outcomes).toEqual(['failed']);
        expect(second.outcomes).toEqual([]);
        until(() => second.outcomes.length > 0);
        expect(second.outcomes).toEqual(['done']);
        expect(first.outcomes).toEqual(['failed']);
    });
});

describe('a tween', () => {
    it('starts from the piece, whatever time the frame it starts in adds', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const before = harness.world.piece(1)?.position ?? { x: 0, y: 0 };
        harness.ask({ type: 'carry', piece: 1 });
        harness.world.step(STEP);

        harness.motor.step(200);

        expect(harness.world.piece(1)?.position.x).toBeCloseTo(before.x, 0);
        expect(harness.world.piece(1)?.position.y).toBeCloseTo(before.y, 0);
    });

    it('puts a piece cut short while it is thrown back overhead', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);
        Body.setPosition(harness.monkey.body, { x: 595, y: 665 });
        const place = harness.ask({ type: 'place', piece: 1 });
        harness.world.step(STEP);
        harness.motor.step(0);
        harness.motor.step(150);

        place.task.cancel();
        harness.motor.step(0);

        expect(harness.world.piece(1)?.position.x).toBeCloseTo(
            harness.monkey.position.x,
            0,
        );
        expect(harness.world.piece(1)?.position.y).toBeCloseTo(
            harness.monkey.position.y - 52,
            0,
        );
    });
});

describe('the next piece, asked for as one is put back', () => {
    it('is carried: his hands are free by the time the piece is heard restored', () => {
        const harness = setup({
            specs: [...pieces, spec(3, 800, 680)],
            monkeyAt: 530,
        });
        harness.loosen(1);
        harness.loosen(3);
        const first = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => first.outcomes.length > 0);
        let next: { outcomes: Outcome[] } | undefined;
        harness.events.on('item.restored', () => {
            next = harness.ask({ type: 'carry', piece: 3 });
        });

        const place = harness.ask({ type: 'place', piece: 1 });
        harness.until(() => place.outcomes.length > 0);
        harness.until(() => (next?.outcomes.length ?? 0) > 0);

        expect(place.outcomes).toEqual(['done']);
        expect(next?.outcomes).toEqual(['done']);
        expect(harness.world.piece(3)?.taken).toBe(true);
    });
});

describe('the page measured again while he carries', () => {
    it('does not make a carry of a piece he no longer holds', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.motor.step(0);
        harness.world.step(STEP);
        harness.motor.step(0);
        harness.motor.step(100);

        harness.rebuild();
        harness.frame(40);

        expect(carry.outcomes).toEqual(['failed']);
        expect(harness.last().pose).toBe('stand');
    });

    it('does not put back a piece the visitor freed since, nor say it was restored', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);
        Body.setPosition(harness.monkey.body, { x: 595, y: 665 });
        const place = harness.ask({ type: 'place', piece: 1 });
        harness.motor.step(0);
        harness.world.step(STEP);
        harness.motor.step(0);
        harness.motor.step(100);
        const restored = (): number =>
            harness.log.filter(({ name }) => name === 'item.restored').length;
        const before = restored();

        harness.rebuild();
        harness.world.grab(1, { x: 600, y: 680 });
        harness.world.release({ x: 0, y: 0 });
        harness.frame(40);

        expect(place.outcomes).toEqual(['failed']);
        expect(restored()).toBe(before);
        expect(harness.world.piece(1)?.pinned).toBe(false);
    });
});

describe('the page measured again on the frame a tween ends', () => {
    it('does not put back a piece the visitor freed since', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);
        Body.setPosition(harness.monkey.body, { x: 595, y: 665 });
        const place = harness.ask({ type: 'place', piece: 1 });
        harness.motor.step(0);
        harness.world.step(STEP);
        harness.motor.step(0);
        harness.motor.step(100);
        harness.rebuild();
        harness.world.grab(1, { x: 600, y: 680 });
        harness.world.release({ x: 0, y: 0 });

        harness.world.step(STEP);
        harness.motor.step(400);
        harness.frame(40);

        expect(place.outcomes).toEqual(['failed']);
        expect(harness.world.piece(1)?.pinned).toBe(false);
    });

    it('does not answer done for a piece he no longer holds', () => {
        const harness = setup({ specs: pieces, monkeyAt: 530 });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.motor.step(0);
        harness.world.step(STEP);
        harness.motor.step(0);
        harness.motor.step(100);
        harness.rebuild();

        harness.world.step(STEP);
        harness.motor.step(400);
        harness.frame(40);

        expect(carry.outcomes).toEqual(['failed']);
    });
});

describe('passing through the loose pieces', () => {
    const LOOSE = 8;
    const solid = (monkey: MonkeyBody): boolean =>
        ((monkey.body.collisionFilter.mask ?? 0) & LOOSE) === LOOSE;

    it('does so while a carry walks, and no longer once it is done', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        expect(solid(harness.monkey)).toBe(true);

        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.frame(5);
        expect(solid(harness.monkey)).toBe(false);
        harness.until(() => carry.outcomes.length > 0);

        expect(carry.outcomes).toEqual(['done']);
        harness.frame(2);
        expect(solid(harness.monkey)).toBe(true);
    });

    it('does so while a place walks, and no longer once it is done', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.until(() => carry.outcomes.length > 0);

        const place = harness.ask({ type: 'place', piece: 1 });
        harness.frame(5);
        expect(solid(harness.monkey)).toBe(false);
        harness.until(() => place.outcomes.length > 0);

        expect(place.outcomes).toEqual(['done']);
        harness.frame(2);
        expect(solid(harness.monkey)).toBe(true);
    });

    it('keeps every collision on a plain walk', () => {
        const harness = setup({ specs: pieces });

        harness.ask({ type: 'walk', x: 600 });
        harness.frame(5);

        expect(solid(harness.monkey)).toBe(true);
    });

    it('is given back when the request is cut short', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.frame(5);

        carry.task.cancel();
        harness.frame(2);

        expect(solid(harness.monkey)).toBe(true);
    });

    it('is given back when another request replaces it', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        harness.ask({ type: 'carry', piece: 1 });
        harness.frame(5);

        harness.ask({ type: 'walk', x: 100 });
        harness.frame(2);

        expect(solid(harness.monkey)).toBe(true);
    });

    it('is given back when the request fails', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.frame(5);

        harness.world.restore(1);
        harness.frame(2);

        expect(carry.outcomes).toEqual(['failed']);
        expect(solid(harness.monkey)).toBe(true);
    });

    it('leaves the new body alone when the page is measured again on the way', () => {
        const harness = setup({ specs: pieces });
        harness.loosen(1);
        const carry = harness.ask({ type: 'carry', piece: 1 });
        harness.frame(5);

        harness.rebuild();
        harness.frame(2);

        expect(carry.outcomes).toEqual(['failed']);
        expect(solid(harness.monkey)).toBe(true);
    });
});
