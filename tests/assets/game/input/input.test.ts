import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { Input } from '../../../../assets/game/input/input';
import { byId, select } from '../dom';

const aborts: AbortController[] = [];

afterEach(() => {
    for (const abort of aborts.splice(0)) {
        abort.abort();
    }
    document.body.innerHTML = '';
});

type Kind = 'mouse' | 'touch';

// A click, stamped on the same clock as the pointer events of the test.
const click = (target: EventTarget, time = 0): MouseEvent => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'timeStamp', { value: time });
    target.dispatchEvent(event);
    return event;
};

interface FireInit {
    x?: number;
    y?: number;
    id?: number;
    kind?: Kind;
    time?: number;
    button?: number;
}

interface Hooks {
    pick: Mock<(target: Element | null) => number | undefined>;
    grab: Mock<(id: number, at: { x: number; y: number }) => boolean>;
    drag: Mock<(to: { x: number; y: number }) => void>;
    release: Mock<(velocity: { x: number; y: number }) => void>;
    aim: Mock<(x: number) => void>;
    wake: Mock<() => void>;
}

interface Harness {
    root: HTMLElement;
    piece: HTMLElement;
    other: HTMLElement;
    clock: Clock;
    hooks: Hooks;
    view: { scroll: { x: number; y: number } };
    input: Input;
    abort: AbortController;
    // Events the way a pointer makes them; `time` is the event's own timestamp.
    fire: (target: EventTarget, type: string, init?: FireInit) => PointerEvent;
}

const setup = (): Harness => {
    document.body.innerHTML =
        '<main><a id="piece" href="#x">piece</a><p id="other">other</p></main>';
    const root = select('main');
    const piece = byId('piece');
    const other = byId('other');
    const clock = new Clock();
    const abort = new AbortController();
    aborts.push(abort);
    const hooks = {
        pick: vi.fn<(target: Element | null) => number | undefined>((target) =>
            target === piece ? 7 : undefined,
        ),
        grab: vi.fn<(id: number, at: { x: number; y: number }) => boolean>(
            () => true,
        ),
        drag: vi.fn<(to: { x: number; y: number }) => void>(),
        release: vi.fn<(velocity: { x: number; y: number }) => void>(),
        aim: vi.fn<(x: number) => void>(),
        wake: vi.fn<() => void>(),
    };
    const view = { scroll: { x: 0, y: 0 } };
    const input = new Input({
        root,
        clock,
        hooks,
        signal: abort.signal,
        scroll: (): { x: number; y: number } => view.scroll,
    });

    const fire = (
        target: EventTarget,
        type: string,
        init: FireInit = {},
    ): PointerEvent => {
        const event = new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: init.x ?? 0,
            clientY: init.y ?? 0,
            pointerId: init.id ?? 1,
            pointerType: init.kind ?? 'mouse',
            button: init.button ?? 0,
        });
        Object.defineProperty(event, 'timeStamp', { value: init.time ?? 0 });
        target.dispatchEvent(event);
        return event;
    };

    return { root, piece, other, clock, hooks, view, input, abort, fire };
};

