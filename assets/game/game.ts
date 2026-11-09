import type { Behaviour } from './brain/behaviour';
import { Engine } from './brain/engine';
import { Clock } from './clock/clock';
import { EventBus } from './events/event_bus';
import type { GameEvents, Point } from './events/game_events';
import { Frame, type FrameEnvironment } from './frame/frame';
import { Input } from './input/input';
import { Quiet } from './input/quiet';
import type { LineBook } from './lines/speaker';
import { Monkey } from './monkey/monkey';
import {
    clearPlacement,
    measureBounds,
    measurePieces,
    measureViewport,
    pieceAt,
    prefersReducedMotion,
    resetPiece,
    scrollOffset,
    setState,
    writePlacements,
    type Measured,
} from './page/page';
import { Blasts } from './page/blasts';
import { Bombs } from './page/bombs';
import { Scorches } from './page/scorches';
import { Shake } from './page/shake';
import { Tornado } from './page/tornado';
import type { Bounds } from './physics/bodies';
import type { MonkeyBody } from './physics/monkey_body';
import { MONKEY, PhysicsWorld } from './physics/world';
import { monkeyActivity } from './ports/monkey_activity';
import { monkeyPieces } from './ports/monkey_pieces';
import { monkeyWorld } from './ports/monkey_world';
import { registered } from './registry/behaviours';

// What the dock, the monkey and the Rebuild call. Positions are page coordinates.
export interface Game {
    readonly events: EventBus<GameEvents>;
    // The actors' Brains: whoever builds an actor's Motor attaches it here.
    readonly engine: Engine;
    // A bomb falls from `at`, burns its fuse and blows.
    bomb(at: Point): void;
    // A tornado over `at.x`, for a few seconds. None under reduced motion.
    tornado(at: Point): void;
    setZeroGravity(on: boolean): void;
    // Moves a piece back to its home and pins it again.
    restore(id: number): void;
    // Wipes the marks bombs left, as the Rebuild does.
    clearScorches(): void;
    // Asks the monkey to carry every broken piece home (`rebuild.requested`), or, if he is
    // already tidying slowly, to hurry.
    rebuild(): void;
    stop(): void;
}

export interface GameOptions {
    // Shared with the other systems; a new bus when omitted.
    events?: EventBus<GameEvents>;
    random?: () => number;
    // The lines of the page's language, as the server rendered them.
    lines: LineBook;
    // What the registry found, unless a test brings its own.
    behaviours?: readonly Behaviour[];
    // Read from the browser when omitted.
    reducedMotion?: boolean;
    frameEnvironment?: FrameEnvironment;
}

// A resize that settles for this long, in ms of game time, measures the page again.
const RESIZE_DELAY = 160;
const MAX_SCORCHES = 12;
const SHAKE = 16;
// Where the monkey first stands on the ground, from the left edge.
const SPAWN_X = 64;
// The visitor's silence, in ms of game time, after which the monkey tidies up on his own.
const QUIET_AFTER = 15_000;

interface Scene {
    world: PhysicsWorld;
    measured: Measured;
    bounds: Bounds;
    monkey: MonkeyBody;
}

