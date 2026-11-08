import {
    wait,
    type Behaviour,
    type ContextSource,
    type Run,
    type Step,
} from '../../../../assets/game/brain/behaviour';
import { Brain } from '../../../../assets/game/brain/brain';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { Speaker, type LineBook } from '../../../../assets/game/lines/speaker';
import { FakeMotor } from '../../../../assets/game/ports/fake_motor';
import type { Outcome } from '../../../../assets/game/ports/motor';

export interface Walk {
    type: 'walk';
    to: number;
}

export const walk = (to: number): Walk => ({ type: 'walk', to });

export const book: LineBook = {
    locale: 'en',
    pools: { grab: ['Put that back.', 'Hey!'], hurt: ['Ouch!'] },
};

type Script = () => Run<Walk>;

// A behaviour with defaults for everything a test does not care about.
export const behaviour = (
    id: string,
    overrides: Partial<Behaviour<Walk>> = {},
): Behaviour<Walk> => ({
    id,
    actor: 'monkey',
    kind: 'activity',
    priority: 10,
    triggers: ['item.freed'],
    canStart: () => true,
    *run(): Run<Walk> {
        yield walk(1);
    },
    ...overrides,
});

// An activity of the given steps; the outcome of each is recorded.
export const steps = (
    ...requests: Step<Walk>[]
): { run: Script; outcomes: Outcome[] } => {
    const outcomes: Outcome[] = [];
    return {
        outcomes,
        run: function* (): Run<Walk> {
            for (const request of requests) {
                outcomes.push(yield request);
            }
        },
    };
};

export const freed = {
    id: 1,
    kind: 'block' as const,
    by: 'impact' as const,
};

export interface Setup {
    brain: Brain<Walk>;
    clock: Clock;
    events: EventBus<GameEvents>;
    motor: FakeMotor;
    errors: { id: string | undefined; error: unknown }[];
    // The behaviour events, as `+id`, `-id:by` and `+id (resumed)`; line.said as `"text"`.
    log: string[];
    advance: (ms: number) => void;
}

export interface SetupOptions {
    motor?: FakeMotor;
    random?: () => number;
    sources?: ContextSource[];
    voiced?: boolean;
    idleDelay?: number;
}

export const setup = (
    behaviours: Behaviour<Walk>[],
    { motor = new FakeMotor(), voiced = true, ...options }: SetupOptions = {},
): Setup => {
    const clock = new Clock({ maxStep: 1_000_000 });
    const events = new EventBus<GameEvents>();
    const errors: Setup['errors'] = [];
    const log: string[] = [];
    events.on('behaviour.started', ({ id, resumed }) => {
        log.push(`+${id}${resumed ? ' (resumed)' : ''}`);
    });
    events.on('behaviour.ended', ({ id, by }) => {
        log.push(`-${id}:${by}`);
    });
    events.on('line.said', ({ text }) => {
        log.push(`"${text}"`);
    });
    const brain = new Brain<Walk>({
        actor: 'monkey',
        behaviours,
        motor,
        events,
        clock,
        random: (): number => 0,
        speaker: voiced ? new Speaker({ book, clock }) : undefined,
        onError: (error, id): void => {
            errors.push({ id, error });
        },
        ...options,
    });
    return {
        brain,
        clock,
        events,
        motor,
        errors,
        log,
        advance: (ms): void => {
            clock.tick(ms);
        },
    };
};

export { wait };
