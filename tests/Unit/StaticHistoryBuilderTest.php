<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Service\StaticHistoryBuilder;
use PHPUnit\Framework\TestCase;

final class StaticHistoryBuilderTest extends TestCase
{
    public function testItAddsDailyAggregatesAndReplacesTheSameDate(): void
    {
        $previous = ['days' => [[
            'date' => '2026-08-30',
            'fuels' => ['pb95' => ['minimum' => 9.999]],
        ]]];
        $current = [
            'source' => ['source_date' => '2026-08-30'],
            'summary' => ['fuels' => ['pb95']],
            'stations' => [
                ['id' => 'a', 'brand' => 'A', 'address' => 'A g. 1', 'city' => 'Vilnius', 'municipality' => 'Vilniaus m. sav.', 'prices' => ['pb95' => 1.599]],
                ['id' => 'b', 'brand' => 'B', 'address' => 'B g. 1', 'city' => 'Kaunas', 'municipality' => 'Kauno m. sav.', 'prices' => ['pb95' => 1.499]],
            ],
        ];

        $history = (new StaticHistoryBuilder())->update($previous, $current);

        self::assertCount(1, $history['days']);
        self::assertSame(1.499, $history['days'][0]['fuels']['pb95']['minimum']);
        self::assertEqualsWithDelta(1.549, $history['days'][0]['fuels']['pb95']['average'], 0.000001);
        self::assertSame(1.599, $history['days'][0]['fuels']['pb95']['maximum']);
        self::assertSame('B', $history['days'][0]['fuels']['pb95']['winner']['brand']);
        self::assertSame(2, $history['schema_version']);
        self::assertSame('Kauno m. sav.', $history['stations']['b']['municipality']);
        self::assertSame(1.499, $history['days'][0]['station_prices']['b']['pb95']);
    }
}
