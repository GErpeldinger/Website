import type { ClockView } from '../clock/clock';
import type { Point } from '../events/game_events';
import type { Appearance } from '../look/look';
import { MONKEY_WIDTH } from '../physics/bodies';
import type { MonkeyBody } from '../physics/monkey_body';
import type { PhysicsWorld } from '../physics/world';
import type {
    ChosenPose,
    Facing,
    Mood,
    MonkeyRequest,
    Pace,
} from '../ports/monkey';
import type { Layer, Motor, MotorTask, Outcome } from '../ports/motor';

export interface MonkeyMotorOptions {
    // The page's physics and the monkey's body in it, asked each time: the world is built again
    // when the page is measured again.
    world: () => PhysicsWorld;
    body: () => MonkeyBody;
    // Draws the pose, the mood and the way he faces.
    look: { show(appearance: Appearance): void };
    clock: ClockView;
    // A request came in outside the game's own events: the loop must run to carry it out.
    wake: () => void;
}

// Pixels per 60 Hz step, from the prototype.
const SPEEDS: Record<Pace, number> = { walk: 3, run: 6.5 };
// He cannot reach a spot nearer a wall than his half width.
const WALL_MARGIN = MONKEY_WIDTH / 2;
// A target that moves this far makes him turn to the new spot.
const RETARGET = 8;

// Whether a goal he knows of must be set again for a target that may have moved.
export const retargets = (known: number, wanted: number): boolean =>
    Math.abs(known - wanted) > RETARGET;
// Upright on his feet again: within this many radians of vertical.
const UPRIGHT = 0.05;
// What he holds overhead: straight above his centre.
const OVERHEAD: Point = { x: 0, y: -52 };
const LIFT_TIME = 250;
const TOSS_TIME = 300;
// How high a piece arcs on its way home.
const TOSS_ARC = 54;

// A request being carried out: polled each frame until it gives an outcome, or waiting on a timer.
interface Task {
    poll?: () => Outcome | undefined;
    // What to undo if it is cut short.
    undo: () => void;
    finish: (outcome: Outcome) => void;
    cancel: () => void;
    // Cut by the next request, which the Brain did not cancel first: the answer it is owed.
    supersede: () => () => void;
}

// What an overlay changes while it lasts, over what the body is doing.
interface Overlay {
    pose?: ChosenPose;
    mood?: Mood;
}

type Steps = Generator<void, Outcome>;

const smooth = (t: number): number => t * t * (3 - 2 * t);

export const lerp = (from: number, to: number, t: number): number =>
    from + (to - from) * t;

// What he holds overhead: the piece, where it belongs, and where he holds it from his centre.
interface Carried {
    id: number;
    home: Point;
    offset: Point;
}

// Carries out the monkey's requests on his body in the world, and tells the Look what to show:
// the one place that knows both. The body requests run one at a time, the overlays (a flinch, a
// scared face, a line's gesture) on top of them. `step` runs once per frame, after the world's.
export class MonkeyMotor implements Motor<MonkeyRequest> {
    readonly #options: MonkeyMotorOptions;
    readonly #overlays: Overlay[] = [];
    #task: Task | undefined;
    #pose: ChosenPose = 'stand';
    #mood: Mood = 'calm';
    #facing: Facing = 'right';
    #carried: Carried | undefined;
    #restoring: number | undefined;
    // The time the frame in progress adds, for the tweens.
    #elapsed = 0;

    constructor(options: MonkeyMotorOptions) {
        this.#options = options;
    }

    // The piece in his hands, if any: a carry cut short leaves it overhead.
    get carrying(): number | undefined {
        return this.#carried?.id;
    }

    // A request that needs a frame each time is pending: the loop must go on.
    get busy(): boolean {
        return this.#task?.poll !== undefined;
    }

    perform(
        request: MonkeyRequest,
        done: (outcome: Outcome) => void,
        layer: Layer,
    ): MotorTask {
        this.#options.wake();
        return layer === 'overlay'
            ? this.#overlay(request, done)
            : this.#body(request, done);
    }

    step(elapsed: number): void {
        this.#elapsed = elapsed;
        const body = this.#options.body();
        if (body.heading === 1) {
            this.#facing = 'right';
        } else if (body.heading === -1) {
            this.#facing = 'left';
        }
        // Before the poll: a tween that ends this frame must not answer for a piece that is gone.
        this.#forget();
        const task = this.#task;
        const outcome = task?.poll?.();
        if (task && outcome !== undefined) {
            task.finish(outcome);
            // Only a finished `place` sets it, and the toss tween always pauses once, so this is
            // only ever reached from here.
            this.#restoreDue();
        }
        this.#follow();
        this.#show();
    }

