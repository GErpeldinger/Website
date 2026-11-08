// Helpers the DOM tests of the game share. happy-dom lays nothing out, so a test says what box
// an element has.
export const rect = (
    left: number,
    top: number,
    width: number,
    height: number,
): DOMRect =>
    ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
    }) as DOMRect;

export const select = (selector: string): HTMLElement => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
        throw new Error(`No element matches ${selector}.`);
    }
    return element;
};

export const byId = (id: string): HTMLElement => select(`#${id}`);
