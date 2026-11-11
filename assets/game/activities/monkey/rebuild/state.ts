import type { Context } from '../../../brain/behaviour';

// The ids of the behaviours that rebuild (a behaviour's id is its path).
export const REBUILD = 'monkey/rebuild';
export const LAZY = 'monkey/lazy_rebuild';
export const HURRY = 'monkey/hurry';

export const isLazy = ({ running }: Context): boolean =>
    running?.includes(LAZY) === true;

// There is a piece away from home that he can bring back: one lying about, or one in his hands.
export const hasWork = ({ loosePieces = [], carrying }: Context): boolean =>
    loosePieces.length > 0 || carrying !== undefined;

// A pressed Rebuild is not served while he hurries already: it would only queue behind it.
export const isHurrying = ({ running }: Context): boolean =>
    running?.includes(HURRY) === true;

// He is tidying up, hurried or not: whatever else happens, he does not lose his cigarette now.
export const isRebuilding = ({ running }: Context): boolean =>
    running?.some((id) => [REBUILD, LAZY, HURRY].includes(id)) === true;
