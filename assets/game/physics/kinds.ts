import type { PieceKind } from '../events/game_events';

// The `data-physics` kinds and their defaults: docs/architecture.md, "The physics hooks".
export type Weight = 'light' | 'medium' | 'heavy';

export interface Traits {
    grabbable: boolean;
    hangable: boolean;
    breakable: boolean;
    weight: Weight;
}

// The raw `data-grabbable`, `data-hangable`, `data-breakable` and `data-weight` values.
export interface Overrides {
    grabbable?: string | null;
    hangable?: string | null;
    breakable?: string | null;
    weight?: string | null;
}

const defaults: Record<PieceKind, Traits> = {
    letter: {
        grabbable: true,
        hangable: false,
        breakable: false,
        weight: 'light',
    },
    block: {
        grabbable: true,
        hangable: false,
        breakable: false,
        weight: 'heavy',
    },
    link: {
        grabbable: true,
        hangable: true,
        breakable: false,
        weight: 'medium',
    },
};

// Medium is the prototype's only density; the other two are the same ratio either side.
const densities: Record<Weight, number> = {
    light: 0.0009,
    medium: 0.0014,
    heavy: 0.0025,
};

// A letter's line box is taller than its glyph: the body is trimmed to the glyph.
const heightScales: Record<PieceKind, number> = {
    letter: 0.74,
    block: 1,
    link: 1,
};

export const kindOf = (
    value: string | null | undefined,
): PieceKind | undefined =>
    Object.keys(defaults).find((kind): kind is PieceKind => kind === value);

const flag = (value: string | null | undefined, fallback: boolean): boolean =>
    value === 'true' ? true : value === 'false' ? false : fallback;

const weightOf = (value: string | null | undefined, fallback: Weight): Weight =>
    Object.keys(densities).find(
        (weight): weight is Weight => weight === value,
    ) ?? fallback;

// An invalid value keeps the default: a test on the rendered page rejects it before it ships.
export const traitsOf = (kind: PieceKind, overrides: Overrides): Traits => {
    const base = defaults[kind];
    return {
        grabbable: flag(overrides.grabbable, base.grabbable),
        hangable: flag(overrides.hangable, base.hangable),
        breakable: flag(overrides.breakable, base.breakable),
        weight: weightOf(overrides.weight, base.weight),
    };
};

export const densityOf = (weight: Weight): number => densities[weight];

export const heightScaleOf = (kind: PieceKind): number => heightScales[kind];
