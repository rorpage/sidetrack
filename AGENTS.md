# AGENTS.md

Session history and decisions for Sidetrack. CLAUDE.md points here.

## Conventions

- No em dashes anywhere: code, comments, docs, commit messages. Use
  commas, colons, semicolons, or rewritten sentences instead.
- Keep README and this file updated whenever a meaningful decision is
  made, not just when code changes.
- Include unit tests for logic that can be tested without a network
  call (parsing, classification thresholds, math).
- Document code well, especially anything that encodes a real-world
  assumption (like the slowdown thresholds below).

## Decisions

**Crossing data source.** Went with the FRA / BTS ArcGIS FeatureServer
(NTAD_Railroad_Grade_Crossings) instead of downloading and bundling the
full CSV inventory. It is public domain, needs no API key, supports
bounding box queries and GeoJSON output directly, and is always current
since the FRA maintains it. This also means the app never needs a
static crossings dataset checked into the repo.

**No live gate/train data.** There is no public national feed for this
in the US. Considered building a crowdsourced reporting layer (Waze
style) as a v2 addition. For v1, went with traffic-speed inference:
compare current speed to free flow speed near each crossing via
TomTom's Traffic Flow API.

**Slowdown thresholds.** ratio = currentSpeed / freeFlowSpeed.
- ratio >= 0.7: clear
- 0.35 to 0.7: slow
- < 0.35: likely_blocked

These are a starting guess, not calibrated against real blocked
crossing data yet. If false positives turn out to be common (rush hour
getting flagged as "likely blocked"), tighten the lower threshold or
factor in time of day.

**Routing provider.** TomTom for both traffic and routing, since one
API key covers both and its Routing API supports avoidAreas rectangles
natively, which OSRM's public demo server does not support for
arbitrary polygons.

**Avoidance box size.** 0.0015 degrees in each direction, roughly 150
meters. Large enough to force a real detour, small enough not to
exclude an entire neighborhood over one crossing.

## Open questions for next session

- Should "likely blocked" crossings persist for a few minutes after
  they clear, to avoid a route flapping back through a crossing that
  is still backed up right after the gate lifts?
- Worth adding a manual "report a train here" button for areas where
  traffic speed alone is too noisy a signal (rural crossings with low
  traffic volume)?
- No tests hit the live FRA or TomTom endpoints. Worth adding a mocked
  integration test if the API response shape ever changes unexpectedly.
