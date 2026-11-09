import type {
    Behaviour,
    ContextFields,
} from '../../../../../assets/game/brain/behaviour';
import { Brain } from '../../../../../assets/game/brain/brain';
import { Clock } from '../../../../../assets/game/clock/clock';
import { EventBus } from '../../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../../assets/game/events/game_events';
import { Speaker } from '../../../../../assets/game/lines/speaker';
import { FakeMotor } from '../../../../../assets/game/ports/fake_motor';
import type { MonkeyRequest } from '../../../../../assets/game/ports/monkey';
import { discover } from '../../../../../assets/game/registry/discover';

export interface Stage {
    brain: Brain<MonkeyRequest>;
    clock: Clock;
    events: EventBus<GameEvents>;
    motor: FakeMotor;
    // The keys of the lines said, and the behaviours' starts and ends (`+id`, `-id:by`), in order.
    log: string[];
    advance: (ms: number) => void;
}

export interface StageOptions {
    context?: Partial<ContextFields>;
    random?: () => number;
}

// The monkey's Brain with the given behaviour files (their default exports) on a FakeMotor, as
// the registry would find them, and a book that has a one-line pool for each line key.
export const stage = (
    modules: Record<string, unknown>,
    { context = {}, random = (): number => 0 }: StageOptions = {},
): Stage => {
    const clock = new Clock({ maxStep: 1_000_000 });
    const events = new EventBus<GameEvents>();
    const motor = new FakeMotor();
    const log: string[] = [];
    events.on('line.said', ({ key }) => {
        log.push(key);
    });
    events.on('behaviour.started', ({ id }) => {
        log.push(`+${id}`);
    });
    events.on('behaviour.ended', ({ id, by }) => {
        log.push(`-${id}:${by}`);
    });
    const behaviours = discover(
        Object.fromEntries(
            Object.entries(modules).map(([name, module]) => [
                `../activities/monkey/${name}.ts`,
                { default: module },
            ]),
        ),
    ) as Behaviour<MonkeyRequest>[];
    const keys = behaviours.flatMap(({ lines = [] }) => lines);
    const brain = new Brain<MonkeyRequest>({
        actor: 'monkey',
        behaviours,
        motor,
        events,
        clock,
        random,
        sources: [(): Partial<ContextFields> => context],
        speaker: new Speaker({
            clock,
            book: {
                locale: 'en',
                pools: Object.fromEntries(keys.map((key) => [key, [key]])),
            },
        }),
        onError: (error): void => {
            throw error instanceof Error ? error : new Error(String(error));
        },
    });
    return {
        brain,
        clock,
        events,
        motor,
        log,
        advance: (ms): void => {
            clock.tick(ms);
        },
    };
};