    #overlay(
        request: MonkeyRequest,
        done: (outcome: Outcome) => void,
    ): MotorTask {
        if (
            (request.type !== 'pose' && request.type !== 'mood') ||
            request.ms === undefined
        ) {
            done('failed');
            return { cancel: (): void => undefined };
        }
        const overlay: Overlay =
            request.type === 'pose'
                ? { pose: request.pose }
                : { mood: request.mood };
        this.#overlays.push(overlay);
        this.#show();
        const remove = (): void => {
            this.#overlays.splice(this.#overlays.indexOf(overlay), 1);
            this.#show();
        };
        const cancelTimer = this.#options.clock.after(request.ms, () => {
            remove();
            done('done');
        });
        return {
            cancel: (): void => {
                // A timer that already fired took the overlay away.
                if (this.#overlays.includes(overlay)) {
                    cancelTimer();
                    remove();
                }
            },
        };
    }

    #body(request: MonkeyRequest, done: (outcome: Outcome) => void): MotorTask {
        // A request that comes while another is pending replaces it, and the first is told so.
        const replaced = this.#task?.supersede();
        let open = true;
        const leave = (): void => {
            open = false;
            this.#task = undefined;
        };
        const task: Task = {
            undo: (): void => undefined,
            // Only the current task finishes: a cut one is never stepped or timed again. That
            // holds while no step emits an event that could cut it: only `restore` does, and it
            // runs after this.
            finish: (outcome): void => {
                leave();
                this.#show();
                done(outcome);
            },
            cancel: (): void => {
                if (open) {
                    leave();
                    task.undo();
                    this.#show();
                }
            },
            supersede: () => {
                task.cancel();
                return (): void => {
                    done('failed');
                };
            },
        };
        this.#task = task;
        this.#start(request, task);
        this.#show();
        replaced?.();
        return { cancel: task.cancel };
    }

    // May finish the task at once.
    #start(request: MonkeyRequest, task: Task): void {
        // A request cut short leaves him standing where he is, not walking on.
        const halt = (): void => {
            this.#options.body().halt();
        };
        // A piece he was carrying stays held overhead, not frozen half way.
        const release = (): void => {
            halt();
            this.#settle();
        };
        switch (request.type) {
            case 'face':
                this.#facing = request.direction;
                task.finish('done');
                break;
            case 'stop':
                // What he was doing, if anything, was cut when this came: it stopped him.
                task.finish('done');
                break;
            case 'drop':
                this.#drop();
                task.finish('done');
                break;
            case 'pose':
                this.#set(
                    task,
                    request.ms,
                    () => {
                        this.#pose = request.pose;
                    },
                    () => {
                        this.#pose = 'stand';
                    },
                );
                break;
            case 'mood':
                this.#set(
                    task,
                    request.ms,
                    () => {
                        this.#mood = request.mood;
                    },
                    () => {
                        this.#mood = 'calm';
                    },
                );
                break;
            case 'stand':
                this.#poll(task, this.#stand());
                break;
            case 'walk':
                this.#poll(
                    task,
                    this.#walkTo(() => request.x, request.pace ?? 'walk'),
                    halt,
                );
                break;
            case 'carry':
                this.#poll(
                    task,
                    this.#carry(request.piece, request.pace),
                    release,
                );
                break;
            case 'place':
                this.#poll(
                    task,
                    this.#place(request.piece, request.pace),
                    release,
                );
                break;
            default:
                // The director sends free JSON.
                task.finish('failed');
        }
    }

    // Sets a pose or a mood, for `ms` if told so, then gives it back.
    #set(
        task: Task,
        ms: number | undefined,
        apply: () => void,
        revert: () => void,
    ): void {
        apply();
        if (ms === undefined) {
            task.finish('done');
            return;
        }
        const cancel = this.#options.clock.after(ms, () => {
            revert();
            task.finish('done');
        });
        task.undo = (): void => {
            cancel();
            revert();
        };
    }

    // Starts the steps at once: a request that cannot be carried out says so right away. One that
    // is cut short is simply not stepped any more, and `cleanup` undoes what it had started.
    #poll(task: Task, steps: Steps, cleanup?: () => void): void {
        const poll = (): Outcome | undefined => {
            const result = steps.next();
            return result.done ? result.value : undefined;
        };
        task.poll = poll;
        if (cleanup) {
            task.undo = cleanup;
        }
        const outcome = poll();
        if (outcome !== undefined) {
            task.finish(outcome);
        }
    }

    // Walks to what `target` says, which may move, and ends once he is there.
    *#walkTo(target: () => number | undefined, pace: Pace): Steps {
        let goal: { body: MonkeyBody; x: number } | undefined;
        for (;;) {
            const wanted = target();
            const body = this.#options.body();
            if (wanted === undefined) {
                body.halt();
                return 'failed';
            }
            const { width } = this.#options.world().bounds;
            const x = Math.max(
                WALL_MARGIN,
                Math.min(width - WALL_MARGIN, wanted),
            );
            // The body is another one when the page was measured again: it starts over.
            if (goal?.body !== body || retargets(goal.x, x)) {
                body.goTo(x, SPEEDS[pace]);
                goal = { body, x };
            }
            if (body.blocked) {
                body.halt();
                return 'failed';
            }
            if (body.destination === undefined) {
                return 'done';
            }
            yield;
        }
    }

    *#stand(): Steps {
        for (;;) {
            const body = this.#options.body();
            if (
                body.grounded &&
                Math.abs(body.angle) < UPRIGHT &&
                !this.#options.world().monkeyHeld
            ) {
                return 'done';
            }
            yield;
        }
    }

    // Calls `apply` with 0 to 1, eased, each frame for `time` ms, the last time with 1.
    *#tween(time: number, apply: (progress: number) => void): Generator<void> {
        let spent = 0;
        for (;;) {
            apply(smooth(Math.min(1, spent / time)));
            if (spent >= time) {
                return;
            }
            yield;
            // The frame that comes after the yield: the one before is spent already.
            spent += this.#elapsed;
        }
    }

    *#carry(id: number, pace: Pace = 'walk'): Steps {
        const world = (): PhysicsWorld => this.#options.world();
        if (this.#carried) {
            // His hands are full: with this piece, he has what he was asked for.
            return this.#carried.id === id ? 'done' : 'failed';
        }
        // Beside the piece, on the side he is on: he would push it from its middle.
        const wanted = (): number | undefined => {
            const piece = world().piece(id);
            if (!piece || piece.pinned || piece.taken || piece.held) {
                return undefined;
            }
            const side =
                this.#options.body().position.x < piece.position.x ? -1 : 1;
            return piece.position.x + (side * (piece.width + MONKEY_WIDTH)) / 2;
        };
        if ((yield* this.#walkTo(wanted, pace)) === 'failed') {
            return 'failed';
        }
        const piece = world().piece(id);
        if (!piece || !world().take(id)) {
            return 'failed';
        }
        const at = this.#options.body().position;
        const from = { x: piece.position.x - at.x, y: piece.position.y - at.y };
        const carried = { id, home: piece.home, offset: from };
        this.#carried = carried;
        yield* this.#tween(LIFT_TIME, (t) => {
            // The page measured again: the piece is not his, and he does not take it back.
            if (!this.#carried) {
                return;
            }
            this.#carried = {
                ...carried,
                offset: {
                    x: lerp(from.x, OVERHEAD.x, t),
                    y: lerp(from.y, OVERHEAD.y, t),
                },
            };
        });
        return this.#holds() ? 'done' : 'failed';
    }

    *#place(id: number, pace: Pace = 'walk'): Steps {
        const carried = this.#carried;
        if (carried?.id !== id) {
            return 'failed';
        }
        // The page measured again on the way: the piece is not his any more.
        const outcome = yield* this.#walkTo(
            () => (this.#carried === carried ? carried.home.x : undefined),
            pace,
        );
        if (outcome === 'failed') {
            return 'failed';
        }
        const { home, offset: from } = carried;
        yield* this.#tween(TOSS_TIME, (t) => {
            if (!this.#carried) {
                return;
            }
            const at = this.#options.body().position;
            this.#carried = {
                ...carried,
                offset: {
                    x: lerp(from.x, home.x - at.x, t),
                    y:
                        lerp(from.y, home.y - at.y, t) -
                        Math.sin(t * Math.PI) * TOSS_ARC,
                },
            };
        });
        if (!this.#carried) {
            return 'failed';
        }
        // His hands are free, and the request answered, before `item.restored` is heard: a
        // listener may ask for the next piece at once.
        this.#carried = undefined;
        this.#restoring = id;
        return 'done';
    }

    #holds(): boolean {
        return this.#carried !== undefined;
    }

    // The piece a finished `place` threw home is pinned there once the request has been answered.
    #restoreDue(): void {
        const id = this.#restoring;
        this.#restoring = undefined;
        if (id !== undefined) {
            this.#options.world().restore(id);
        }
    }

    #settle(): void {
        if (this.#carried) {
            this.#carried = { ...this.#carried, offset: { ...OVERHEAD } };
        }
    }

    #drop(): void {
        const carried = this.#carried;
        if (carried) {
            this.#options.world().letGo(carried.id);
            this.#carried = undefined;
        }
    }

    // The piece he carries goes where he goes, unless the world was built again: it is not his
    // any more then.
    #forget(): void {
        const carried = this.#carried;
        if (carried && !this.#options.world().piece(carried.id)?.taken) {
            this.#carried = undefined;
        }
    }

    // After `#forget`, which `step` runs first: what is left is his, and taken.
    #follow(): void {
        const carried = this.#carried;
        if (!carried) {
            return;
        }
        const at = this.#options.body().position;
        this.#options.world().carry(carried.id, {
            x: at.x + carried.offset.x,
            y: at.y + carried.offset.y,
        });
    }

    #show(): void {
        const body = this.#options.body();
        const held = this.#options.world().monkeyHeld;
        const overlayPose = this.#overlays.findLast(
            (overlay) => overlay.pose !== undefined,
        )?.pose;
        const overlayMood = this.#overlays.findLast(
            (overlay) => overlay.mood !== undefined,
        )?.mood;
        this.#options.look.show({
            pose:
                overlayPose ??
                (body.tumbling
                    ? 'tumble'
                    : this.#carried
                      ? 'carry'
                      : this.#pose),
            mood: overlayMood ?? this.#mood,
            facing: this.#facing,
            walking: !held && body.heading !== 0,
            held,
        });
    }
}
