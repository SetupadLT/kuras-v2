<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Service\MarketData\OfficialMarketDataParser;
use PHPUnit\Framework\TestCase;

final class OfficialMarketDataParserTest extends TestCase
{
    public function testItParsesOrlenFuelSeries(): void
    {
        $html = (string) file_get_contents(dirname(__DIR__) . '/Fixtures/orlen_market_prices.html');
        $series = (new OfficialMarketDataParser())->parseOrlen($html);

        self::assertSame(['date' => '2026-09-15', 'value' => 1.836], $series['pb95'][1]);
        self::assertSame(['date' => '2026-09-14', 'value' => 2.13], $series['diesel'][0]);
    }

    public function testItParsesDailyBrentValuesAcrossAWeek(): void
    {
        $html = (string) file_get_contents(dirname(__DIR__) . '/Fixtures/eia_brent_prices.html');
        $series = (new OfficialMarketDataParser())->parseBrent($html);

        self::assertSame(['date' => '2026-09-01', 'value' => 96.02], $series[0]);
        self::assertSame(['date' => '2026-09-09', 'value' => 109.51], $series[array_key_last($series)]);
    }
}
