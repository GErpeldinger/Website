import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import stylelint from 'stylelint';
import { resolveConfig } from 'vite';

// Each Stylelint rule that enforces a convention must be able to fail: a violating file is
// reported by that rule, and a compliant one passes. The files are linted from memory, at the
// paths the rules apply to, with the real config.

interface Case {
    path: string;
    code: string;
    // The rules that must report the file, or none when it must pass.
    rules?: string[];
}

const configFile = 'config/tools/stylelint.config.ts';
const classPattern = 'selector-class-pattern';
const maxClass = 'selector-max-class';
const maxId = 'selector-max-id';
const attributeName = 'selector-attribute-name-disallowed-list';
const selectorList = 'selector-disallowed-list';
const values = 'declaration-property-value-allowed-list';
const hex = 'color-no-hex';
const named = 'color-named';
const functions = 'function-disallowed-list';
const browsers = 'plugin/no-unsupported-browser-features';

// A file of the stylesheets, holding one rule.
const at = (path: string, rule: string, rules?: string[]): Case => ({
    path: `assets/styles/${path}`,
    code: `${rule}\n`,
    rules,
});

const block = (declaration: string): string => `.card {\n  ${declaration}\n}`;

const cases: Case[] = [
    // Class names follow the layer of the file.
    at('composition.css', '.stack {\n  display: flex;\n}', [classPattern]),
    at('composition.css', '.l-stack {\n  display: flex;\n}'),
    at('composition.css', '.u-stack {\n  display: flex;\n}', [classPattern]),
    at('utilities.css', '.muted {\n  display: none;\n}', [classPattern]),
    at('utilities.css', '.u-muted {\n  display: none;\n}'),
    at('utilities.css', '.l-muted {\n  display: none;\n}', [classPattern]),
    at('blocks/card.css', '.l-card {\n  display: none;\n}', [classPattern]),
    at('blocks/card.css', '.u-card {\n  display: none;\n}', [classPattern]),
    at('blocks/card.css', block('display: none;')),
    at('blocks/card.css', '.card-title {\n  display: none;\n}'),
    at('blocks/card.css', '.card__title {\n  display: none;\n}', [
        classPattern,
    ]),
    at('blocks/card.css', '.Card {\n  display: none;\n}', [classPattern]),

    // Only blocks, utilities and compositions carry classes: the other layers style elements.
    ...['reset.css', 'elements.css', 'tokens.css'].map((file) =>
        at(file, block('display: none;'), [maxClass]),
    ),
    at('elements.css', 'ul[class] {\n  list-style: none;\n}'),
    at('elements.css', 'h1 > span {\n  display: block;\n}'),

    // No ID selector, in any layer.
    at('blocks/card.css', '#world {\n  display: none;\n}', [maxId]),
    at('blocks/card.css', '.card #title {\n  display: none;\n}', [maxId]),
    at('composition.css', '#world {\n  display: none;\n}', [maxId]),
    at('elements.css', 'main#world {\n  display: none;\n}', [maxId]),

    // State goes through data attributes: no state class, no ARIA or other attribute selector.
    at('blocks/pill.css', '.pill.is-held {\n  display: none;\n}', [
        classPattern,
    ]),
    at('blocks/pill.css', '.has-focus {\n  display: none;\n}', [classPattern]),
    at('blocks/pill.css', '.pill[aria-pressed="true"] {\n  display: none;\n}', [
        attributeName,
    ]),
    at('blocks/pill.css', '.pill[hidden] {\n  display: none;\n}', [
        attributeName,
    ]),
    at('blocks/pill.css', '.pill[data-state="held"] {\n  display: none;\n}'),
    at('blocks/pill.css', '.pill:hover {\n  display: none;\n}'),
    at('exceptions.css', '.pill {\n  display: none;\n}', [selectorList]),
    at('exceptions.css', 'a:hover {\n  display: none;\n}', [selectorList]),
    at('exceptions.css', '.pill.is-held {\n  display: none;\n}', [
        classPattern,
        selectorList,
    ]),
    at('exceptions.css', '.pill[data-state="held"] {\n  display: none;\n}'),
    at('exceptions.css', '[data-mood="night"] {\n  display: none;\n}'),
    at(
        'exceptions.css',
        '.pill[data-state="held"],\n.pill {\n  display: none;\n}',
        [selectorList],
    ),
    at(
        'exceptions.css',
        '.pill[data-state="held"],\n.card[data-state="held"] {\n  display: none;\n}',
    ),

    // Colours come from the tokens.
    at('blocks/card.css', block('color: #fff;'), [hex]),
    at('blocks/card.css', block('background: #0008;'), [hex]),
    at('blocks/card.css', block('color: red;'), [named]),
    at('blocks/card.css', block('color: rgb(0 0 0);'), [functions]),
    at('blocks/card.css', block('color: hsl(10deg 20% 30%);'), [functions]),
    at('blocks/card.css', block('color: oklch(50% 0.1 200deg);'), [functions]),
    at(
        'blocks/card.css',
        block(
            'background: linear-gradient(90deg, #000 0 50%, transparent 50%);',
        ),
        [hex],
    ),
    at('blocks/card.css', block('background: var(--panel);')),
    at('blocks/card.css', block('background: transparent;')),
    at('blocks/card.css', block('border: 1px solid var(--line);')),
    at(
        'tokens.css',
        ':root {\n  --bg: #15171b;\n  --accent: rgb(71 189 244);\n  --alert: red;\n}',
    ),

    // Spacing, radii and type come from the tokens.
    at('blocks/card.css', block('padding: 12px;'), [values]),
    at('blocks/card.css', block('padding: var(--space-s) 18px;'), [values]),
    at('blocks/card.css', block('margin-block: 1rem;'), [values]),
    at('blocks/card.css', block('gap: 2px var(--space-m);'), [values]),
    at('blocks/card.css', block('gap: calc(var(--space-m) + 12px);'), [values]),
    at('blocks/card.css', block('top: 6px;'), [values]),
    at('blocks/card.css', block('padding: calc(var(--space-m) + 0.5rem);'), [
        values,
    ]),
    at('blocks/card.css', block('padding: calc(var(--space-m) + .5rem);'), [
        values,
    ]),
    at('blocks/card.css', block('padding: min(50svh, var(--space-m));'), [
        values,
    ]),
    at('blocks/card.css', block('padding: calc(var(--space-m) + 1lh);'), [
        values,
    ]),
    at('blocks/card.css', block('margin-inline: max(10cqw, 0px);'), [values]),
    at('blocks/card.css', block('margin-inline: calc(var(--space-m) - 5px);'), [
        values,
    ]),
    at('blocks/card.css', block('margin-inline: -1in;'), [values]),
    at('blocks/card.css', block('font: 700 17px Arial, sans-serif;'), [values]),
    at('blocks/card.css', block('font: inherit;')),
    at('blocks/card.css', block('padding: var(--space-2xl);')),
    at(
        'blocks/card.css',
        block('gap: calc(var(--space-2xl) + var(--space-3xs));'),
    ),
    at('blocks/card.css', block('border-radius: 12px;'), [values]),
    at('blocks/card.css', block('border-radius: 50%;'), [values]),
    at('blocks/card.css', block('font-size: 17px;'), [values]),
    at('blocks/card.css', block('font-weight: 700;'), [values]),
    at('blocks/card.css', block('font-family: Arial, sans-serif;'), [values]),
    at('blocks/card.css', block('--inset: 13px;'), [values]),
    at('composition.css', '.l-stack {\n  gap: 10px;\n}', [values]),
    at('utilities.css', '.u-pad {\n  padding: 4px;\n}', [values]),
    at('blocks/card.css', block('padding: var(--space-s) var(--space-m);')),
    at('blocks/card.css', block('margin: 0 auto;')),
    at(
        'blocks/card.css',
        block(
            'padding-inline: max(var(--space-m), env(safe-area-inset-left, 0px));',
        ),
    ),
    at(
        'blocks/card.css',
        block(
            'padding-block: var(--space-xl) calc(var(--ground-size) + var(--space-l));',
        ),
    ),
    at(
        'blocks/card.css',
        block('padding-inline: var(--space-m)\n    max(var(--space-m), 0px);'),
    ),
    at(
        'blocks/card.css',
        block('padding-inline: var(--space-m)\n    max(var(--space-m), 3px);'),
        [values],
    ),
    at('blocks/card.css', block('border-radius: var(--radius-m);')),
    at('blocks/card.css', block('font-size: var(--step-0);')),
    at('blocks/card.css', block('font-weight: var(--weight-bold);')),
    at('blocks/card.css', block('font-family: var(--font);')),
    at('blocks/card.css', block('--inset: var(--space-m);')),
    at(
        'tokens.css',
        ':root {\n  --space-m: 16px;\n  --radius-m: 12px;\n  --step-0: 18px;\n}',
    ),

    // Chrome 111, Safari 16.4 and Firefox 114 are the floor (the browserslist, tested below).
    at('blocks/card.css', '.card:has(a) {\n  display: grid;\n}', [browsers]),
    at('blocks/card.css', block('display: grid;')),
    // Nesting is lowered by Vite for the target, so it is allowed.
    at(
        'blocks/card.css',
        '.card {\n  & .card-title {\n    display: grid;\n  }\n}',
    ),
];

