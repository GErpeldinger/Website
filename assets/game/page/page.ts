import type { Box, PieceKind, Point } from '../events/game_events';
import { heightScaleOf, kindOf, traitsOf } from '../physics/kinds';
import type { Bounds, PieceSpec, Placement } from '../physics/world';

// The game's reading and writing of the page. Everything that measures or styles an element is
// here, so the physics never sees the DOM.
export type PieceState = 'pinned' | 'loose' | 'held';

// The marked elements of a page, measured.
export interface Measured {
    specs: PieceSpec[];
    elements: Map<number, HTMLElement>;
    ids: Map<Element, number>;
}

export const scrollOffset = (): Point => ({
    x: window.scrollX,
    y: window.scrollY,
});

// What the visitor sees of the page, in page coordinates.
export const measureViewport = (): Box => {
    const root = document.documentElement;
    return {
        x: window.scrollX,
        y: window.scrollY,
        width: root.clientWidth,
        height: root.clientHeight,
    };
};

// A body smaller than this would slip through anything.
const MIN_SIZE = 10;

// Every `data-physics` element becomes a spec, numbered in document order. Positions are page
// coordinates: the box on screen plus the scroll, whatever the pixel density. Each element is
// marked pinned first, so the states' styles are in place before anything is measured.
export const measurePieces = (root: ParentNode, scroll: Point): Measured => {
    const specs: PieceSpec[] = [];
    const elements = new Map<number, HTMLElement>();
    const ids = new Map<Element, number>();

    const marked: { element: HTMLElement; kind: PieceKind }[] = [];
    for (const element of root.querySelectorAll<HTMLElement>(
        '[data-physics]',
    )) {
        const kind = kindOf(element.getAttribute('data-physics'));
        if (kind) {
            setState(element, 'pinned');
            marked.push({ element, kind });
        }
    }
    for (const { element, kind } of marked) {
        const box = element.getBoundingClientRect();
        const id = specs.length;
        specs.push({
            id,
            kind,
            traits: traitsOf(kind, {
                grabbable: element.getAttribute('data-grabbable'),
                hangable: element.getAttribute('data-hangable'),
                breakable: element.getAttribute('data-breakable'),
                weight: element.getAttribute('data-weight'),
            }),
            x: box.left + box.width / 2 + scroll.x,
            y: box.top + box.height / 2 + scroll.y,
            width: Math.max(box.width, MIN_SIZE),
            height: Math.max(box.height * heightScaleOf(kind), MIN_SIZE),
        });
        elements.set(id, element);
        ids.set(element, id);
    }
    return { specs, elements, ids };
};

// The piece an event target is part of, the nearest marked ancestor.
export const pieceAt = (
    measured: Measured,
    target: Element | null,
): number | undefined => {
    const element = target?.closest('[data-physics]');
    return element ? measured.ids.get(element) : undefined;
};

// The floor is the top of the ground strip, which the CSS places: it is measured, never assumed.
// Without a strip the page's own bottom is the floor.
export const measureBounds = (scroll: Point): Bounds => {
    const root = document.documentElement;
    const ground = document.querySelector('[data-ground]');
    return {
        width: root.clientWidth,
        floor: ground
            ? ground.getBoundingClientRect().top + scroll.y
            : Math.max(root.scrollHeight, root.clientHeight),
    };
};

export const writePlacements = (
    elements: Map<number, HTMLElement>,
    placements: Placement[],
): void => {
    for (const { id, dx, dy, angle } of placements) {
        const element = elements.get(id);
        if (element) {
            element.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${angle.toFixed(4)}rad)`;
        }
    }
};

export const clearPlacement = (element: HTMLElement): void => {
    element.style.transform = '';
};

// The CSS reads the state from this attribute: [data-state="held"] and so on.
export const setState = (element: HTMLElement, state: PieceState): void => {
    element.dataset.state = state;
};

// The element as the server rendered it: in its place, with no state.
export const resetPiece = (element: HTMLElement): void => {
    clearPlacement(element);
    delete element.dataset.state;
};

export const prefersReducedMotion = (): boolean =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
