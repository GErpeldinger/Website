import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { pureModules } from './game-modules.ts';

// The root is explicit so the config works wherever the file lives and wherever Stryker runs it from.
const root = fileURLToPath(new URL('../..', import.meta.url));

// The tests mirror the sources (tests/assets/game/clock/clock.test.ts tests
// assets/game/clock/clock.ts). The pure game modules run in plain Node, so a DOM global fails
// there as it does under tsconfig.game.json. Every other test gets a DOM, so a test in a new
// folder runs too.
const pure = `tests/assets/game/{${pureModules.join(',')}}/**/*.test.ts`;

export default defineConfig({
    root,
    cacheDir: '.cache/vitest',
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'game',
                    environment: 'node',
                    include: [pure],
                },
            },
            {
                extends: true,
                test: {
                    name: 'dom',
                    environment: 'happy-dom',
                    include: ['tests/assets/**/*.test.ts'],
                    exclude: [pure],
                },
            },
        ],
    },
});
