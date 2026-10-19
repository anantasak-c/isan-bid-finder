# Official source gate

## 2026-09-08: RSS route verified

The official RSS manual hosted at https://www.dcce.go.th/wp-content/uploads/2025/03/คู่มือ-RSS.pdf documents `deptId`, `deptsubId`, `methodId`, `anounceType`, and `announceDate` (Gregorian YYYYMMDD). Pages 5 and 8 document methods 15/16, announcement changes/cancellations, the 20-item ceiling, and `countbyday`.

Live checks:

- `deptId=2410101&anounceType=D0&methodId=16&announceDate=20260831`: one expected and returned project, 69079099908, published 2026-08-31.
- Nationwide `anounceType=D0&methodId=16&announceDate=20260907`: 879 expected, only 20 returned. A nationwide daily poll is insufficient.
- An empty result on 2026-01-15 is not proof that historical data is unavailable or complete.

`scripts/fetch-egp-rss.ps1` retrieves discovery records without credentials, decodes Windows-874, rejects DTDs, and reports per-query coverage. Example from the project directory:

```powershell
./scripts/fetch-egp-rss.ps1 -Date 2026-08-31 -AgencyIds 2410101 -Methods 16 -AnnouncementTypes D0
```

Exit code 2 means at least one failed, truncated, inconsistent, or unknown query. A complete query does not imply a complete agency registry or Isan coverage.

Production approach: establish a verified Isan agency/subagency registry, fetch per agency/date/method with overlap, persist announcement events keyed by project and announcement identity, apply D1/D2/W0 status changes, and enrich candidates from official PDFs before classifying with Gemini. Unresolved overflow must remain visible in coverage reporting. RSS publication dates do not establish a project's budget year. The PDF deadline and fiscal year must be independently verified.

The TypeScript collector is now wired into `syncTenders` when no CKAN tender resource is configured. `npm run sync:rss -- 2026-08-31` performs an explicit discovery run; the default date is yesterday in Bangkok. It stores query coverage and raw event evidence in `review_queue`. Registry coverage is currently **only Udon PAO**, not all Isan. Run records use `failed` with an explicit discovery-only explanation because the current database schema has no partial/discovery status; this preserves the last successful public snapshot. The cron route returns 503 for discovery-only results. Deployment and daily scheduler execution are not established by this code change. Deadline extraction, durable event consolidation, overlap/backfill, full agency coverage, and production publication remain pending.

The application intentionally refuses to infer that a tender is open from a historical contract row. Production ingestion is blocked until the configured official E-Bidding/E-Market resources are verified to expose, for each record:

- stable project or announcement identifier;
- title and procuring agency;
- one of the 20 Isan provinces;
- supported competitive method;
- announcement timestamp;
- bid-submission closing timestamp;
- direct official HTTPS announcement link.

Record the resource IDs, field mapping, upstream update frequency, and a timestamped sample in a new migration or source fixture. If a required field is absent, add a second authoritative source or keep the record out of `Open Opportunity`; never derive an open deadline from historical contract data.

## Investigation log

### 2026-09-07: rejected Data.go.th candidate

Dataset `opn00022` and resource `6fb3a07c-4649-422b-8329-a6be20abd17e` were inspected through the official Data.go.th CKAN catalog. Despite its E-Bidding title, the owning organization is the Government Pension Fund (กองทุนบำเหน็จบำนาญข้าราชการ), not a nationwide Comptroller General's Department feed. It is therefore rejected as the production source because it cannot cover all Isan agencies.

The nationwide production source remains unresolved. Before enabling production sync, verify an official e-GP endpoint or an explicitly licensed authoritative feed against every field above. Public search pages and individual e-GP announcement PDFs prove that source records exist, but they are not by themselves a stable, documented bulk API contract.
