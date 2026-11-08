type Primitive = string | number | boolean;

// A condition written as data: the fields it names must equal the given value, or be one of the
// values of a list. It names only fields holding a string, a number or a boolean.
export type Match<Fields> = {
    readonly [
        Name in keyof Fields as NonNullable<Fields[Name]> extends Primitive
            ? Name
            : never
    ]?: Fields[Name] | readonly NonNullable<Fields[Name]>[];
};

// True when every field of `match` holds. A field the source lacks never matches.
export const matches = (source: object, match: object): boolean =>
    Object.entries(match).every(([name, expected]) => {
        const actual: unknown = Object.hasOwn(source, name)
            ? (source as Record<string, unknown>)[name]
            : undefined;
        return Array.isArray(expected)
            ? expected.includes(actual)
            : actual === expected;
    });
