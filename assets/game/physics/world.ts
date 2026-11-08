import {
    Body,
    Composite,
    Constraint,
    Engine,
    Events,
    Vector,
    type Pair,
} from 'matter-js';
import type { ClockView } from '../clock/clock';
import type { EventBus } from '../events/event_bus';
import type {
    FreedBy,
    GameEvents,
    HitAgainst,
    PieceKind,
    Point,
} from '../events/game_events';
import {
    GROUND,
    bombBody,
    looseFilter,
    pieceBody,
    pinnedFilter,
    wallBodies,
    type Bounds,
    type PieceSpec,
} from './bodies';
import type { Traits } from './kinds';
import { capSpeed, kick } from './motion';
import {
    Stillness,
    blastRadius,
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
// Weak enough that everything floats for seconds before it reaches the ceiling.
const ZERO_GRAVITY = -0.04;
const CALM_STEPS = 30;

export type { Bounds, PieceSpec };

// Where a loose piece is now, as an offset and a turn from its home.
export interface Placement {
    id: number;
    dx: number;
    dy: number;
    angle: number;
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
}

interface Bomb {
    id: number;
    body: Body;
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
    #hits: Hit[] = [];
    #held: { piece: Piece; constraint: Constraint } | undefined;
    #vortex: { vortex: Vortex; cancelEnd: () => void } | undefined;
    #aim: number | undefined;
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
    }

    get holding(): boolean {
        return this.#held !== undefined;
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

    // Takes hold of a piece at a point of the page. Returns false if it can't be held.
    grab(id: number, at: Point): boolean {
        const piece = this.#pieces.get(id);
        if (!piece?.traits.grabbable || this.#held) {
            return false;
        }
        this.#free(piece, 'grab');
        const constraint = Constraint.create({
            pointA: { x: at.x, y: at.y },
            bodyB: piece.body,
            pointB: {
                x: at.x - piece.body.position.x,
                y: at.y - piece.body.position.y,
            },
            stiffness: 0.14,
            damping: 0.08,
            length: 0,
        });
        Composite.add(this.#engine.world, constraint);
        this.#held = { piece, constraint };
        this.#options.events.emit('item.grabbed', {
            id,
            kind: piece.kind,
            at: { x: at.x, y: at.y },
        });
        return true;
    }

    // The pointer moved: the held piece follows through a spring, so it lags and swings.
    drag(to: Point): void {
        if (this.#held) {
            this.#held.constraint.pointA = { x: to.x, y: to.y };
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
        this.#vortex?.cancelEnd();
        this.#endTornado();
        this.setZeroGravity(false);
    }

    #add(spec: PieceSpec): void {
        const { id, kind, traits, x, y } = spec;
        const body = pieceBody(spec);
        const piece = { id, kind, traits, body, home: { x, y }, pinned: true };
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
                continue;
            }
            if (piece.pinned && loosensPinned(other.speed)) {
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

    #against(other: Body): HitAgainst {
        if (this.#pieceOf.has(other)) {
            return 'piece';
        }
        if (this.#bombs.has(other)) {
            return 'bomb';
        }
        return other.collisionFilter.category === GROUND ? 'floor' : 'wall';
    }

    #advance(): void {
        for (const piece of this.#loosened) {
            this.#free(piece, 'impact');
        }
        this.#loosened.clear();
        this.#blow();
        Engine.update(this.#engine, STEP);
        this.#still.observe(this.#calm());
        const hits = this.#hits;
        this.#hits = [];
        for (const { piece, speed, against } of hits) {
            this.#options.events.emit('item.hit', {
                id: piece.id,
                kind: piece.kind,
                speed,
                against,
            });
        }
    }

    #calm(): boolean {
        return [...this.#pieces.values()].every(
            ({ pinned, body }) =>
                pinned || isCalm(body.speed, body.angularSpeed),
        );
    }

    // One step of the tornado's air on everything in its reach.
    #blow(): void {
        if (!this.#vortex) {
            return;
        }
        const { vortex } = this.#vortex;
        vortex.step(this.#aim);
        for (const piece of this.#pieces.values()) {
            if (vortex.reaches(piece.body)) {
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
            const reach = this.#reach(piece.body, at, radius);
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

        this.#still.disturb();
        this.#options.events.emit('bomb.exploded', {
            id: bomb.id,
            at,
            radius,
            freed,
        });
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
