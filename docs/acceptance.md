# Acceptance criteria

## Search quality

- Precision >= 95% and recall >= 90% on a versioned, human-labelled evaluation set.
- Open/closed status and closing timestamp must agree with the official announcement for every evaluation sample.
- Every visible result has a working official HTTPS source link.
- Records below 0.90 classification confidence or with ambiguous required fields remain outside search results.

## Performance

- Standard filtered search: p95 <= 1 second.
- Gemini-assisted natural-language search: p95 <= 3 seconds.
- Mobile first usable render: <= 2 seconds under the agreed test profile.
- Search remains functional without Gemini by falling back to literal text and explicit filters.

## Reliability and privacy

- A failed or empty source refresh cannot replace the latest successful snapshot.
- No Discovery Seed rows, company identities, or company-facing features exist in the production database or public bundle.
- The UI shows system sync time separately from source update time.
