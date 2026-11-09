import {
    Body,
    Composite,
    Constraint,
    Engine,
    Events,
    Query,
    Vector,
    type Pair,
} from 'matter-js';
import type { ClockView } from '../clock/clock';
import type { EventBus } from '../events/event_bus';
import type {
    ExitSide,
    FreedBy,
    GameEvents,
    HitAgainst,
    PieceKind,
    Point,
} from '../events/game_events';
import {
    GROUND,
    MONKEY_WIDTH,
    bombBody,
    looseFilter,
    pieceBody,
    pinnedFilter,
    takenFilter,
    wallBodies,
    type Bounds,
    type PieceSpec,
} from './bodies';
import type { Traits } from './kinds';
import { MonkeyBody } from './monkey_body';
import { capSpeed, kick } from './motion';
import {
    LEFT_AFTER,
    Stillness,
    blastRadius,
    exitSide,
    holdsUp,
    hurtsMonkey,
    isCalm,
    isHardHit,
    isThrow,
    loosensPinned,
} from './rules';
import { Vortex } from './vortex';

// The engine runs at a fixed 60 Hz, whatever the display's rate.
export const STEP = 1000 / 60;
// A long frame (a busy tab) owes at most this much time, about 3 steps: the rest is forgotten,
// not replayed.
const MAX_BACKLOG = 50;

const MAX_BOMBS = 5;
const FUSE = 1500;
const TORNADO_DURATION = 5200;
const MAX_THROW = 32;
const MAX_MONKEY_THROW = 26;
// Weak enough that everything floats for seconds before it reaches the ceiling.
const ZERO_GRAVITY = -0.04;
const CALM_STEPS = 30;

export type { Bounds, PieceSpec };

// What the hand names the monkey by: the pieces are numbered from 0.
export const MONKEY = -1;

// Where a loose piece is now, as an offset and a turn from its home.
export interface Placement {
    id: number;
    dx: number;
    dy: number;
    angle: number;
}

// A bomb waiting to blow, as the effects layer draws it. `fuse` is how far it has burnt, 0 to 1.
export interface BombView {
    id: number;
    x: number;
    y: number;
    angle: number;
    fuse: number;
}

// The tornado's axis and sway, as the effects layer draws it.
export interface TornadoView {
    x: number;
    phase: number;
}

export interface WorldOptions {
    events: EventBus<GameEvents>;
    // The fuses and the tornado run on game time.
    clock: ClockView;
    random: () => number;
    // Off: no tornado.
    reducedMotion: boolean;
}

interface Piece {
    id: number;
    kind: PieceKind;
    traits: Traits;
    body: Body;
    home: Point;
    pinned: boolean;
    // Lifted by the monkey: out of the simulation, he places it.
    taken: boolean;
}

// Where a piece is, for the monkey to walk to it and put it back.
export interface PieceInfo {
    position: Point;
    home: Point;
    // How wide it is now, turned as it is.
    width: number;

    pinned: boolean;
    taken: boolean;
    held: boolean;
}

// What holds the hand's spring: a piece, or the monkey.
interface Held {
    piece: Piece | undefined;
    constraint: Constraint;
}

interface Bomb {
    id: number;
    body: Body;
    placedAt: number;
    cancelFuse: () => void;
}

// How a blast pushes one body: the unit direction away from it, and 0 to 1 by nearness.
interface Blast {
    nx: number;
    ny: number;
    strength: number;
    distance: number;
}

interface Hit {
    piece: Piece;
    speed: number;
    against: HitAgainst;
}

interface MonkeyHit {
    speed: number;
    against: HitAgainst;
}

// The physics of the page: pieces pinned in place until something frees them, a floor, two
// walls and a ceiling, the visitor's hand, bombs, a tornado and zero gravity. Matter.js lives
// here and nowhere else.
export class PhysicsWorld {
    readonly #bounds: Bounds;
    readonly #options: WorldOptions;
    readonly #engine = Engine.create();
    readonly #pieces = new Map<number, Piece>();
    readonly #pieceOf = new WeakMap<Body, Piece>();
    readonly #bombs = new Map<Body, Bomb>();
    readonly #still = new Stillness(CALM_STEPS);
    // Struck hard enough to come loose: freed at the start of the next step, never mid-collision.
    readonly #loosened = new Set<Piece>();
    // Something held the monkey up during the step, seen by the contacts the engine reports.
    #supported = false;
    #hits: Hit[] = [];
    #monkeyHits: MonkeyHit[] = [];
    #monkey: MonkeyBody | undefined;
    #held: Held | undefined;
    #vortex: { vortex: Vortex; cancelEnd: () => void } | undefined;
    #aim: number | undefined;
    // Cancels the wait that ends in `monkey.left`, while he is out of the page and not held.
    #leaving: (() => void) | undefined;
    #zero = false;
    #bombCount = 0;
    #backlog = 0;