describe('a mouse press', () => {
    it('does not take the piece at once, but keeps the browser from selecting text', () => {
        const { piece, hooks, fire } = setup();

        const down = fire(piece, 'pointerdown', { x: 20, y: 30 });

        expect(down.defaultPrevented).toBe(true);
        expect(hooks.pick).toHaveBeenCalledWith(piece);
        expect(hooks.grab).not.toHaveBeenCalled();
    });

    it('lets a press on something else go through', () => {
        const { other, hooks, fire, input } = setup();

        const down = fire(other, 'pointerdown');

        expect(down.defaultPrevented).toBe(false);
        expect(input.busy).toBe(false);
        expect(hooks.wake).not.toHaveBeenCalled();
    });

    it('ignores a button other than the main one', () => {
        const { piece, hooks, fire, input } = setup();

        const down = fire(piece, 'pointerdown', { button: 2 });

        expect(down.defaultPrevented).toBe(false);
        expect(hooks.pick).not.toHaveBeenCalled();
        expect(input.busy).toBe(false);
    });

    it('grabs where it was pressed once the pointer moved more than 4 px', () => {
        const { piece, hooks, fire, input } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100 });

        fire(window, 'pointermove', { x: 104, y: 100 });
        expect(hooks.grab).not.toHaveBeenCalled();
        expect(input.busy).toBe(true);

        fire(window, 'pointermove', { x: 104, y: 101 });
        expect(hooks.grab).toHaveBeenCalledExactlyOnceWith(7, {
            x: 100,
            y: 100,
        });
        expect(hooks.drag).toHaveBeenCalledExactlyOnceWith({ x: 104, y: 101 });
        expect(hooks.wake).toHaveBeenCalled();
    });

    it('measures the distance in both directions', () => {
        const left = setup();
        left.fire(left.piece, 'pointerdown', { x: 100, y: 100 });
        left.fire(window, 'pointermove', { x: 96, y: 100 });
        expect(left.hooks.grab).not.toHaveBeenCalled();
        left.fire(window, 'pointermove', { x: 95, y: 100 });
        expect(left.hooks.grab).toHaveBeenCalled();

        const up = setup();
        up.fire(up.piece, 'pointerdown', { x: 100, y: 100 });
        up.fire(window, 'pointermove', { x: 100, y: 105 });
        expect(up.hooks.grab).toHaveBeenCalled();
    });

    it('drags the held piece to every new position', () => {
        const { piece, hooks, fire } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100 });
        fire(window, 'pointermove', { x: 120, y: 100 });

        fire(window, 'pointermove', { x: 150, y: 90 });

        expect(hooks.drag).toHaveBeenLastCalledWith({ x: 150, y: 90 });
        expect(hooks.drag).toHaveBeenCalledTimes(2);
    });

    it('adds the scroll to the pointer, so the point is on the page', () => {
        const { piece, hooks, view, fire } = setup();
        view.scroll = { x: 10, y: 300 };
        fire(piece, 'pointerdown', { x: 100, y: 50 });

        fire(window, 'pointermove', { x: 120, y: 50 });

        expect(hooks.grab).toHaveBeenCalledWith(7, { x: 110, y: 350 });
        expect(hooks.drag).toHaveBeenCalledWith({ x: 130, y: 350 });
        expect(hooks.aim).toHaveBeenLastCalledWith(130);
    });

    it('follows the piece to the pointer when the page scrolls under a still hand', () => {
        const { piece, hooks, view, fire } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 50 });
        fire(window, 'pointermove', { x: 120, y: 50 });
        hooks.drag.mockClear();

        view.scroll = { x: 0, y: 40 };
        fire(window, 'scroll');

        expect(hooks.drag).toHaveBeenCalledExactlyOnceWith({ x: 120, y: 90 });
    });

    it('ignores a scroll when nothing is held', () => {
        const { piece, hooks, fire } = setup();
        fire(window, 'scroll');
        fire(piece, 'pointerdown', { x: 100, y: 50 });
        fire(window, 'scroll');

        expect(hooks.drag).not.toHaveBeenCalled();
    });

    it('gives the tornado the pointer, pressed or not', () => {
        const { hooks, fire } = setup();

        fire(window, 'pointermove', { x: 40, y: 0 });
        fire(window, 'pointermove', { x: 90, y: 0 });

        expect(hooks.aim.mock.calls).toEqual([[40], [90]]);
    });

    it('lets go with the velocity of the last 100 ms of the pointer', () => {
        const { piece, hooks, fire, input } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100, time: 0 });
        fire(window, 'pointermove', { x: 130, y: 100, time: 10 });
        fire(window, 'pointermove', { x: 160, y: 100 - 20, time: 20 });

        fire(window, 'pointerup', { x: 160, y: 80, time: 20 });

        expect(hooks.release).toHaveBeenCalledTimes(1);
        const velocity = hooks.release.mock.calls[0]?.[0];
        // 60 px right and 20 up in 20 ms, per 16.67 ms step.
        expect(velocity?.x).toBeCloseTo(50);
        expect(velocity?.y).toBeCloseTo(-16.667);
        expect(input.busy).toBe(false);
    });

    it('throws nothing when the pointer rested before the release', () => {
        const { piece, hooks, fire } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100, time: 0 });
        fire(window, 'pointermove', { x: 160, y: 100, time: 10 });

        fire(window, 'pointerup', { x: 160, y: 100, time: 500 });

        expect(hooks.release).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 0 });
    });

    it('swallows the click that ends a drag, so a dragged link is not followed', () => {
        const { piece, root, fire } = setup();
        const clicked = vi.fn();
        piece.addEventListener('click', clicked);
        fire(piece, 'pointerdown', { x: 100, y: 100 });
        fire(window, 'pointermove', { x: 160, y: 100 });
        fire(window, 'pointerup', { x: 160, y: 100 });

        const event = click(piece);

        expect(event.defaultPrevented).toBe(true);
        expect(clicked).not.toHaveBeenCalled();

        // Only that one click.
        const next = click(piece);
        expect(next.defaultPrevented).toBe(false);
        expect(clicked).toHaveBeenCalledTimes(1);
        expect(root).toBeTruthy();
    });

    it('lets a click through when no pointer was involved, as a keyboard makes', () => {
        const { piece } = setup();

        expect(click(piece).defaultPrevented).toBe(false);
    });

    it('lets a keyboard click through after a drag, long after its release', () => {
        const { piece, fire } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100, time: 0 });
        fire(window, 'pointermove', { x: 160, y: 100, time: 10 });
        fire(window, 'pointerup', { x: 160, y: 100, time: 10 });

        expect(click(piece, 500).defaultPrevented).toBe(false);
    });

    it('swallows a click 50 ms after the release, not 51', () => {
        const drag = (): ReturnType<typeof setup> => {
            const s = setup();
            s.fire(s.piece, 'pointerdown', { x: 100, y: 100, time: 0 });
            s.fire(window, 'pointermove', { x: 160, y: 100, time: 10 });
            s.fire(window, 'pointerup', { x: 160, y: 100, time: 10 });
            return s;
        };

        expect(click(drag().piece, 61).defaultPrevented).toBe(false);
        expect(click(drag().piece, 60).defaultPrevented).toBe(true);
    });

    it('does not start a grab on a Ctrl-click, which is a right click on a Mac', () => {
        const { piece, hooks } = setup();
        const down = new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerType: 'mouse',
            button: 0,
            ctrlKey: true,
        });
        piece.dispatchEvent(down);

        expect(hooks.pick).not.toHaveBeenCalled();
        expect(down.defaultPrevented).toBe(false);
    });

    it('forgets a gesture the game cancelled', () => {
        const { piece, input, hooks, fire } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100 });
        fire(window, 'pointermove', { x: 160, y: 100 });

        input.cancel();
        fire(window, 'pointerup', { x: 160, y: 100 });

        expect(input.busy).toBe(false);
        expect(hooks.release).not.toHaveBeenCalled();
    });

    it('can cancel when nothing is going on', () => {
        const { input } = setup();

        expect(() => {
            input.cancel();
        }).not.toThrow();
    });

    it('measures each throw from its own press, not from the one before', () => {
        const { piece, hooks, fire } = setup();
        fire(piece, 'pointerdown', { x: 0, y: 0, time: 0 });
        fire(window, 'pointermove', { x: 60, y: 0, time: 10 });
        fire(window, 'pointerup', { x: 60, y: 0, time: 10 });
        hooks.release.mockClear();

        fire(piece, 'pointerdown', { x: 500, y: 500, time: 20 });
        fire(window, 'pointermove', { x: 520, y: 500, time: 30 });
        fire(window, 'pointerup', { x: 520, y: 500, time: 30 });

        const velocity = hooks.release.mock.calls[0]?.[0];
        // 20 px in 10 ms, per 16.67 ms step.
        expect(velocity?.x).toBeCloseTo(33.333);
        expect(velocity?.y).toBeCloseTo(0);
    });

    it('lets a plain click through: it grabbed nothing', () => {
        const { piece, hooks, fire } = setup();
        const clicked = vi.fn();
        piece.addEventListener('click', clicked);
        fire(piece, 'pointerdown', { x: 100, y: 100 });
        fire(window, 'pointerup', { x: 100, y: 100 });

        const event = click(piece);

        expect(event.defaultPrevented).toBe(false);
        expect(clicked).toHaveBeenCalledTimes(1);
        expect(hooks.release).not.toHaveBeenCalled();
    });

    it('ignores a second pointer while one holds a piece', () => {
        const { piece, other, hooks, fire } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100, id: 1 });

        const second = fire(piece, 'pointerdown', { id: 2, x: 10, y: 10 });
        fire(window, 'pointermove', { id: 2, x: 400, y: 400 });
        fire(window, 'pointerup', { id: 2 });
        fire(other, 'pointerdown', { id: 3 });

        expect(second.defaultPrevented).toBe(false);
        expect(hooks.grab).not.toHaveBeenCalled();
        expect(hooks.release).not.toHaveBeenCalled();
        fire(window, 'pointermove', { id: 1, x: 200, y: 100 });
        expect(hooks.grab).toHaveBeenCalledWith(7, { x: 100, y: 100 });
    });

    it('ends the press without a grab when the grab is refused', () => {
        const { piece, hooks, fire, input } = setup();
        hooks.grab.mockReturnValue(false);
        fire(piece, 'pointerdown', { x: 100, y: 100 });

        fire(window, 'pointermove', { x: 200, y: 100 });
        fire(window, 'pointermove', { x: 300, y: 100 });
        fire(window, 'pointerup', { x: 300, y: 100 });

        expect(hooks.grab).toHaveBeenCalledTimes(1);
        expect(hooks.drag).not.toHaveBeenCalled();
        expect(hooks.release).not.toHaveBeenCalled();
        expect(input.busy).toBe(false);
    });
});

