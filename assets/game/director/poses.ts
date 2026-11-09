import type {
    ChosenPose,
    Facing,
    Mood,
    MonkeyRequest,
    Pace,
} from '../ports/monkey';

export interface PoseButton {
    label: string;
    // The request, for a page this wide (walks go near its edges).
    request: (pageWidth: number) => MonkeyRequest;
}

export interface PoseGroup {
    name: string;
    buttons: PoseButton[];
}

// How long a pose or a mood lasts before he gives it back.
const HOLD_MS = 3000;
// How far from the page's edge a walk ends.
export const EDGE = 80;

// Typed against the monkey's own lists: a pose, a mood or a pace added later cannot be left
// without a button.
const poses: Record<ChosenPose, string> = {
    stand: 'Stand',
    smoke: 'Smoke',
    talk: 'Talk',
};
const moods: Record<Mood, string> = {
    calm: 'Calm',
    scared: 'Scared',
    cross: 'Cross',
    proud: 'Proud',
};
const paces: Record<Pace, string> = { walk: 'Walk', run: 'Run' };
const sides: Record<Facing, (pageWidth: number) => number> = {
    left: () => EDGE,
    right: (pageWidth) => pageWidth - EDGE,
};

const keys = <Key extends string>(record: Record<Key, unknown>): Key[] =>
    Object.keys(record) as Key[];

export const poseGroups: readonly PoseGroup[] = [
    {
        name: 'Poses',
        buttons: keys(poses).map((pose) => ({
            label: poses[pose],
            request: () => ({ type: 'pose', pose, ms: HOLD_MS }),
        })),
    },
    {
        name: 'Moods',
        buttons: keys(moods).map((mood) => ({
            label: moods[mood],
            request: () => ({ type: 'mood', mood, ms: HOLD_MS }),
        })),
    },
    {
        name: 'Walks',
        buttons: keys(paces).flatMap((pace) =>
            keys(sides).map((side) => ({
                label: `${paces[pace]} ${side}`,
                request: (pageWidth: number): MonkeyRequest => ({
                    type: 'walk',
                    x: sides[side](pageWidth),
                    pace,
                }),
            })),
        ),
    },
];
