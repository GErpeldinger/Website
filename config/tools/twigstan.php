<?php

declare(strict_types=1);

use TwigStan\Config\TwigStanConfig;
use TwigStan\Error\IgnoreError;

$root = dirname(__DIR__, 2);

return TwigStanConfig::configure($root)
    ->reportUnmatchedIgnoredErrors(true)
    ->tempDirectory($root . '/var/twigstan')
    ->phpstanBinPath($root . '/vendor/bin/phpstan')
    ->phpstanConfigurationFile(__DIR__ . '/twigstan.neon')
    ->twigEnvironmentLoader(__DIR__ . '/twigstan-loader.php')
    ->twigPaths($root . '/templates')
    ->phpPaths($root . '/src')
    // The dead code detector, loaded with every PHPStan extension, reads the members Twig
    // generates in each compiled template as unused: Twig calls them by reflection.
    ->ignoreErrors(
        IgnoreError::identifier('shipmonk.deadMethod'),
        IgnoreError::identifier('shipmonk.deadProperty.neverRead'),
    )
    ->create();