describe('losing the pointer', () => {
    it('lets go gently when the browser cancels the gesture, and swallows nothing', () => {
        const { piece, hooks, fire } = setup();
        const clicked = vi.fn();
        piece.addEventListener('click', clicked);
        fire(piece, 'pointerdown', { x: 100, y: 100, time: 0 });
        fire(window, 'pointermove', { x: 160, y: 100, time: 10 });

        fire(window, 'pointercancel', { x: 160, y: 100, time: 10 });
        click(piece);

        expect(hooks.release).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 0 });
        expect(clicked).toHaveBeenCalledTimes(1);
    });

    it('lets go when the window loses focus, and swallows nothing', () => {
        const { piece, hooks, fire, input } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100 });
        fire(window, 'pointermove', { x: 160, y: 100 });

        fire(window, 'blur');
        const event = click(piece);

        expect(hooks.release).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 0 });
        expect(input.busy).toBe(false);
        expect(event.defaultPrevented).toBe(false);
    });

    it('drops a press that never became a grab', () => {
        const { piece, hooks, fire, input } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100 });

        fire(window, 'blur');

        expect(hooks.release).not.toHaveBeenCalled();
        expect(input.busy).toBe(false);
    });

    it('has nothing to drop when nothing is going on', () => {
        const { hooks, fire } = setup();

        expect(() => {
            fire(window, 'blur');
        }).not.toThrow();
        expect(hooks.release).not.toHaveBeenCalled();
    });

    it('ignores a cancel from another pointer', () => {
        const { piece, input, fire } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100, id: 1 });

        fire(window, 'pointercancel', { id: 2 });

        expect(input.busy).toBe(true);
    });
});

