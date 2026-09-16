# Wholesale and crude-oil source assessment

The public application must not present third-party market values as live or
comparable until the source is machine-readable, licensed for republication,
timestamped, and covered by validation tests.

## Current decision

- **LEA retail prices** remain the only published numeric source. They are the
  official Lithuanian station-level data and include a source timestamp.
- **ORLEN Lietuva wholesale prices** are not imported yet. The public page is a
  browser-oriented viewer and no stable, documented machine-readable feed has
  been confirmed for this project.
- **Brent crude prices** are not imported from display websites. The proposed
  pages are third-party market pages, not a confirmed licensed API contract.

This is intentional: scraping a visual page would be brittle and could silently
mix different currencies, units, delays, or licensing terms with LEA retail
prices.

## Integration gate

Add wholesale or Brent values only after all of the following are available:

1. a documented HTTPS API or versioned downloadable file;
2. explicit permission to store and republish the values;
3. timestamp, currency, unit and product-grade metadata;
4. retry, validation and last-known-good behavior matching the LEA pipeline;
5. fixtures and tests for missing, delayed and structurally changed responses.

When those conditions are met, the UI can add a separate “Rinkos kontekstas”
chart. It must keep retail, wholesale and crude-oil series on clearly labelled
axes and must never imply that they are directly equivalent prices.