// Builds the physics from the page's `data-physics` elements and runs it: the loop, the pointer,
// the effects. `stop` hands the page back as the server rendered it.
export const startGame = (root: HTMLElement, options: GameOptions): Game => {
    const events = options.events ?? new EventBus<GameEvents>();
    const random = options.random ?? Math.random;
    const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    const clock = new Clock();
    const activity = monkeyActivity(events, () => clock.now());
    const engine = new Engine({
        events,
        clock,
        random,
        behaviours: options.behaviours ?? registered,
        lines: options.lines,
        sources: [
            (): { reducedMotion: boolean } => ({ reducedMotion }),
            monkeyWorld(() => ({
                pageWidth: scene.bounds.width,
                monkeyX: scene.monkey.position.x,
            })),
            monkeyPieces(() => ({
                loose: scene.world.loose(),
                carrying: monkey.motor.carrying,
            })),
            activity.source,
        ],
        // A behaviour that fails ends there: the game goes on.
        onError: (error, source): void => {
            console.error(`The behaviour engine failed in ${source}.`, error);
        },
    });
    const abort = new AbortController();
    // Marks go where the shake doesn't reach: it moves the root, and a transform would carry
    // them along. The ground's parent is the scene, whose box starts at the page's origin.
    const stage =
        document.querySelector('[data-ground]')?.parentElement ?? document.body;
    const scorches = new Scorches(stage, MAX_SCORCHES);
    const shake = new Shake(root, random);
    const bombs = new Bombs(stage, reducedMotion);
    const tornado = new Tornado(stage, clock, () => scene.bounds.floor);
    const blasts = new Blasts({
        parent: stage,
        clock,
        random,
        reducedMotion,
    });
    let resizing = false;
    let cancelResize: (() => void) | undefined;

    // The monkey stands on the ground at `monkeyX`.
    const build = (monkeyX: number): Scene => {
        const scroll = scrollOffset();
        const measured = measurePieces(root, scroll);
        const bounds = measureBounds(scroll);
        const world = new PhysicsWorld(bounds, measured.specs, {
            events,
            clock,
            random,
            reducedMotion,
        });
        const monkey = world.addMonkey(monkeyX);
        return { world, measured, bounds, monkey };
    };
    let scene = build(SPAWN_X);

    const frame = new Frame({
        clock,
        environment: options.frameEnvironment,
        onFrame: (elapsed): void => {
            scene.world.step(elapsed);
            writePlacements(scene.measured.elements, scene.world.placements());
            bombs.step(scene.world.bombs());
            tornado.step(scene.world.tornado());
            monkey.step(elapsed);
            shake.step(elapsed);
        },
        idle: (): boolean =>
            scene.world.resting &&
            !input.busy &&
            !shake.active &&
            !resizing &&
            !monkey.busy,
    });

    const monkey = new Monkey({
        host: stage,
        world: (): PhysicsWorld => scene.world,
        body: (): MonkeyBody => scene.monkey,
        events,
        clock,
        signal: abort.signal,
        reducedMotion,
        viewport: measureViewport,
        wake: (): void => {
            frame.wake();
        },
    });
    engine.attach('monkey', monkey.motor, { speaks: true });
    monkey.step(0);
    // The Brain's idle timer is on the game clock: the loop runs once, then sleeps to that timer.
    frame.wake();

    const wake = (): void => {
        frame.wake();
    };
    // A silence from the visitor lets him tidy up by himself; any press or key ends it.
    const quiet = new Quiet({
        clock,
        after: QUIET_AFTER,
        onQuiet: (): void => {
            events.emit('visitor.idle', undefined);
        },
    });
    for (const type of ['pointerdown', 'keydown']) {
        window.addEventListener(
            type,
            () => {
                // The game clock stands still while the loop sleeps: catch it up first, or the
                // silence would be measured from a stale time.
                wake();
                quiet.touch();
            },
            { capture: true, signal: abort.signal },
        );
    }

    // The scene holds the content and the monkey, so a press on either reaches the hand.
    const input = new Input({
        root: stage,
        clock,
        signal: abort.signal,
        hooks: {
            pick: (target): number | undefined => {
                if (monkey.look.contains(target)) {
                    return MONKEY;
                }
                const id = pieceAt(scene.measured, target);
                return id !== undefined &&
                    scene.measured.specs[id]?.traits.grabbable
                    ? id
                    : undefined;
            },
            grab: (id, at): boolean => scene.world.grab(id, at),
            drag: (to): void => {
                scene.world.drag(to);
            },
            release: (velocity): void => {
                scene.world.release(velocity);
            },
            aim: (x): void => {
                scene.world.aim(x);
            },
            wake,
        },
    });

    // The page shows what the physics says: a state on the element for the CSS to style.
    const show = (
        state: 'pinned' | 'loose' | 'held',
        { id }: { id: number },
    ): void => {
        const element = scene.measured.elements.get(id);
        if (element) {
            setState(element, state);
        }
    };
    const unsubscribe = [
        activity.stop,
        quiet.stop,
        // Whatever happens may start a behaviour, which needs the clock to run.
        events.onAny(() => {
            frame.wake();
        }),
        events.on('item.freed', (payload) => {
            show('loose', payload);
        }),
        events.on('item.grabbed', (payload) => {
            show('held', payload);
        }),
        events.on('item.dropped', (payload) => {
            show('loose', payload);
        }),
        events.on('item.thrown', (payload) => {
            show('loose', payload);
        }),
        events.on('item.restored', (payload) => {
            show('pinned', payload);
            const element = scene.measured.elements.get(payload.id);
            if (element) {
                clearPlacement(element);
            }
            // The last piece home is the end of the work: the soot goes with it.
            if (scene.world.allHome()) {
                scorches.clear();
            }
        }),
        events.on('rebuild.requested', () => {
            scorches.clear();
        }),
        events.on('bomb.exploded', ({ id, at, radius }) => {
            bombs.remove(id);
            blasts.add(at, radius);
            scorches.add(at);
            if (!reducedMotion) {
                shake.trigger(SHAKE);
            }
        }),
    ];

    const reset = (): void => {
        for (const element of scene.measured.elements.values()) {
            resetPiece(element);
        }
        scorches.clear();
        bombs.clear();
        blasts.clear();
        tornado.clear();
        shake.stop();
    };

    const remeasure = (): void => {
        resizing = false;
        scene.world.dispose();
        input.cancel();
        reset();
        scene = build(scene.monkey.position.x);
    };

    window.addEventListener(
        'resize',
        () => {
            // The ground sits at the bottom of the scene (`svh`, so the toolbar of a phone never
            // moves it): measure again when a real resize changed the width or the floor.
            const now = measureBounds(scrollOffset());
            if (
                now.width === scene.bounds.width &&
                now.floor === scene.bounds.floor
            ) {
                // Back to the built layout: no rebuild is owed any more.
                cancelResize?.();
                cancelResize = undefined;
                resizing = false;
                return;
            }
            cancelResize?.();
            resizing = true;
            cancelResize = clock.after(RESIZE_DELAY, remeasure);
            frame.wake();
        },
        { signal: abort.signal },
    );

    const live = (action: () => void): void => {
        if (!abort.signal.aborted) {
            action();
            frame.wake();
        }
    };

    return {
        events,
        engine,
        bomb: (at): void => {
            live(() => {
                scene.world.placeBomb(at);
            });
        },
        tornado: (at): void => {
            live(() => {
                scene.world.startTornado(at.x);
            });
        },
        setZeroGravity: (on): void => {
            live(() => {
                scene.world.setZeroGravity(on);
            });
        },
        restore: (id): void => {
            live(() => {
                const wasHeld = scene.world.holding;
                scene.world.restore(id);
                // Restoring the held piece lets go of it: the hand is free again.
                if (wasHeld && !scene.world.holding) {
                    input.cancel();
                }
            });
        },
        clearScorches: (): void => {
            scorches.clear();
        },
        rebuild: (): void => {
            live(() => {
                events.emit('rebuild.requested', undefined);
            });
        },
        // Safe to call twice: each step is.
        stop: (): void => {
            abort.abort();
            frame.stop();
            for (const off of unsubscribe) {
                off();
            }
            engine.stop();
            monkey.stop();
            scene.world.dispose();
            reset();
        },
    };
};