    constructor(bounds: Bounds, specs: PieceSpec[], options: WorldOptions) {
        this.#bounds = bounds;
        this.#options = options;
        this.#engine.gravity.y = 1;

        for (const spec of specs) {
            this.#add(spec);
        }
        Composite.add(this.#engine.world, wallBodies(bounds));
        Events.on(this.#engine, 'collisionStart', (event) => {
            for (const pair of event.pairs) {
                this.#collide(pair);
            }
        });
        // A new contact only shows from its second step (its first goes to collisionStart), so
        // standing on a piece is noticed one step late: harmless.
        Events.on(this.#engine, 'collisionActive', (event) => {
            for (const pair of event.pairs) {
                this.#supported ||= this.#holdsUp(pair);
            }
        });
    }

    get holding(): boolean {
        return this.#held !== undefined;
    }

    get bounds(): Bounds {
        return this.#bounds;
    }

    // The visitor has the monkey in hand.
    get monkeyHeld(): boolean {
        return this.#held !== undefined && !this.#held.piece;
    }

    // The monkey's body, once he is added.
    get monkey(): MonkeyBody | undefined {
        return this.#monkey;
    }

    // Nothing moves and nothing is pending: the loop can stop until the next input.
    get resting(): boolean {
        return (
            this.#still.holds &&
            this.#held === undefined &&
            this.#bombs.size === 0 &&
            this.#vortex === undefined
        );
    }

    step(elapsed: number): void {
        this.#backlog = Math.min(this.#backlog + elapsed, MAX_BACKLOG);
        while (this.#backlog >= STEP) {
            this.#backlog -= STEP;
            this.#advance();
        }
    }

    // Every loose piece's offset from home. A pinned one is not listed: its element is untouched.
    placements(): Placement[] {
        return [...this.#pieces.values()]
            .filter((piece) => !piece.pinned)
            .map(({ id, body, home }) => ({
                id,
                dx: body.position.x - home.x,
                dy: body.position.y - home.y,
                angle: body.angle,
            }));
    }

    // Every bomb whose fuse is burning.
    bombs(): BombView[] {
        const now = this.#options.clock.now();
        return [...this.#bombs.values()].map(({ id, body, placedAt }) => ({
            id,
            x: body.position.x,
            y: body.position.y,
            angle: body.angle,
            fuse: Math.min(1, (now - placedAt) / FUSE),
        }));
    }

    // The running tornado, if any.
    tornado(): TornadoView | undefined {
        const running = this.#vortex?.vortex;
        return running && { x: running.x, phase: running.phase };
    }

    // Takes hold of a piece at a point of the page, or of the monkey (`MONKEY`). Returns false if
    // it can't be held.
    grab(id: number, at: Point): boolean {
        if (id === MONKEY) {
            return this.#grabMonkey(at);
        }
        const piece = this.#pieces.get(id);
        if (!piece?.traits.grabbable || piece.taken || this.#held) {
            return false;
        }
        this.#free(piece, 'grab');
        this.#held = { piece, constraint: this.#spring(piece.body, at) };
        this.#options.events.emit('item.grabbed', {
            id,
            kind: piece.kind,
            at: { x: at.x, y: at.y },
        });
        return true;
    }

    // The pointer moved: the held piece follows through a spring, so it lags and swings. The
    // pointer can leave the page; a spring aimed past a wall would pull the body through it.
    drag(to: Point): void {
        if (this.#held) {
            const { width, floor } = this.#bounds;
            this.#held.constraint.pointA = {
                x: Math.max(0, Math.min(width, to.x)),
                y: Math.max(0, Math.min(floor, to.y)),
            };
        }
    }

    // Lets go with the pointer's velocity, in pixels per step.
    release(velocity: Point): void {
        const held = this.#held;
        if (!held) {
            return;
        }
        this.#held = undefined;
        Composite.remove(this.#engine.world, held.constraint);
        if (!held.piece) {
            this.#throwMonkey(velocity);
            return;
        }
        const thrown = capSpeed(velocity, MAX_THROW);
        Body.setVelocity(held.piece.body, thrown);
        this.#still.disturb();
        const { id, kind } = held.piece;
        const speed = Math.hypot(thrown.x, thrown.y);
        if (isThrow(speed)) {
            this.#options.events.emit('item.thrown', { id, kind, speed });
        } else {
            this.#options.events.emit('item.dropped', { id, kind });
        }
    }

    // The monkey stands on the floor at `x`, or at the nearest spot his body fits between the walls.
    addMonkey(x: number): MonkeyBody {
        const reach = MONKEY_WIDTH / 2;
        const monkey = new MonkeyBody(
            Math.max(reach, Math.min(this.#bounds.width - reach, x)),
            this.#bounds.floor,
        );
        this.#monkey = monkey;
        Composite.add(this.#engine.world, monkey.body);
        return monkey;
    }

    // Where a piece is, or undefined for an id that is none.
    piece(id: number): PieceInfo | undefined {
        const piece = this.#pieces.get(id);
        return (
            piece && {
                position: {
                    x: piece.body.position.x,
                    y: piece.body.position.y,
                },
                home: { ...piece.home },
                width: piece.body.bounds.max.x - piece.body.bounds.min.x,
                pinned: piece.pinned,
                taken: piece.taken,
                held: this.#held?.piece === piece,
            }
        );
    }

    // The loose pieces he could carry home now, with where each lies: not held by the visitor,
    // not already in his hands.
    loose(): { id: number; x: number }[] {
        return [...this.#pieces.values()]
            .filter(
                (piece) =>
                    !piece.pinned &&
                    !piece.taken &&
                    this.#held?.piece !== piece,
            )
            .map((piece) => ({ id: piece.id, x: piece.body.position.x }));
    }

    // Every piece is back at home and pinned: none loose, held or carried.
    allHome(): boolean {
        return [...this.#pieces.values()].every((piece) => piece.pinned);
    }

    // The monkey lifts a loose piece: it collides with nothing and goes where `carry` puts it.
    // False if it is pinned, held by the visitor or already taken.
    take(id: number): boolean {
        const piece = this.#pieces.get(id);
        if (
            !piece ||
            piece.pinned ||
            piece.taken ||
            this.#held?.piece === piece
        ) {
            return false;
        }
        piece.taken = true;
        Body.setStatic(piece.body, true);
        piece.body.collisionFilter = takenFilter();
        return true;
    }

    // Moves a taken piece, for the monkey to carry it.
    carry(id: number, at: Point): void {
        const piece = this.#pieces.get(id);
        if (piece?.taken) {
            Body.setPosition(piece.body, at);
        }
    }

    // The monkey lets a taken piece fall.
    letGo(id: number): void {
        const piece = this.#pieces.get(id);
        if (!piece?.taken) {
            return;
        }
        piece.taken = false;
        Body.setStatic(piece.body, false);
        piece.body.collisionFilter = looseFilter();
        this.#still.disturb();
    }

    // Back to its home, pinned again, for the Rebuild.
    restore(id: number): void {
        const piece = this.#pieces.get(id);
        if (!piece || piece.pinned) {
            return;
        }
        if (this.#held?.piece === piece) {
            this.release({ x: 0, y: 0 });
        }
        Body.setPosition(piece.body, piece.home);
        Body.setAngle(piece.body, 0);
        // Pinning stops the body, speed and spin included.
        Body.setStatic(piece.body, true);
        piece.body.collisionFilter = pinnedFilter();
        piece.pinned = true;
        piece.taken = false;
        this.#options.events.emit('item.restored', {
            id,
            kind: piece.kind,
        });
    }

    setZeroGravity(on: boolean): void {
        if (on === this.#zero) {
            return;
        }
        this.#zero = on;
        this.#engine.gravity.y = on ? ZERO_GRAVITY : 1;
        this.#still.disturb();
        this.#options.events.emit('gravity.changed', { zero: on });
        if (!on) {
            return;
        }
        const { random } = this.#options;
        for (const piece of this.#pieces.values()) {
            // What the monkey holds is out of the simulation: nothing moves it but him.
            if (piece.taken) {
                continue;
            }
            this.#free(piece, 'gravity');
            Body.setVelocity(piece.body, {
                x: (random() - 0.5) * 3,
                y: -1 - random() * 2,
            });
            Body.setAngularVelocity(piece.body, (random() - 0.5) * 0.05);
        }
    }

    // Returns the bomb's id, or undefined when 5 are already waiting. A bomb never starts
    // under the ground.
    placeBomb(at: Point): number | undefined {
        if (this.#bombs.size >= MAX_BOMBS) {
            return undefined;
        }
        const body = bombBody(at, this.#bounds.floor);
        Composite.add(this.#engine.world, body);
        const bomb: Bomb = {
            id: ++this.#bombCount,
            body,
            placedAt: this.#options.clock.now(),
            cancelFuse: () => undefined,
        };
        bomb.cancelFuse = this.#options.clock.after(FUSE, () => {
            this.#explode(bomb);
        });
        this.#bombs.set(body, bomb);
        this.#options.events.emit('bomb.placed', {
            id: bomb.id,
            at: { x: body.position.x, y: body.position.y },
        });
        return bomb.id;
    }

    // False under reduced motion, or while one already runs.
    startTornado(x: number): boolean {
        if (this.#options.reducedMotion || this.#vortex) {
            return false;
        }
        const cancelEnd = this.#options.clock.after(TORNADO_DURATION, () => {
            this.#endTornado();
        });
        this.#vortex = {
            vortex: new Vortex(x, this.#bounds.width),
            cancelEnd,
        };
        this.#options.events.emit('tornado.started', { x });
        return true;
    }

    // The tornado drifts towards the visitor's pointer.
    aim(x: number): void {
        this.#aim = x;
    }

    // The page is measured again: everything pending ends, as if the tornado and the gravity
    // had been switched off.
    dispose(): void {
        this.release({ x: 0, y: 0 });
        for (const bomb of this.#bombs.values()) {
            bomb.cancelFuse();
            this.#options.events.emit('bomb.cancelled', { id: bomb.id });
        }
        this.#bombs.clear();
        this.#leaving?.();
        this.#leaving = undefined;
        this.#vortex?.cancelEnd();
        this.#endTornado();
        this.setZeroGravity(false);
    }

    #add(spec: PieceSpec): void {
        const { id, kind, traits, x, y } = spec;
        const body = pieceBody(spec);
        const piece = {
            id,
            kind,
            traits,
            body,
            home: { x, y },
            pinned: true,
            taken: false,
        };
        this.#pieces.set(id, piece);
        this.#pieceOf.set(body, piece);
        Composite.add(this.#engine.world, body);
    }

    #free(piece: Piece, by: FreedBy): void {
        if (!piece.pinned) {
            return;
        }
        piece.pinned = false;
        Body.setStatic(piece.body, false);
        piece.body.collisionFilter = looseFilter();
        this.#options.events.emit('item.freed', {
            id: piece.id,
            kind: piece.kind,
            by,
        });
    }

    #collide({ bodyA, bodyB }: Pair): void {
        const speed = Vector.magnitude(
            Vector.sub(bodyA.velocity, bodyB.velocity),
        );
        for (const [self, other] of [
            [bodyA, bodyB],
            [bodyB, bodyA],
        ] as const) {
            const piece = this.#pieceOf.get(self);
            if (!piece) {
                this.#collideMonkey(self, other, speed);
                continue;
            }
            if (
                piece.pinned &&
                loosensPinned(other.speed, other === this.#monkey?.body)
            ) {
                this.#loosened.add(piece);
            }
            if (isHardHit(speed)) {
                this.#hits.push({
                    piece,
                    speed,
                    against: this.#against(other),
                });
            }
        }
    }

    #collideMonkey(self: Body, other: Body, speed: number): void {
        if (self !== this.#monkey?.body) {
            return;
        }
        const against = this.#against(other);
        const solid =
            against === 'floor' || this.#pieceOf.get(other)?.pinned === true;
        if (hurtsMonkey(speed, solid)) {
            this.#monkeyHits.push({ speed, against });
        }
    }

    #against(other: Body): HitAgainst {
        if (this.#pieceOf.has(other)) {
            return 'piece';
        }
        if (this.#bombs.has(other)) {
            return 'bomb';
        }
        if (other === this.#monkey?.body) {
            return 'monkey';
        }
        return other.collisionFilter.category === GROUND ? 'floor' : 'wall';
    }

    #advance(): void {
        for (const piece of this.#loosened) {
            this.#free(piece, 'impact');
        }
        this.#loosened.clear();
        this.#blow();
        const held = this.monkeyHeld;
        this.#monkey?.closeIn(this.#zero, this.#monkeyFits());
        this.#monkey?.rejoin(() => this.#overlapsLoose());
        this.#monkey?.beforeStep(held);
        Engine.update(this.#engine, STEP);
        this.#monkey?.support(this.#supported);
        this.#supported = false;
        const landing = this.#monkey?.afterStep(held);
        this.#still.observe(this.#calm());
        const { events } = this.#options;
        const hits = this.#hits;
        this.#hits = [];
        for (const { piece, speed, against } of hits) {
            events.emit('item.hit', {
                id: piece.id,
                kind: piece.kind,
                speed,
                against,
            });
        }
        const monkeyHits = this.#monkeyHits;
        this.#monkeyHits = [];
        for (const hit of monkeyHits) {
            events.emit('monkey.hit', hit);
        }
        if (landing) {
            events.emit('monkey.landed', landing);
        }
        this.#watchExit();
    }

    // Starts the wait for `monkey.left` when he is out of the page and free, and drops it when he
    // is back in or taken, and again each time it ends with him still out. The clock runs it, so
    // the sleeping loop wakes for it.
    #watchExit(): void {
        if (this.#outside() !== undefined && !this.monkeyHeld) {
            this.#leaving ??= this.#options.clock.after(LEFT_AFTER, () => {
                this.#leaving = undefined;
                // The next step starts the wait again if he is still out: whoever heard it may
                // have been busy.
                this.#sayLeft();
            });
        } else {
            this.#leaving?.();
            this.#leaving = undefined;
        }
    }

    // His whole body is inside the page: the walls can close on him without pushing him anywhere.
    #monkeyFits(): boolean {
        const monkey = this.#monkey;
        return (
            monkey !== undefined &&
            monkey.body.bounds.min.x >= 0 &&
            monkey.body.bounds.max.x <= this.#bounds.width &&
            monkey.body.bounds.min.y >= 0
        );
    }

    #outside(): ExitSide | undefined {
        const monkey = this.#monkey;
        return monkey && exitSide(monkey.position, this.#bounds.width);
    }

    #sayLeft(): void {
        const side = this.#outside();
        if (side !== undefined && !this.monkeyHeld) {
            this.#options.events.emit('monkey.left', { side });
        }
    }

    // A pair's bodyA is the one with the lower id: he is second against pieces and walls, first
    // against a bomb, which is made after him and which he can stand on.
    #holdsUp({ bodyA, bodyB, collision }: Pair): boolean {
        const monkey = this.#monkey?.body;
        if (!monkey || (bodyA !== monkey && bodyB !== monkey)) {
            return false;
        }
        const other = bodyA === monkey ? bodyB : bodyA;
        return holdsUp(collision.normal.y, other.position.y, monkey.position.y);
    }

    #overlapsLoose(): boolean {
        const monkey = this.#monkey?.body;
        const loose = [...this.#pieces.values()]
            .filter((piece) => !piece.pinned && !piece.taken)
            .map((piece) => piece.body);
        return monkey !== undefined && Query.collides(monkey, loose).length > 0;
    }

    #calm(): boolean {
        const monkey = this.#monkey;
        return (
            (!monkey || isCalm(monkey.speed, monkey.angularSpeed)) &&
            [...this.#pieces.values()].every(
                ({ pinned, body }) =>
                    pinned || isCalm(body.speed, body.angularSpeed),
            )
        );
    }

    #spring(body: Body, at: Point): Constraint {
        const constraint = Constraint.create({
            pointA: { x: at.x, y: at.y },
            bodyB: body,
            pointB: {
                x: at.x - body.position.x,
                y: at.y - body.position.y,
            },
            stiffness: 0.14,
            damping: 0.08,
            length: 0,
        });
        Composite.add(this.#engine.world, constraint);
        return constraint;
    }

    #grabMonkey(at: Point): boolean {
        const monkey = this.#monkey;
        if (!monkey || this.#held) {
            return false;
        }
        this.#held = {
            piece: undefined,
            constraint: this.#spring(monkey.body, at),
        };
        this.#options.events.emit('monkey.grabbed', {
            at: { x: at.x, y: at.y },
        });
        return true;
    }

    // Let go of the monkey: he flies at the pointer's speed, up to a cap, and the Motor hears
    // whether he was thrown or only put down.
    #throwMonkey(velocity: Point): void {
        const monkey = this.#monkey;
        if (!monkey) {
            return;
        }
        const thrown = capSpeed(velocity, MAX_MONKEY_THROW);
        Body.setVelocity(monkey.body, thrown);
        this.#still.disturb();
        const speed = Math.hypot(thrown.x, thrown.y);
        if (isThrow(speed)) {
            this.#options.events.emit('monkey.thrown', { speed });
        } else {
            this.#options.events.emit('monkey.dropped', undefined);
        }
    }

    // One step of the tornado's air on everything in its reach.
    #blow(): void {
        if (!this.#vortex) {
            return;
        }
        const { vortex } = this.#vortex;
        vortex.step(this.#aim);
        for (const piece of this.#pieces.values()) {
            if (!piece.taken && vortex.reaches(piece.body)) {
                this.#free(piece, 'tornado');
                vortex.pull(piece.body);
            }
        }
        for (const body of this.#bombs.keys()) {
            if (vortex.reaches(body)) {
                vortex.pull(body);
            }
        }
    }

    #endTornado(): void {
        if (!this.#vortex) {
            return;
        }
        this.#vortex = undefined;
        this.#aim = undefined;
        this.#options.events.emit('tornado.ended', undefined);
    }

    #explode(bomb: Bomb): void {
        const { body } = bomb;
        this.#bombs.delete(body);
        Composite.remove(this.#engine.world, body);
        const at = { x: body.position.x, y: body.position.y };
        const radius = blastRadius(this.#bounds.width);
        const { random } = this.#options;
        const freed: number[] = [];

        for (const piece of this.#pieces.values()) {
            const reach = piece.taken
                ? undefined
                : this.#reach(piece.body, at, radius);
            if (!reach) {
                continue;
            }
            if (piece.pinned) {
                freed.push(piece.id);
            }
            this.#free(piece, 'bomb');
            kick(piece.body, reach.nx, reach.ny, reach.strength, random);
        }
        for (const other of this.#bombs.keys()) {
            const reach = this.#reach(other, at, radius);
            // A bomb on the blast itself has no direction to be thrown in.
            if (reach && reach.distance > 1) {
                kick(other, reach.nx, reach.ny, reach.strength / 2, random);
            }
        }

        const monkey = this.#monkey?.body;
        // The blast reaches him a little further than a piece, and never pushes him gently.
        const reached = monkey && this.#reach(monkey, at, radius * 1.15);
        if (monkey && reached) {
            kick(
                monkey,
                reached.nx,
                reached.ny,
                Math.max(0.45, 1 - reached.distance / radius),
                random,
            );
        }

        this.#still.disturb();
        this.#options.events.emit('bomb.exploded', {
            id: bomb.id,
            at,
            radius,
            freed,
        });
        if (monkey && reached) {
            this.#options.events.emit('monkey.blasted', { bomb: bomb.id });
        }
    }

    // The push a blast gives a body, or undefined when it is out of reach. A body right on the
    // blast's centre has no direction: it is pushed along x.
    #reach(body: Body, at: Point, radius: number): Blast | undefined {
        const dx = body.position.x - at.x;
        const dy = body.position.y - at.y;
        const distance = Math.hypot(dx, dy);
        if (distance > radius) {
            return undefined;
        }
        const d = distance || 1;
        return {
            nx: dx / d,
            ny: dy / d,
            strength: 1 - distance / radius,
            distance,
        };
    }
}
