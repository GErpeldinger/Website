// How the monkey looks, written by the Motor onto the art (`look`) as data attributes. `carry`
// and `tumble` follow the body; a behaviour chooses the others. Walking is not a pose: it is
// the legs, whatever the upper body does.
export type Pose = 'stand' | 'smoke' | 'talk' | 'carry' | 'tumble';
export type ChosenPose = Extract<Pose, 'stand' | 'smoke' | 'talk'>;
export type Mood = 'calm' | 'scared' | 'cross' | 'proud' | 'burnt';
export type Facing = 'left' | 'right';
export type Pace = 'walk' | 'run';

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
    | { type: 'drop' };

export type MonkeyRequestType = MonkeyRequest['type'];
