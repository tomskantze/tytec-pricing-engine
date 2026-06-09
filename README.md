# Tytec Pricing Engine

Standalone Telesol pricing and invoice-prep workspace extracted from the ERP pricing flow.

## Run

```sh
npm install
npm run dev
```

For the desktop shell, build first and then run Electron:

```sh
npm run build
npm run electron
```

## Report Import

The importer accepts CSV, TSV, or JSON arrays. It maps common report columns for ticket,
service date, city, country, on-site/off-site timestamps, consumables, report status,
customer reference, technician, and summary.

Jobs that cannot be matched to the Telesol rate card, have invalid timestamps, or need a
manual cancellation decision are flagged in the manual calculations table.

All source files are kept under 300 lines and `npm run build` enforces that limit.
