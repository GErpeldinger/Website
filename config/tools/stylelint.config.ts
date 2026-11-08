import { readFileSync } from 'node:fs';
import type { Config } from 'stylelint';

// The CSS conventions of docs/architecture.md (CUBE CSS): the layers are the files of
// assets/styles/, and tests/stylelint/rules.ts proves each rule here can fail.
//
// A file is in a layer by its place (assets/styles/app.css imports it into that layer):
//   reset.css, elements.css  reset: no class, element selectors only
//   tokens.css               tokens: the only place for raw colours, sizes and spacing
//   composition.css          composition: l-* classes
//   utilities.css            utilities: u-* classes
//   blocks/*.css             blocks: plain kebab-case classes
//   exceptions.css           exceptions: state, only through a data attribute
//
// The `files` globs of the overrides are relative to this file, hence the ../../.

const browsers = readFileSync(new URL('browserslist', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'));

const kebab = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
// A block's class is never a composition or utility prefix, and never a state: that is a data attribute.
const block = new RegExp(`^(?!(?:l|u|is|has)-)${kebab}$`);

// A length is spelled once, in a token. Zero, `auto` and `var(--token)` are left; a calc, min,
// max or clamp is left when it holds no other length: any non-zero number followed by a unit
// (or %) fails. A digit inside a name (`--space-2xl`) is not a number: it follows a letter or a
// hyphen that follows a letter.
const noLength =
    '(?!.*(?<![\\w.]|[a-z]-)(?:\\d*\\.\\d*[1-9]\\d*|[1-9]\\d*(?:\\.\\d+)?)(?:[a-z]+|%))';
const token = `var\\(--[a-z0-9-]+\\)`;
const operand = `(?:0|auto|${token}|(?:calc|min|max|clamp)\\(.+\\)|env\\(.+\\))`;
// Prettier may wrap a long value over several lines, hence the `s` flag and the \s.
const tokensOnly = new RegExp(
    `^${noLength}${operand}(?:\\s+${operand})*$`,
    'si',
);
const tokenOrKeyword = new RegExp(`^(?:${token}|inherit|0)$`);

const colours = [
    '/^(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?$/',
    'device-cmyk',
];

const config: Config = {
    extends: ['stylelint-config-standard'],
    plugins: ['stylelint-no-unsupported-browser-features'],
    rules: {
        'plugin/no-unsupported-browser-features': [
            true,
            {
                browsers,
                // clip-path and masks: reported as partial for shape types we don't use
                // (`inset()` is supported). Nesting: Vite lowers it for the build target.
                ignore: ['css-clip-path', 'css-masks', 'css-nesting'],
            },
        ],

        // No ID selector, and nothing but a data attribute to read a state from.
        'selector-max-id': 0,
        'selector-attribute-name-disallowed-list': ['/^(?!data-)/'],

        // Colours, lengths, radii and type come from the tokens (tokens.css is exempt below).
        'color-no-hex': true,
        'color-named': 'never',
        'function-disallowed-list': colours,
        'declaration-property-value-allowed-list': {
            '/^(?:margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left)(?:-|$)/':
                [tokensOnly],
            '/^--/': [tokensOnly],
            '/^(?:border(?:-.+)?-radius|font|font-size|font-weight|font-family)$/':
                [tokenOrKeyword],
        },

        // Classes are named by the layer of their file, below.
        'selector-class-pattern': block,
    },
    overrides: [
        {
            files: ['../../assets/styles/{reset,elements,tokens}.css'],
            rules: { 'selector-max-class': 0 },
        },
        {
            files: [
                '../../assets/styles/elements.css',
                '../../assets/styles/reset.css',
            ],
            rules: { 'selector-attribute-name-disallowed-list': null },
        },
        {
            // The @font-face rules name the family and the weights they declare.
            files: ['../../assets/styles/fonts.css'],
            rules: { 'declaration-property-value-allowed-list': null },
        },
        {
            files: ['../../assets/styles/tokens.css'],
            rules: {
                'color-no-hex': null,
                'color-named': null,
                'function-disallowed-list': null,
                'declaration-property-value-allowed-list': null,
            },
        },
        {
            files: ['../../assets/styles/composition.css'],
            rules: {
                'selector-class-pattern': new RegExp(`^l-${kebab}$`),
            },
        },
        {
            files: ['../../assets/styles/utilities.css'],
            rules: {
                'selector-class-pattern': new RegExp(`^u-${kebab}$`),
            },
        },
        {
            // State is a data attribute: every selector holds one.
            files: ['../../assets/styles/exceptions.css'],
            rules: {
                // Each selector of a list on its own: `.a[data-x], .a` must fail.
                'selector-disallowed-list': [
                    ['/^(?!.*\\[data-)/'],
                    { splitList: true },
                ],
            },
        },
    ],
};

export default config;
