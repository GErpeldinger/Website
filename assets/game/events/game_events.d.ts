// Every event the physics layer puts on the bus, with its payload. Positions are in page
// coordinates (CSS pixels from the top left of the document), whatever the scroll or the screen.
export interface Point {
    x: number;
    y: number;
}

// A rectangle of the page, in the same coordinates.
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

// The tools of the dock: the one the visitor's presses use.
export type Tool = 'grab' | 'bomb' | 'tornado';

export type PieceKind = 'letter' | 'block' | 'link';

export type FreedBy = 'impact' | 'grab' | 'bomb' | 'tornado' | 'gravity';

export type HitAgainst = 'piece' | 'bomb' | 'floor' | 'wall' | 'monkey';

// Where the monkey left the page: over its top, or past one of its sides.
export type ExitSide = 'top' | 'left' | 'right';

export type BehaviourKind = 'reflex' | 'activity' | 'ambient' | 'line';

// How a behaviour ended: it finished, a stronger one took its place, it threw, or the Brain stopped.
export type EndedBy = 'done' | 'interrupted' | 'failed' | 'stopped';

export interface GameEvents {
    // A pinned piece came loose.
    'item.freed': { id: number; kind: PieceKind; by: FreedBy };
    'item.grabbed': { id: number; kind: PieceKind; at: Point };
    // Let go slowly: put down rather than thrown.
    'item.dropped': { id: number; kind: PieceKind };
    // Let go fast; `speed` is the release speed in pixels per 60 Hz step.
    'item.thrown': { id: number; kind: PieceKind; speed: number };
    // A hard collision; `speed` is the relative speed of the two bodies, in pixels per step.
    'item.hit': {
        id: number;
        kind: PieceKind;
        speed: number;
        against: HitAgainst;
    };
    // Moved back to its home and pinned again.
    'item.restored': { id: number; kind: PieceKind };
    // The visitor took the monkey; `at` is where, on the page.
    'monkey.grabbed': { at: Point };
    // Let go slowly: put down rather than thrown.
    'monkey.dropped': undefined;
    // Let go fast; `speed` is the release speed in pixels per step.
    'monkey.thrown': { speed: number };
    // Back on his feet after a fall; `speed` is how fast he came down, in pixels per step.
    'monkey.landed': { speed: number };
    // A hard collision: a loose piece or a bomb at 7 px per step or more, a fall on the floor at 10.
    // The walls are no obstacle to him, so `against` is never 'wall'.
    'monkey.hit': { speed: number; against: HitAgainst };
    // He has been out of the page (his whole body past an edge) for 1.5 s, not held by the
    // visitor. Said again every 1.5 s while he is still out: who heard it may have been busy.
    'monkey.left': { side: ExitSide };
    // A bomb's blast reached him, a bit further than it reaches a piece; `bomb` is its id. Said
    // right after `bomb.exploded`.
    'monkey.blasted': { bomb: number };
    // The visitor chose a tool in the dock (Grab included, and again on the one already chosen).
    'tool.selected': { tool: Tool };
    'bomb.placed': { id: number; at: Point };
    // A rebuild of the page put the bomb out before it blew.
    'bomb.cancelled': { id: number };
    'bomb.exploded': { id: number; at: Point; radius: number; freed: number[] };
    'tornado.started': { x: number };
    'tornado.ended': undefined;
    'gravity.changed': { zero: boolean };
    // The visitor pressed Rebuild (the dock, the director panel): the monkey tidies up in a hurry.
    'rebuild.requested': undefined;
    // The visitor has touched nothing for a while: the monkey may tidy up on his own.
    'visitor.idle': undefined;
    // The Brain started a behaviour; `resumed` when an interrupted activity went on.
    'behaviour.started': {
        actor: string;
        id: string;
        kind: BehaviourKind;
        resumed: boolean;
    };
    'behaviour.ended': {
        actor: string;
        id: string;
        kind: BehaviourKind;
        by: EndedBy;
    };
    // An actor says a line, already in the page's language. The Voice draws it.
    'line.said': { actor: string; key: string; text: string };
}
