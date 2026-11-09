import { Bodies, Body, type ICollisionFilter } from 'matter-js';
import type { PieceKind, Point } from '../events/game_events';
import { densityOf, type Traits } from './kinds';

export interface Bounds {
    // The page's width, in CSS pixels.
    width: number;
    // Where the ground starts, from the top of the page.
    floor: number;
}

// One element of the page, measured: its centre and size in page coordinates.
export interface PieceSpec {
    id: number;
    kind: PieceKind;
    traits: Traits;
    x: number;
    y: number;
    width: number;
    height: number;
}

// What collides with what. A pinned piece only reacts to what hits it: the monkey standing on
// the text is no impact (the world says how hard a fall must be). A piece the monkey carries
// collides with nothing.
export const GROUND = 1;
export const SIDE = 2;
const PINNED = 4;
const LOOSE = 8;
const MONKEY = 16;
const BOMB = 32;
const TAKEN = 64;

export const pinnedFilter = (): ICollisionFilter => ({
    category: PINNED,
    mask: LOOSE | MONKEY | BOMB,
    group: 0,
});
export const looseFilter = (): ICollisionFilter => ({
    category: LOOSE,
    mask: GROUND | SIDE | PINNED | LOOSE | MONKEY | BOMB,
    group: 0,
});
export const takenFilter = (): ICollisionFilter => ({
    category: TAKEN,
    mask: 0,
    group: 0,
});
export const monkeyFilter = (): ICollisionFilter => ({
    category: MONKEY,
    mask: GROUND | SIDE | PINNED | LOOSE | BOMB,
    group: 0,
});
// Walking to a piece or to its home: the loose pieces are no obstacle. Matter needs both masks
// to agree, so his alone is enough.
export const monkeyPassingFilter = (): ICollisionFilter => ({
    category: MONKEY,
    mask: GROUND | SIDE | PINNED | BOMB,
    group: 0,
});
const bombFilter = (): ICollisionFilter => ({
    category: BOMB,
    mask: GROUND | SIDE | PINNED | LOOSE | MONKEY | BOMB,
    group: 0,
});
const wallFilter = (category: number): ICollisionFilter => ({
    category,
    mask: 0xffff,
    group: 0,
});

// Thick enough that nothing slips through at the speed limit.
const WALL = 240;

// A piece starts static, pinned in place: freeing it makes it a dynamic body again.
export const pieceBody = ({ x, y, width, height, traits }: PieceSpec): Body => {
    const body = Bodies.rectangle(x, y, width, height, {
        restitution: 0.22,
        friction: 0.65,
        density: densityOf(traits.weight),
        chamfer: { radius: Math.min(4, height / 4) },
    });
    Body.setStatic(body, true);
    body.collisionFilter = pinnedFilter();
    return body;
};

// The prototype's monkey: a chamfered rectangle that stands on the floor, at `x`.
export const MONKEY_WIDTH = 40;
export const MONKEY_HEIGHT = 70;
export const monkeyBody = (x: number, floor: number): Body =>
    Bodies.rectangle(
        x,
        floor - MONKEY_HEIGHT / 2,
        MONKEY_WIDTH,
        MONKEY_HEIGHT,
        {
            friction: 0.8,
            restitution: 0.15,
            density: 0.002,
            chamfer: { radius: 14 },
            collisionFilter: monkeyFilter(),
        },
    );

// A bomb never starts under the ground.
export const bombBody = (at: Point, floor: number): Body =>
    Bodies.circle(at.x, Math.min(at.y, floor - 20), 15, {
        restitution: 0.45,
        friction: 0.5,
        density: 0.004,
        collisionFilter: bombFilter(),
    });

// The floor, the two sides and the ceiling at the top of the page. A piece thrown up stops
// there; in zero gravity everything floats up to it, in view.
export const wallBodies = ({ width, floor }: Bounds): Body[] => {
    const side = { isStatic: true, collisionFilter: wallFilter(SIDE) };
    const reach = floor + 2 * WALL;
    return [
        Bodies.rectangle(width / 2, floor + WALL / 2, width + 2 * WALL, WALL, {
            isStatic: true,
            collisionFilter: wallFilter(GROUND),
        }),
        Bodies.rectangle(-WALL / 2, floor / 2, WALL, reach, side),
        Bodies.rectangle(width + WALL / 2, floor / 2, WALL, reach, side),
        Bodies.rectangle(width / 2, -WALL / 2, width + 2 * WALL, WALL, side),
    ];
};
