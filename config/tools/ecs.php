<?php

declare(strict_types=1);

use PhpCsFixer\Fixer\Strict\DeclareStrictTypesFixer;
use Symplify\EasyCodingStandard\Config\ECSConfig;

/** @var array{paths: list<string>, skip: list<string>} $scope */
$scope = require __DIR__ . '/paths.php';

return ECSConfig::configure()
    ->withPaths($scope['paths'])
    ->withSkip($scope['skip'])
    // Under .cache/, which survives `docker compose run --rm` and CI runs; the default is the temp dir.
    ->withCache(__DIR__ . '/../../.cache/ecs')
    ->withPreparedSets(psr12: true, common: true)
    ->withRules([DeclareStrictTypesFixer::class]);
