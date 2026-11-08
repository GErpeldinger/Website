import type { FrameEnvironment } from '../../../../assets/game/frame/frame';

// A browser whose frames, time and visibility the test drives by hand.
export class FakeBrowser implements FrameEnvironment {
    time = 0;
    isHidden = false;
    requested = 0;
    cancelled: number[] = [];
    timeouts = new Map<number, { callback: () => void; delay: number }>();
    clearedTimeouts: number[] = [];
    #timeoutHandle = 0;
    #callback: ((time: number) => void) | undefined;
    #handle = 0;
    #visibility: (() => void) | undefined;

    request(callback: (time: number) => void): number {
        this.requested++;
        this.#callback = callback;
        return ++this.#handle;
    }

    cancel(handle: number): void {
        this.cancelled.push(handle);
        this.#callback = undefined;
    }

    now(): number {
        return this.time;
    }

    timeout(callback: () => void, delay: number): number {
        this.timeouts.set(++this.#timeoutHandle, { callback, delay });
        return this.#timeoutHandle;
    }

    clearTimeout(handle: number): void {
        this.clearedTimeouts.push(handle);
        this.timeouts.delete(handle);
    }

    // Lets the one pending timeout go off.
    fireTimeout(): void {
        const [handle, timeout] = [...this.timeouts][0] ?? [];
        if (handle !== undefined && timeout) {
            this.timeouts.delete(handle);
            timeout.callback();
        }
    }

    hidden(): boolean {
        return this.isHidden;
    }

    watchVisibility(listener: () => void, signal: AbortSignal): void {
        this.#visibility = listener;
        signal.addEventListener('abort', () => {
            this.#visibility = undefined;
        });
    }

    get pending(): boolean {
        return this.#callback !== undefined;
    }

    // Delivers the next frame, `at` ms on the page's clock.
    frame(at: number): void {
        const callback = this.#callback;
        this.#callback = undefined;
        this.time = at;
        callback?.(at);
    }

    changeVisibility(hidden: boolean): void {
        this.isHidden = hidden;
        this.#visibility?.();
    }

    get watching(): boolean {
        return this.#visibility !== undefined;
    }
}
