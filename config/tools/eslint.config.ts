import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { architecture } from './eslint.architecture.ts';

// Type-aware rules read the same projects as `tsc`.
const projects = ['./tsconfig.json', './tsconfig.node.json'];

export default defineConfig(
    globalIgnores(['public/build/', 'tests/eslint/fixtures/']),
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: projects,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/explicit-function-return-type': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            // Stimulus lifecycle hooks are empty until a controller needs them.
            '@typescript-eslint/no-empty-function': 'off',
        },
    },
    architecture,
    // Last: switches off every rule that would fight Prettier.
    prettier,
);
