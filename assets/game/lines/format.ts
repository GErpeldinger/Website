// The parameters a line can take, by name. A number is written in the language of the line.
export type LineParams = Readonly<Record<string, string | number>>;

// ICU MessageFormat, the subset the lines need: {name}, {name, select, ...} and
// {name, plural, ...} with `#`, nested at will. Apostrophes follow ICU's default mode: one quotes
// only before a brace (or `#` in a plural), and `''` is an apostrophe. Anything else is refused
// rather than guessed, so the server's translator and this one never read a line differently.
export const formatLine = (
    message: string,
    params: LineParams,
    locale: string,
): string => {
    const numbers = new Intl.NumberFormat(locale);
    const plurals = new Intl.PluralRules(locale);
    let at = 0;

    const fail = (what: string): never => {
        throw new Error(`${what}. The line is "${message}".`);
    };
    // `charAt` is '' past the end, which none of these patterns matches: no bound to check.
    const skipSpaces = (): void => {
        while (/\s/u.test(message.charAt(at))) {
            at += 1;
        }
    };
    const readName = (): string => {
        const start = at;
        while (/[^\s,{}]/u.test(message.charAt(at))) {
            at += 1;
        }
        return message.slice(start, at);
    };
    // The next character: a message that ends here has an unclosed brace.
    const peek = (): string => message[at] ?? fail('Expected a closing brace');
    const expect = (character: string): void => {
        skipSpaces();
        if (peek() !== character) {
            fail(`Expected "${character}"`);
        }
        at += 1;
    };
    const value = (name: string): string | number =>
        (Object.hasOwn(params, name) ? params[name] : undefined) ??
        fail(`The line parameter "${name}" is missing`);

    // Between apostrophes: up to the closing one, or the end of the message.
    const quoted = (): string => {
        let text = '';
        at += 1;
        for (let c = message[at]; c !== undefined; c = message[at]) {
            if (c === "'") {
                if (message[at + 1] !== "'") {
                    break;
                }
                at += 1;
            }
            text += c;
            at += 1;
        }
        at += 1;
        return text;
    };

    // `active` is false while skipping the cases a parameter did not choose: they are read for
    // their structure, and need none of the parameters. What they would say is discarded.
    const parse = (
        nested: boolean,
        plural: number | undefined,
        active: boolean,
    ): string => {
        let out = '';
        for (
            let character = message[at];
            character !== undefined;
            character = message[at]
        ) {
            const next = message[at + 1];
            if (character === "'" && next === "'") {
                out += "'";
                at += 2;
            } else if (
                character === "'" &&
                (next === '{' ||
                    next === '}' ||
                    (plural !== undefined && next === '#'))
            ) {
                out += quoted();
            } else if (character === '{') {
                at += 1;
                out += argument(plural, active);
            } else if (character === '}') {
                if (nested) {
                    return out;
                }
                fail('Unexpected "}"');
            } else if (character === '#' && plural !== undefined) {
                out += numbers.format(plural);
                at += 1;
            } else {
                out += character;
                at += 1;
            }
        }
        return nested ? fail('Expected a closing brace') : out;
    };

    // The cases of a select or a plural: where each message starts, to be read again once chosen.
    const cases = (plural: number | undefined): Map<string, number> => {
        const found = new Map<string, number>();
        for (;;) {
            skipSpaces();
            if (peek() === '}') {
                at += 1;
                return found;
            }
            const selector = readName();
            if (selector === '') {
                fail('Expected a case name');
            }
            expect('{');
            found.set(selector, at);
            parse(true, plural, false);
            at += 1;
        }
    };

    const choose = (
        found: Map<string, number>,
        keys: string[],
        none: string,
    ): number => {
        for (const key of keys) {
            const start = found.get(key);
            if (start !== undefined) {
                return start;
            }
        }
        return fail(none);
    };

    const argument = (plural: number | undefined, active: boolean): string => {
        skipSpaces();
        const name = readName();
        if (name === '') {
            fail('Expected an argument name');
        }
        skipSpaces();
        if (peek() === '}') {
            at += 1;
            if (!active) {
                // Stryker disable next-line StringLiteral: the text of a skipped case is discarded
                return '';
            }
            const given = value(name);
            return typeof given === 'number' ? numbers.format(given) : given;
        }
        expect(',');
        skipSpaces();
        const type = readName();
        if (type !== 'plural' && type !== 'select') {
            fail(`The argument type "${type}" is not supported`);
        }
        expect(',');

        const isPlural = type === 'plural';
        const given = active ? value(name) : 0;
        if (isPlural && typeof given !== 'number') {
            fail(`The plural parameter "${name}" must be a number`);
        }
        // `#` is the plural's own: a select inside it keeps the character, as ICU does.
        const count = isPlural ? Number(given) : undefined;
        const found = cases(count);
        const end = at;
        if (!active) {
            // Stryker disable next-line StringLiteral: the text of a skipped case is discarded
            return '';
        }
        const text = String(given);
        const start = isPlural
            ? choose(
                  found,
                  [`=${text}`, plurals.select(Number(given)), 'other'],
                  `The plural "${name}" has no case for ${text} and no "other"`,
              )
            : choose(
                  found,
                  [text, 'other'],
                  `The select "${name}" has no case "${text}" and no "other"`,
              );
        at = start;
        const chosen = parse(true, count, true);
        at = end;
        return chosen;
    };

    return parse(false, undefined, true);
};
