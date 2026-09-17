# Wholesale and crude-oil source assessment

The public application must not present third-party market values as live or
comparable until the source is machine-readable, licensed for republication,
timestamped, and covered by validation tests.

## Confirmed sources

- **LEA retail prices** remain the primary station-level source.
- **ORLEN Lietuva wholesale reference** is read from ORLEN's public historical
  table. It provides A95 and diesel prices in EUR/l for one-off transactions
  loaded into road transport at the OKSETA terminal in Kaunas. It is shown as a
  separate reference and never labelled as a station margin.
- **Brent crude** is read from the official U.S. Energy Information
  Administration daily Europe Brent Spot Price FOB history. It is shown in
  USD/barrel and on its own scale. EIA permits reuse of its public-domain data
  with source acknowledgement.

All three values have visibly different labels, units, dates and source links.
They are not plotted on a shared axis because that would imply a comparison the
data does not support.

## Integration gate

Keep wholesale or Brent values published only while all of the following remain
available:

1. an official, stable HTTPS page, API or downloadable file;
2. explicit permission to store and republish the values;
3. timestamp, currency, unit and product-grade metadata;
4. retry, validation and last-known-good behavior matching the LEA pipeline;
5. fixtures and tests for missing, delayed and structurally changed responses.

The UI therefore uses a separate “Rinkos kontekstas” block. Retail, wholesale
and crude-oil series remain on clearly labelled, independent scales and the
copy never implies that they are directly equivalent prices.
