<?php

declare(strict_types=1);

use App\Controller\HomeController;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

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
