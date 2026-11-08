// The game layer's modules that compile without the DOM and test in plain Node. Everything that
// reads this list does so from here; tsconfig.game.json cannot import it, so
// tests/eslint/architecture.ts checks the two agree.
export const pureModules = [
    'brain',
    'activities',
    'ports',
    'lines',
    'clock',
    'events',
] as const;
