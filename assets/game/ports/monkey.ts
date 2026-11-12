import type { CigaretteLoss, ExitSide } from '../events/game_events';

// How the monkey looks, written by the Motor onto the art (`look`) as data attributes. `carry`
// and `tumble` follow the body; a behaviour chooses the others. Walking is not a pose: it is
// the legs, whatever the upper body does.
export type Pose = 'stand' | 'smoke' | 'talk' | 'light' | 'carry' | 'tumble';
export type ChosenPose = Extract<Pose, 'stand' | 'smoke' | 'talk' | 'light'>;
export type Mood = 'calm' | 'scared' | 'cross' | 'proud' | 'burnt';
export type Facing = 'left' | 'right';
export type Pace = 'walk' | 'run' | 'chase';
// How the cigarette in his mouth looks: lit (nothing to say), none while it lies on the page, or
// not lit yet.
export type CigaretteLook = 'lit' | 'lost' | 'unlit';

// He cannot stand nearer a wall than this (half his width): a target nearer is clamped to it.
export const WALL_MARGIN = 20;

// What the monkey's body can be asked to do (docs/architecture.md, The monkey). A request with
// `ms` lasts that long and then gives the pose or mood back. On the overlay layer, `pose` and
// `mood` need `ms`: an overlay must end, or the reflex that asked would wait for ever.
export type MonkeyRequest =
    // To a point on the ground, which is `failed` when he is held up (blocked, or something in
    // the way he cannot climb).
    | { type: 'walk'; x: number; pace?: Pace }
    | { type: 'face'; direction: Facing }
    // Stops walking and stays still, upright on his feet; ends once he is.
    | { type: 'stand' }
    // Stops where he is, at once.
    | { type: 'stop' }
    | { type: 'pose'; pose: ChosenPose; ms?: number }
    | { type: 'mood'; mood: Mood; ms?: number }
    // Walks to a loose piece and lifts it overhead; `failed` if it is pinned, held or carried.
    | { type: 'carry'; piece: number; pace?: Pace }
    // Walks, carrying, to the piece's home and puts it back there. It answers `done`, his hands
    // free, before the piece is restored and `item.restored` is heard: it is still taken then.
    | { type: 'place'; piece: number; pace?: Pace }
    // Lets the carried piece fall.
    | { type: 'drop' }
    // Puts him back in the page after he left it by `from`: just under the top for the top, on the
    // floor just inside the edge for a side. Answers `done` at once; he falls or floats from there.
    | { type: 'enter'; from: ExitSide }
    // The cigarette falls from his mouth; `failed` if he has none lit. It also overlays: it is
    // instant, with nothing to end, so a reflex may ask it.
    | { type: 'lose'; cause: CigaretteLoss }
    // Jumps, at this speed in pixels per step, and ends once he is back on his feet; `failed` if
    // he is not on them to begin with. With a `reach`, it ends in the air as soon as the cigarette
    // the visitor holds is within that many pixels of the top of his head.
    | { type: 'jump'; vx: number; vy: number; reach?: number }
    // Takes the cigarette he dropped, which was where he stands: it is in his mouth, not lit.
    // `failed` if none lies.
    | { type: 'pickup' }
    // Gives up on the one he dropped: it is gone, a fresh one is in his mouth, not lit.
    | { type: 'discard' }
    // Lights the cigarette in his mouth (with the pose `light`, which draws it).
    | { type: 'relight' };

export type MonkeyRequestType = MonkeyRequest['type'];
