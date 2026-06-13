# 0008 — We swapped location theater for a real, fail-closed geo-fence

**Date:** 2026-06-13

## What happened
The handed-over H\RNESS demo "checked" where a request came from by reading a location the *client* put in the request — which means anyone could type whatever country they wanted. We deleted that and built a real check: H\RNESS now decides allow/deny from the network address it actually observes, refuses anything it can't place (fail-closed), and runs the check before anything else. That finishes the v1 build (all six steps).

## The story

This is the same lesson as [entry 0005](0005-we-caught-our-own-flagship-faking-it.md), one layer down. A "security check" that trusts a value the attacker controls isn't a check — it's theater. The old code let the client *assert* its own location. That's like a bouncer who asks you to fill in your own age on a sticky note.

The honest version: you check the one thing the visitor can't freely fake — the network address your server actually sees them connect from. So H\RNESS now:
- reads the **server-observed** connecting address (not a client claim),
- looks the country up in an offline database the operator installs,
- applies an allow-list or deny-list of countries,
- and — the important part — **fails closed**: if it can't determine the country, the request is denied, not waved through.

Two real-world wrinkles we handled honestly:
1. **Proxies.** Most production setups sit behind a load balancer, so the "connecting address" is the balancer, not the user. The standard fix is a header (`X-Forwarded-For`) the balancer adds. But that header is just text — anyone can send it. So H\RNESS trusts it **only** when the connection comes from a proxy address the operator explicitly listed. From anyone else, the header is ignored. A test proves a direct attacker sending a forged header can't fake their origin.
2. **The database.** We do **not** ship the location database. MaxMind's license forbids redistributing it and the access keys expire every 90 days, so the operator supplies their own copy. H\RNESS just reads it.

## The numbers

- **Before → after:** origin from a **client-asserted** value (freely forgeable) → the **server-observed** connecting address (can't be forged at the network layer).
- **Fail-closed, proven:** unknown country, missing address, and missing database each → **denied** (three separate tests).
- **Spoof-proofed:** a test confirms a direct client sending a fake `X-Forwarded-For` does **not** override its real address.
- **Runs first:** the gate returns a 403 *before* authentication or any upstream work — the cheapest possible rejection.
- **Tests: 80 → 100** passing (20 added across the geo lookup, the region policy, the gate, and the request path). `cargo test` reproduces it.
- **6 of 6** build steps done. **0** clippy/formatting warnings. Committed: two real commits now back the whole v1.

## The lesson

**A real security control checks what the attacker can't choose — and states out loud what it can't do.** Trusting client-supplied location is theater; using the server-observed address is real. But we're equally clear on the limit: **IP location is a coarse fence, not forensic proof.** A VPN or Tor defeats it. It's the right tool for compliance boundaries and shrinking blast radius — and the wrong tool if you claim it proves where someone truly is. Naming that limit is part of shipping it honestly.

## Good & bad

**Good:** The fake location check is gone, replaced by one that reads an address the client can't forge, fails closed, and resists header spoofing — all proven by tests. The whole v1 (six steps: skeleton, real auth, live provider, cross-vendor translation, invisible failover, origin gate) is now built and green.

**Bad / the honest limits:**
- **Coarse, not forensic.** A VPN or Tor moves your apparent country in seconds. This gate reduces risk; it does not prove identity or true location. We won't market it as more than it is.
- **Only as good as the database.** Country-level lookups are accurate-ish; finer claims (city, "this exact user") are not, and we don't make them.

**Bottom line:** the bouncer stopped reading sticky notes and started looking at the door — and we told you exactly when that door can still be walked around. v1 is built; next we measure how well the *quality* of the failover holds up under real load.
