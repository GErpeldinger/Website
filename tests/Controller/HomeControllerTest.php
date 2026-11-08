<?php

declare(strict_types=1);

use App\Controller\HomeController;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\DomCrawler\Crawler;

pest()->extend(WebTestCase::class);

covers(HomeController::class);

it('shows the name as the only heading, in each language', function (string $locale): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', "/{$locale}/");

    expect($client->getResponse()->getStatusCode())->toBe(200)
        ->and($crawler->filter('html')->attr('lang'))->toBe($locale)
        ->and($crawler->filter('h1')->count())->toBe(1)
        ->and($crawler->filter('h1')->text())->toBe('Guillaume Erpeldinger')
        ->and($crawler->filter('title')->text())->toBe('Guillaume Erpeldinger');
})->with(['fr', 'en']);

it('points the canonical link at itself and hreflang at each language', function (string $locale): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', "/{$locale}/");

    expect($crawler->filter('link[rel="canonical"]')->attr('href'))->toBe("http://localhost/{$locale}/")
        ->and($crawler->filter('link[rel="alternate"][hreflang="fr"]')->attr('href'))->toBe('http://localhost/fr/')
        ->and($crawler->filter('link[rel="alternate"][hreflang="en"]')->attr('href'))->toBe('http://localhost/en/')
        ->and($crawler->filter('link[rel="alternate"][hreflang="x-default"]')->attr('href'))->toBe('http://localhost/')
        ->and($crawler->filter('link[rel="alternate"]')->count())->toBe(3);
})->with(['fr', 'en']);

it('loads the app entry and hands the page to the game controller', function (): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', '/en/');

    expect($crawler->filter('script[type="module"][src="/build/assets/app-4f3a9c1e.js"]')->count())->toBe(1)
        ->and($crawler->filter('main[data-controller="game"]')->count())->toBe(1);
});

it('restricts the route to exactly the enabled locales', function (): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    /** @var list<string> $locales */
    $locales = $client->getContainer()->getParameter('kernel.enabled_locales');

    expect($client->getContainer()->getParameter('app.locales_pattern'))->toBe(implode('|', $locales));
});

it('answers 404 for a language the site does not have', function (string $path): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $client->request('GET', $path);

    expect($client->getResponse()->getStatusCode())->toBe(404);
})->with(['/de/', '/it/', '/english/']);

it('reads the name as real text, a span per letter', function (string $locale): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', "/{$locale}/");
    $h1 = $crawler->filter('h1');
    $letters = $h1->filter('[data-physics="letter"]')->each(static fn (Crawler $letter): string => $letter->text());

    expect($h1->text())->toBe('Guillaume Erpeldinger')
        ->and($h1->attr('aria-label'))->toBeNull()
        ->and($h1->filter('[aria-hidden]')->count())->toBe(0)
        ->and(implode('', $letters))->toBe('GuillaumeErpeldinger');
})->with(['fr', 'en']);

it('shows every piece of content, in each language', function (string $locale, array $texts): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', "/{$locale}/");
    $page = $crawler->filter('main')->text();

    foreach ($texts as $text) {
        expect($page)->toContain($text);
    }
})->with([
    'fr' => ['fr', [
        'Bonjour, je suis', 'Développeur web', '[VOTRE PHOTO',
        '[VOTRE PRÉSENTATION : deux ou trois phrases sur votre expérience.]',
        'Le chantier, en direct', 'Bombes', 'Tornades', 'Lancers', 'Réparations', 'En ligne',
    ]],
    'en' => ['en', [
        "Hi, I'm", 'Web developer', '[YOUR PHOTO',
        '[YOUR INTRO: two or three sentences about your experience.]',
        'The site, live', 'Bombs', 'Tornadoes', 'Throws', 'Repairs', 'Online',
    ]],
]);

it('links to LinkedIn and GitHub from a navigation', function (string $locale): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', "/{$locale}/");
    $links = $crawler->filter('nav a')->each(static fn (Crawler $link): ?string => $link->attr('href'));

    expect($crawler->filter('nav')->count())->toBe(1)
        ->and($links)->toBe([
            'https://www.linkedin.com/in/guillaumeerpeldinger/',
            'https://github.com/GErpeldinger',
        ]);
})->with(['fr', 'en']);

it('presents the live board as a titled section of five counters', function (string $locale): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', "/{$locale}/");
    $board = $crawler->filter('main section');
    $values = $board->filter('dd')->each(static fn (Crawler $value): string => $value->text());

    expect($board->count())->toBe(1)
        ->and($board->attr('aria-labelledby'))->toBe('board-title')
        ->and($board->filter('h2')->attr('id'))->toBe('board-title')
        ->and($board->filter('dl > div > dt')->count())->toBe(5)
        ->and($values)->toBe(['—', '—', '—', '—', '—']);
})->with(['fr', 'en']);

it('uses only known physics values, and properties only on bodies', function (string $locale): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', "/{$locale}/");
    $properties = [
        'data-grabbable' => ['true', 'false'],
        'data-hangable' => ['true', 'false'],
        'data-breakable' => ['true', 'false'],
        'data-weight' => ['light', 'medium', 'heavy'],
    ];

    $bodies = $crawler->filter('[data-physics]')->each(static fn (Crawler $body): Crawler => $body);
    expect($bodies)->not->toBeEmpty();

    foreach ($bodies as $body) {
        expect($body->attr('data-physics'))->toBeIn(['letter', 'block', 'link']);
        foreach ($properties as $name => $allowed) {
            if ($body->attr($name) !== null) {
                expect($body->attr($name))->toBeIn($allowed);
            }
        }
    }

    foreach (array_keys($properties) as $name) {
        expect($crawler->filter("[{$name}]:not([data-physics])")->count())->toBe(0, "{$name} outside a body");
    }
})->with(['fr', 'en']);

it('marks the letters, the links and the content blocks as bodies', function (): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', '/en/');

    expect($crawler->filter('h1 [data-physics="letter"]')->count())->toBe(20)
        ->and($crawler->filter('nav a[data-physics="link"]')->count())->toBe(2)
        ->and($crawler->filter('main [data-physics="block"]')->count())->toBe(5);
});
