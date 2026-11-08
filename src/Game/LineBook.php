<?php

declare(strict_types=1);

namespace App\Game;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Translation\TranslatorBagInterface;

/**
 * The lines the characters say, in one language, as the game's client reads them.
 *
 * The catalogue is the `lines` translation domain: a key is a pool of variants (a YAML list, which
 * Symfony flattens to `grab.0`, `grab.1`) or a single line. The messages stay ICU MessageFormat
 * for the client to format with the parameters only it knows.
 *
 * A key ending in a number is a list item: the catalogue test rejects any other, which this
 * grouping could not tell apart. The test groups the variants the same way.
 */
final readonly class LineBook
{
    public function __construct(
        #[Autowire(service: 'translator')]
        private TranslatorBagInterface $translations,
    ) {
    }

    /**
     * @return array{locale: string, pools: \ArrayObject<string, non-empty-list<string>>} pools: key => variants.
     *                                                                                    An ArrayObject, so that no line at all is `{}` in JSON, not `[]`
     */
    public function forLocale(string $locale): array
    {
        /** @var array<array-key, string> $messages */
        $messages = $this->translations->getCatalogue($locale)->all('lines');

        $pools = [];
        foreach ($messages as $key => $text) {
            $key = (string) $key;
            $pool = preg_match('/^(.*)\.\d+$/', $key, $parts) === 1 ? $parts[1] : $key;
            $pools[$pool][] = $text;
        }

        return [
            'locale' => $locale,
            'pools' => new \ArrayObject($pools),
        ];
    }
}
