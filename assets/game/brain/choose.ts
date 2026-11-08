interface Candidate {
    readonly priority: number;
    readonly weight?: number;
}

// The behaviour to run among those that could: the highest priority wins, and among equals the
// weights are the odds. `random` returns a number in [0, 1).
export const choose = <Item extends Candidate>(
    candidates: readonly Item[],
    random: () => number,
): Item | undefined => {
    const top = Math.max(...candidates.map(({ priority }) => priority));
    const tied = candidates.filter(({ priority }) => priority === top);
    const weight = (item: Item): number => item.weight ?? 1;
    let point =
        random() * tied.reduce((total, item) => total + weight(item), 0);
    for (const item of tied) {
        if (point < weight(item)) {
            return item;
        }
        point -= weight(item);
    }
    // A `random` that returned 1 would land past the last one.
    return tied.at(-1);
};