describe('a touch', () => {
    it('grabs after a long press of 450 ms, where the finger is', () => {
        const { piece, clock, hooks, fire, input } = setup();

        const down = fire(piece, 'pointerdown', {
            kind: 'touch',
            x: 100,
            y: 100,
        });

        // The browser keeps the gesture: a swipe still scrolls.
        expect(down.defaultPrevented).toBe(false);
        expect(hooks.wake).toHaveBeenCalled();
        clock.tick(249);
        clock.tick(200);
        expect(hooks.grab).not.toHaveBeenCalled();
        clock.tick(1);

        expect(hooks.grab).toHaveBeenCalledExactlyOnceWith(7, {
            x: 100,
            y: 100,
        });
        expect(hooks.drag).toHaveBeenCalledExactlyOnceWith({ x: 100, y: 100 });
        expect(input.busy).toBe(true);
    });

    it('is a swipe when the finger moves more than 10 px first', () => {
        const { piece, clock, hooks, fire, input } = setup();
        fire(piece, 'pointerdown', { kind: 'touch', x: 100, y: 100 });

        fire(window, 'pointermove', { kind: 'touch', x: 110, y: 100 });
        expect(input.busy).toBe(true);
        fire(window, 'pointermove', { kind: 'touch', x: 110, y: 101 });

        expect(input.busy).toBe(false);
        clock.tick(250);
        clock.tick(250);
        expect(hooks.grab).not.toHaveBeenCalled();
    });

    it('measures a swipe up as well as sideways', () => {
        const { piece, input, fire } = setup();
        fire(piece, 'pointerdown', { kind: 'touch', x: 100, y: 100 });

        fire(window, 'pointermove', { kind: 'touch', x: 100, y: 89 });

        expect(input.busy).toBe(false);
    });

    it('drags what it holds, and throws it when it lets go', () => {
        const { piece, clock, hooks, fire } = setup();
        fire(piece, 'pointerdown', { kind: 'touch', x: 100, y: 100, time: 0 });
        clock.tick(250);
        clock.tick(250);

        fire(window, 'pointermove', {
            kind: 'touch',
            x: 140,
            y: 100,
            time: 500,
        });
        fire(window, 'pointermove', {
            kind: 'touch',
            x: 180,
            y: 100,
            time: 520,
        });
        fire(window, 'pointerup', { kind: 'touch', x: 180, y: 100, time: 520 });

        expect(hooks.drag).toHaveBeenLastCalledWith({ x: 180, y: 100 });
        expect(hooks.release).toHaveBeenCalledTimes(1);
        expect(hooks.release.mock.calls[0]?.[0].x).toBeCloseTo(
            (40 / 20) * (1000 / 60),
        );
    });

    it('leaves the click after a long press alone: a touch release has none to swallow', () => {
        const { piece, clock, fire } = setup();
        fire(piece, 'pointerdown', { kind: 'touch', x: 100, y: 100 });
        clock.tick(250);
        clock.tick(250);
        fire(window, 'pointerup', { kind: 'touch', x: 100, y: 100 });

        const event = click(piece);

        expect(event.defaultPrevented).toBe(false);
    });

    it('is a tap when the finger lifts before the press is long enough', () => {
        const { piece, clock, hooks, fire, input } = setup();
        const clicked = vi.fn();
        piece.addEventListener('click', clicked);
        fire(piece, 'pointerdown', { kind: 'touch', x: 100, y: 100 });

        fire(window, 'pointerup', { kind: 'touch', x: 100, y: 100 });
        clock.tick(250);
        clock.tick(250);
        click(piece);

        expect(input.busy).toBe(false);
        expect(hooks.grab).not.toHaveBeenCalled();
        expect(clicked).toHaveBeenCalledTimes(1);
    });

    it('is a swipe when the browser takes the gesture over to scroll', () => {
        const { piece, clock, hooks, fire, input } = setup();
        fire(piece, 'pointerdown', { kind: 'touch', x: 100, y: 100 });

        fire(window, 'pointercancel', { kind: 'touch' });
        clock.tick(250);
        clock.tick(250);

        expect(input.busy).toBe(false);
        expect(hooks.grab).not.toHaveBeenCalled();
    });

    it('does not stop the scroll before the piece is held', () => {
        const { piece, clock, fire } = setup();
        fire(piece, 'pointerdown', { kind: 'touch', x: 100, y: 100 });

        const early = new Event('touchmove', { cancelable: true });
        window.dispatchEvent(early);
        clock.tick(250);
        clock.tick(250);
        const late = new Event('touchmove', { cancelable: true });
        window.dispatchEvent(late);

        expect(early.defaultPrevented).toBe(false);
        expect(late.defaultPrevented).toBe(true);
    });

    it('does not open the context menu of a long press', () => {
        const { piece, other, clock, fire } = setup();
        const idle = new Event('contextmenu', {
            bubbles: true,
            cancelable: true,
        });
        other.dispatchEvent(idle);
        fire(piece, 'pointerdown', { kind: 'touch', x: 100, y: 100 });
        const pressed = new Event('contextmenu', {
            bubbles: true,
            cancelable: true,
        });
        piece.dispatchEvent(pressed);
        clock.tick(250);
        clock.tick(250);
        const held = new Event('contextmenu', {
            bubbles: true,
            cancelable: true,
        });
        piece.dispatchEvent(held);

        expect(idle.defaultPrevented).toBe(false);
        expect(pressed.defaultPrevented).toBe(true);
        expect(held.defaultPrevented).toBe(true);
    });
});

