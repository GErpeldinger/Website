import { Application } from '@hotwired/stimulus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GameController from '../../../assets/controllers/game_controller';

// The game entry is imported dynamically, so the test decides when that import settles.
const mocks = vi.hoisted(() => {
    const stop = vi.fn();
    const game = { stop };
    const startGame = vi.fn(() => game);
    const unmountDirector = vi.fn();
    const mountDirector = vi.fn(() => unmountDirector);
    const imports = vi.fn();
    const directorImports = vi.fn();
    const chunk = { gone: false };
    const gate = {
        promise: Promise.resolve(),
        release: (): void => undefined,
    };
    const directorGate = {
        promise: Promise.resolve(),
        release: (): void => undefined,
    };
    // A new import waits for a new gate: the test opens it when the game "arrives".
    const arm = (): void => {
        gate.promise = new Promise<void>((resolve) => {
            gate.release = resolve;
        });
        directorGate.promise = new Promise<void>((resolve) => {
            directorGate.release = resolve;
        });
    };
    return {
        stop,
        game,
        startGame,
        mountDirector,
        unmountDirector,
        imports,
        directorImports,
        chunk,
        gate,
        directorGate,
        arm,
    };
});

let application: Application | undefined;

beforeEach(() => {
    vi.resetModules();
    mocks.arm();
    mocks.chunk.gone = false;
    // Not vi.mock: its factory would run once, and the gate only holds the first import.
    vi.doMock('../../../assets/game/game', async () => {
        mocks.imports();
        if (mocks.chunk.gone) {
            throw new Error('Failed to fetch the chunk');
        }
        await mocks.gate.promise;
        return { startGame: mocks.startGame };
    });
    vi.doMock('../../../assets/game/director/director', async () => {
        mocks.directorImports();
        await mocks.directorGate.promise;
        return { mountDirector: mocks.mountDirector };
    });
    vi.useFakeTimers();
    // happy-dom has no font loading API.
    Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { ready: Promise.resolve() },
    });
    mocks.startGame.mockClear();
    mocks.imports.mockClear();
    mocks.directorImports.mockClear();
    mocks.mountDirector.mockClear();
    mocks.unmountDirector.mockClear();
    mocks.stop.mockClear();
});

afterEach(() => {
    application?.stop();
    application = undefined;
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(document, 'fonts');
});

const connect = async (attributes = ''): Promise<Element> => {
    document.body.innerHTML = `<main data-controller="game"${attributes}></main>`;
    application = Application.start();
    application.register('game', GameController);
    // Stimulus connects on the next microtask after the registration.
    await Promise.resolve();
    return document.querySelector('main') as Element;
};

it('connects to its element and leaves it untouched', async () => {
    const element = await connect();

    expect(
        application?.getControllerForElementAndIdentifier(element, 'game'),
    ).toBeInstanceOf(GameController);
    expect(element.outerHTML).toBe('<main data-controller="game"></main>');
});

it('starts the game on its element once the page has painted and the game loaded', async () => {
    const element = await connect();

    expect(mocks.startGame).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.startGame).not.toHaveBeenCalled();

    mocks.gate.release();
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.startGame).toHaveBeenCalledExactlyOnceWith(element, {
        lines: {},
    });
});

it('gives the game the lines the server rendered', async () => {
    const lines = { locale: 'fr', pools: { grab: ['Pose ça.', 'Hé !'] } };
    const element = await connect(
        ` data-game-lines-value='${JSON.stringify(lines)}'`,
    );
    mocks.gate.release();
    await vi.advanceTimersByTimeAsync(100);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.startGame).toHaveBeenCalledExactlyOnceWith(element, {
        lines,
    });
});

it('stops the game when the element leaves the page', async () => {
    const element = await connect();
    mocks.gate.release();
    await vi.advanceTimersByTimeAsync(100);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);

    element.remove();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.stop).toHaveBeenCalledTimes(1);
});

it('never starts the game of an element that left before the first paint', async () => {
    const element = await connect();
    mocks.gate.release();

    element.remove();
    await vi.advanceTimersByTimeAsync(100);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);

    // The game was not even fetched.
    expect(mocks.imports).not.toHaveBeenCalled();
    expect(mocks.startGame).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
});

it('never starts the game of an element that left while the game was loading', async () => {
    const element = await connect();
    await vi.advanceTimersByTimeAsync(100);

    element.remove();
    await vi.advanceTimersByTimeAsync(0);
    mocks.gate.release();
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.startGame).not.toHaveBeenCalled();
});

it('leaves the static page alone when the game chunk is gone, as after a deploy', async () => {
    mocks.chunk.gone = true;
    const element = await connect();
    mocks.gate.release();
    await vi.advanceTimersByTimeAsync(100);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.imports).toHaveBeenCalledTimes(1);
    expect(mocks.startGame).not.toHaveBeenCalled();
    expect(element.outerHTML).toBe('<main data-controller="game"></main>');
});

// The game arrives, and then the director panel's chunk.
const arrive = async (): Promise<void> => {
    mocks.gate.release();
    await vi.advanceTimersByTimeAsync(100);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
};

describe('the director panel', () => {
    it('is mounted on the game in development, and removed with it', async () => {
        const element = await connect();
        await arrive();
        mocks.directorGate.release();
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.mountDirector).toHaveBeenCalledExactlyOnceWith(mocks.game);
        expect(mocks.unmountDirector).not.toHaveBeenCalled();

        element.remove();
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.unmountDirector).toHaveBeenCalledTimes(1);
        expect(mocks.stop).toHaveBeenCalledTimes(1);
    });

    it('is not even fetched in a production build', async () => {
        vi.stubEnv('DEV', false);
        await connect();
        await arrive();
        mocks.directorGate.release();
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.startGame).toHaveBeenCalledTimes(1);
        expect(mocks.directorImports).not.toHaveBeenCalled();
        expect(mocks.mountDirector).not.toHaveBeenCalled();
    });

    it('is not mounted for an element that left while the panel was loading', async () => {
        const element = await connect();
        await arrive();

        element.remove();
        await vi.advanceTimersByTimeAsync(0);
        mocks.directorGate.release();
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.mountDirector).not.toHaveBeenCalled();
        expect(mocks.stop).toHaveBeenCalledTimes(1);
    });

    it('is not mounted when the game never loaded', async () => {
        mocks.chunk.gone = true;
        await connect();
        await arrive();

        expect(mocks.directorImports).not.toHaveBeenCalled();
        expect(mocks.mountDirector).not.toHaveBeenCalled();
    });
});