const failures: string[] = [];

for (const { path, code, rules = [] } of cases) {
    const { results } = await stylelint.lint({
        code,
        codeFilename: path,
        configFile,
    });
    const reported = (results[0]?.warnings ?? [])
        .map((warning) => warning.rule)
        .sort();

    try {
        assert.deepEqual(reported, [...rules].sort());
    } catch {
        failures.push(
            `${path}: expected [${rules.join()}], got [${reported.join()}]\n${code}`,
        );
    }
}

// The browserslist is the build target Vite resolves from 'baseline-widely-available'.
const queryName: Record<string, string> = { ios: 'ios_saf' };
const { target } = (
    await resolveConfig(
        { configFile: 'config/tools/vite.config.ts', logLevel: 'silent' },
        'build',
    )
).build;
const expectedBrowsers = (Array.isArray(target) ? target : [String(target)])
    .map((entry) => /^([a-z]+)([\d.]+)$/.exec(entry) ?? [])
    .map(
        ([, name = '', version = '']) =>
            `${queryName[name] ?? name} ${version}`,
    )
    .sort();
const browserslist = readFileSync('config/tools/browserslist', 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .sort();

if (JSON.stringify(browserslist) !== JSON.stringify(expectedBrowsers)) {
    failures.push(
        `config/tools/browserslist is ${browserslist.join(', ')}, not Vite's build target: ${expectedBrowsers.join(', ')}`,
    );
}

if (failures.length > 0) {
    console.error(`Stylelint rules failed:\n${failures.join('\n')}`);
    process.exitCode = 1;
} else {
    console.log(
        `${String(cases.length)} Stylelint rule cases and the browserslist pass.`,
    );
}
