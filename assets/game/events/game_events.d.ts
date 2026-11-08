// Every event the physics layer puts on the bus, with its payload. Positions are in page
// coordinates (CSS pixels from the top left of the document), whatever the scroll or the screen.
export interface Point {
    x: number;
    y: number;
}

export type PieceKind = 'letter' | 'block' | 'link';

export type FreedBy = 'impact' | 'grab' | 'bomb' | 'tornado' | 'gravity';

export type HitAgainst = 'piece' | 'bomb' | 'floor' | 'wall';

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
    'bomb.placed': { id: number; at: Point };
    // A rebuild of the page put the bomb out before it blew.
    'bomb.cancelled': { id: number };
    'bomb.exploded': { id: number; at: Point; radius: number; freed: number[] };
    'tornado.started': { x: number };
    'tornado.ended': undefined;
    'gravity.changed': { zero: boolean };
}
