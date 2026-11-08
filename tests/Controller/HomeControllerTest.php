<?php

declare(strict_types=1);

use App\Controller\HomeController;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

pest()->extend(WebTestCase::class);

covers(HomeController::class);

it('shows the name as the only heading of an English page', function (): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', '/');

    expect($client->getResponse()->getStatusCode())->toBe(200)
        ->and($crawler->filter('html')->attr('lang'))->toBe('en')
        ->and($crawler->filter('h1')->count())->toBe(1)
        ->and($crawler->filter('h1')->text())->toBe('Guillaume Erpeldinger');
});

it('loads the app entry and hands the page to the game controller', function (): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $crawler = $client->request('GET', '/');

    expect($crawler->filter('script[type="module"][src="/build/assets/app-4f3a9c1e.js"]')->count())->toBe(1)
        ->and($crawler->filter('main[data-controller="game"]')->count())->toBe(1);
});
