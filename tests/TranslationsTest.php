<?php

declare(strict_types=1);

use App\Kernel;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;
use Symfony\Component\Yaml\Yaml;

/**
 * @param array<array-key, mixed> $node
 *
 * @return list<string> the dotted keys of a catalogue, nested keys flattened
 */
function translationKeys(array $node, string $prefix = ''): array
{
    $keys = [];
    foreach ($node as $key => $value) {
        $path = $prefix === '' ? (string) $key : "{$prefix}.{$key}";
        $keys = [...$keys, ...(is_array($value) ? translationKeys($value, $path) : [$path])];
    }

    return $keys;
}

/**
 * @return list<string>
 */
function catalogueKeys(string $locale): array
{
    /** @var array<array-key, mixed> $catalogue */
    $catalogue = Yaml::parseFile(__DIR__ . "/../translations/messages.{$locale}.yaml");

    return translationKeys($catalogue);
}

it('has no key used by a template that a catalogue lacks', function (string $locale): void {
    $kernel = new Kernel('test', true);
    $kernel->boot();

    $tester = new CommandTester(new Application($kernel)->find('debug:translation'));
    $tester->execute([
        'locale' => $locale,
        '--only-missing' => true,
        '--domain' => 'messages',
    ]);
    $kernel->shutdown();

    expect($tester->getStatusCode())->toBe(0, $tester->getDisplay());
})->with(['fr', 'en']);

it('has the same keys in French and English', function (): void {
    $french = catalogueKeys('fr');
    $english = catalogueKeys('en');

    expect(array_values(array_diff($french, $english)))->toBe([], 'missing from messages.en.yaml')
        ->and(array_values(array_diff($english, $french)))->toBe([], 'missing from messages.fr.yaml');
});
