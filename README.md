# Sidetrack

Routes you around slow traffic near railroad crossings.

There is no public feed of live train or gate status in the US, so
Sidetrack infers a likely blockage by comparing current traffic speed
near a crossing to its normal free flow speed. It cannot tell a stopped
train from an accident or rush hour backup, so it labels the state as
"likely blocked" rather than claiming certainty.

## How it works

1. **Crossing locations** come from the FRA / BTS National Highway-Rail
   Crossing Inventory, a public ArcGIS FeatureServer maintained by the
   Federal Railroad Administration. No API key needed, `api/crossings.ts`
   proxies it and filters to the visible map area.
2. **Slowdown detection** polls TomTom's Traffic Flow API for each visible
   crossing and classifies it as clear, slow, or likely blocked based on
   the ratio of current speed to free flow speed.
3. **Rerouting** calls TomTom's Routing API with an avoidance rectangle
   drawn around every crossing currently flagged as likely blocked.

## Stack

Static frontend (Leaflet plus Web Components, Tailwind via CDN, no
build step), two TypeScript serverless functions, deployed on Vercel.
Same zero-dependency pattern as Rutetid and Sideline.

## Setup

```bash
npm install
cp .env.example .env.local
# add your TomTom API key to .env.local
npm run dev
```

`npm run dev` runs `vercel dev`, which serves the static files in
`public/` and the functions in `api/` together.

## Testing

```bash
npm test
```

Unit tests cover the pure logic in each API function (bbox parsing,
slowdown classification, avoidance rectangle math) without hitting any
network calls.

## Known limitations

- Freight rail has no public real-time position data. A slowdown near a
  crossing is a proxy for a blocked crossing, not a confirmed one.
- TomTom's free tier caps at 2500 requests/day. The frontend batches and
  caches traffic lookups to stay well under that for casual use, but a
  busy viewport with many crossings visible at once will burn through
  it faster.
- The FRA crossing dataset occasionally has crossings with placeholder
  coordinates (0,0) when the reported location fell outside the US or
  its state. These are rare but not filtered out here.

## Possible next steps

- Crowdsourced reports (tap "train here") to catch blockages traffic
  data misses, especially in low-traffic areas where speed alone is a
  weak signal.
- Persist recently seen blockages so repeat commuters get a heads up
  before they are already stuck.
