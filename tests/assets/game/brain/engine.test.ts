import { describe, expect, it, vi } from 'vitest';
import type { ContextSource } from '../../../../assets/game/brain/behaviour';
import { Engine } from '../../../../assets/game/brain/engine';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { FakeMotor } from '../../../../assets/game/ports/fake_motor';
import { behaviour, book, freed, walk } from './brain_fixture';

const reduced: ContextSource = () => ({ reducedMotion: true });

const setup = (): {
    engine: Engine;
    events: EventBus<GameEvents>;
    clock: Clock;
    errors: unknown[];
    log: string[];
} => {
    const events = new EventBus<GameEvents>();
    const clock = new Clock({ maxStep: 100_000 });
    const errors: unknown[] = [];
    const log: string[] = [];
    events.on('behaviour.started', ({ actor, id }) => {
        log.push(`${actor}:${id}`);
    });
    events.on('line.said', ({ actor, text }) => {
        log.push(`${actor} says ${text}`);
    });
    const engine = new Engine({
        events,
        clock,
        random: (): number => 0,
        lines: book,
        onError: (error): void => {
            errors.push(error);
        },
        behaviours: [
            behaviour('monkey/flee'),
            behaviour('drone/hover', { actor: 'drone', priority: 1 }),
            behaviour('monkey/chat', {
                kind: 'line',
                triggers: [],
                lines: ['hurt'],
                *run(_, act) {
                    act.say('hurt');
                    yield { type: 'wait', ms: 1 };
                },
            }),
        ],
    });
    return { engine, events, clock, errors, log };
};

describe('the actors', () => {
    it('lists the actors that have behaviours, each once, and their behaviours', () => {
        const { engine } = setup();

        expect(engine.actors()).toEqual(['monkey', 'drone']);
        expect(engine.behaviours('monkey').map(({ id }) => id)).toEqual([
            'monkey/flee',
            'monkey/chat',
        ]);
        expect(engine.behaviours('drone').map(({ id }) => id)).toEqual([
            'drone/hover',
        ]);
        expect(engine.behaviours('cat')).toEqual([]);
    });

    it('lists an actor that has a body and no behaviour yet, after the others, once', () => {
        const { engine } = setup();

        engine.attach('cat', new FakeMotor());
        engine.attach('monkey', new FakeMotor());

        expect(engine.actors()).toEqual(['monkey', 'drone', 'cat']);
    });

    it('shares its clock', () => {
        const { engine, clock } = setup();

        expect(engine.clock).toBe(clock);
    });
});

describe('attaching a body', () => {
    it('gives the actor a Brain with its own behaviours only', () => {
        const { engine, events, log } = setup();
        const motor = new FakeMotor();

        const brain = engine.attach('monkey', motor);
        events.emit('item.freed', freed);

        expect(engine.brain('monkey')).toBe(brain);
        expect(log).toEqual(['monkey:monkey/flee']);
        expect(motor.requests).toEqual([walk(1)]);
    });

    it('keeps the body an actor was given, for whoever wants to drive it', () => {
        const { engine } = setup();
        const motor = new FakeMotor();

        expect(engine.motor('monkey')).toBeUndefined();
        engine.attach('monkey', motor);

        expect(engine.motor('monkey')).toBe(motor);
        expect(engine.motor('drone')).toBeUndefined();
    });

    it('leaves an actor with no body out of the game', () => {
        const { engine, events, log } = setup();
        engine.attach('monkey', new FakeMotor());

        events.emit('item.freed', freed);

        expect(engine.brain('drone')).toBeUndefined();
        expect(log).toEqual(['monkey:monkey/flee']);
    });

    it('runs each actor on its own', () => {
        const { engine, events, log } = setup();
        engine.attach('monkey', new FakeMotor());
        engine.attach('drone', new FakeMotor());

        events.emit('item.freed', freed);

        expect(log).toEqual(['monkey:monkey/flee', 'drone:drone/hover']);
    });

    it('does not let an actor have two bodies', () => {
        const { engine } = setup();
        engine.attach('monkey', new FakeMotor());

        expect(() => engine.attach('monkey', new FakeMotor())).toThrow(
            'The monkey already has a body.',
        );
    });

    it('gives a voice only when asked', () => {
        const mute = setup();
        const loud = setup();
        mute.engine.attach('monkey', new FakeMotor());
        loud.engine.attach('monkey', new FakeMotor(), { speaks: true });

        expect(mute.engine.brain('monkey')?.start('monkey/chat')).toBe(true);
        expect(loud.engine.brain('monkey')?.start('monkey/chat')).toBe(true);

        expect(mute.errors).toHaveLength(1);
        expect(loud.errors).toEqual([]);
        expect(loud.log).toContain('monkey says Ouch!');
    });

    it('keeps a cooldown for each voice', () => {
        const { engine, log } = setup();
        const monkey = engine.attach('monkey', new FakeMotor(), {
            speaks: true,
        });
        engine.attach('drone', new FakeMotor(), { speaks: true });

        monkey.start('monkey/chat');

        expect(log.filter((entry) => entry.includes('says'))).toEqual([
            'monkey says Ouch!',
        ]);
    });

    it('hands the Brain the context sources and the idle delay', () => {
        const canStart = vi.fn(() => true);
        const events = new EventBus<GameEvents>();
        const custom = new Engine({
            events,
            clock: new Clock(),
            random: (): number => 0,
            lines: book,
            sources: [reduced],
            onError: (): void => undefined,
            behaviours: [behaviour('monkey/flee', { canStart })],
        });
        custom.attach('monkey', new FakeMotor());

        events.emit('item.freed', freed);

        expect(canStart).toHaveBeenCalledWith(
            expect.objectContaining({ reducedMotion: true }),
        );
    });

    it('uses the idle delay it is given', () => {
        const events = new EventBus<GameEvents>();
        const clock = new Clock();
        const log: string[] = [];
        events.on('behaviour.started', ({ id }) => {
            log.push(id);
        });
        const engine = new Engine({
            events,
            clock,
            random: (): number => 0,
            lines: book,
            idleDelay: 100,
            onError: (): void => undefined,
            behaviours: [
                behaviour('monkey/smoke', { kind: 'ambient', triggers: [] }),
            ],
        });
        engine.attach('monkey', new FakeMotor());

        clock.tick(100);

        expect(log).toEqual(['monkey/smoke']);
    });
});

describe('busy and stop', () => {
    it('is busy while any Brain is', () => {
        const { engine, events } = setup();
        engine.attach('monkey', new FakeMotor());
        engine.attach('drone', new FakeMotor());
        expect(engine.busy).toBe(false);

        events.emit('item.freed', freed);

        expect(engine.busy).toBe(true);
    });

    it('is not busy with no body', () => {
        expect(setup().engine.busy).toBe(false);
    });

    it('stops every Brain and forgets them', () => {
        const { engine, events, log } = setup();
        engine.attach('monkey', new FakeMotor());

        engine.stop();
        events.emit('item.freed', freed);

        expect(log).toEqual([]);
        expect(engine.brain('monkey')).toBeUndefined();
        expect(engine.motor('monkey')).toBeUndefined();
        expect(engine.actors()).toEqual(['monkey', 'drone']);
        expect(engine.busy).toBe(false);
    });
});