describe('the browser own drag of a link', () => {
    it('is refused on a piece only', () => {
        const { piece, other } = setup();

        const onPiece = new Event('dragstart', {
            bubbles: true,
            cancelable: true,
        });
        piece.dispatchEvent(onPiece);
        const elsewhere = new Event('dragstart', {
            bubbles: true,
            cancelable: true,
        });
        other.dispatchEvent(elsewhere);

        expect(onPiece.defaultPrevented).toBe(true);
        expect(elsewhere.defaultPrevented).toBe(false);
    });
});

describe('stopping', () => {
    it('removes every listener when the signal aborts', () => {
        const { piece, hooks, abort, fire, clock } = setup();
        // A long press has the piece in hand.
        fire(piece, 'pointerdown', { kind: 'touch', x: 100, y: 100 });
        clock.tick(250);
        clock.tick(250);
        hooks.pick.mockClear();
        hooks.aim.mockClear();
        hooks.drag.mockClear();
        hooks.release.mockClear();

        abort.abort();
        fire(piece, 'pointerdown', { x: 100, y: 100 });
        fire(window, 'pointermove', { kind: 'touch', x: 300, y: 100 });
        fire(window, 'scroll');
        const events = ['dragstart', 'contextmenu', 'touchmove'].map((type) => {
            const event = new Event(type, { bubbles: true, cancelable: true });
            piece.dispatchEvent(event);
            return event;
        });
        fire(window, 'pointerup', { kind: 'touch' });
        fire(window, 'pointercancel', { kind: 'touch' });
        fire(window, 'blur');

        expect(hooks.pick).not.toHaveBeenCalled();
        expect(hooks.aim).not.toHaveBeenCalled();
        expect(hooks.drag).not.toHaveBeenCalled();
        expect(hooks.release).not.toHaveBeenCalled();
        expect(events.map((event) => event.defaultPrevented)).toEqual([
            false,
            false,
            false,
        ]);
    });

    it('ignores a press once stopped', () => {
        const { piece, hooks, abort, fire } = setup();

        abort.abort();
        const down = fire(piece, 'pointerdown', { x: 100, y: 100 });

        expect(hooks.pick).not.toHaveBeenCalled();
        expect(down.defaultPrevented).toBe(false);
    });

    it('stops swallowing clicks too', () => {
        const { piece, abort, fire } = setup();
        fire(piece, 'pointerdown', { x: 100, y: 100, time: 0 });
        fire(window, 'pointermove', { x: 160, y: 100, time: 10 });
        fire(window, 'pointerup', { x: 160, y: 100, time: 10 });

        abort.abort();
        const event = click(piece);

        expect(event.defaultPrevented).toBe(false);
    });
});
