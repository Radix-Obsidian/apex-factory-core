<!--
CANONICAL SOURCE OF TRUTH for the waimd-housing SKU. Verbatim founder PRD as sent 2026-07-31.
Supersedes the D25 reconstruction (see DECISIONS.md D26 for the deltas that reconstruction got wrong).
Do not paraphrase, "improve", or re-scope this file — it is the constitution the build implements.
Derived artifacts: BUILD-CHECKLIST.md (the loop's acceptance list) and registry_entry.json.
-->

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOCO OS — STATE BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT PHASE       : Phase Zero — context lock + paid-demand design
DECISIONS LOCKED    : Travel nurses only; accepted assignments only; software-first; $0 housing inventory; WAIMD.org; outcome over marketplace
ACTIVE WORKSTREAM   : Turn a confirmed travel-nurse assignment into a confident housing decision
NEXT DECISION GATE  : Founder approves PRD + authorizes maximum $70 Meta validation spend
SCOPE CREEP STATUS  : 🟢 One ICP, one painful moment, one outcome
FALSIFIABLE METRIC  : 10 qualified Housing Missions → ≥3 paid Housing Decisions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WAIMD.org

WAIMD = Work Assignment. Instant Move Decision.

Pronounced roughly "way-med."

That is unusually good for what we're building:

Work
Assignment
Instant
Move
Decision

The name itself describes the machine:

> Assignment in → move decision out.

And importantly, WAIMD is not another housing marketplace.

It is a decision engine for travel nurses with confirmed assignments.

---

# WAIMD — ZERO-TO-ONE PRD

Version 0.1 — July 2026

## 0. The Contrarian Thesis

Most housing products assume the user wants:

> more inventory + better search + more filters.

We believe that assumption is wrong for this user.

A travel nurse who has already accepted an assignment does not fundamentally want to search housing.

They want to know:

> "Where should I live for this assignment without getting screwed?"

Existing systems optimize discovery.

WAIMD optimizes decision.

Furnished Finder already has 150,000+ furnished rentals and says more than 100,000 travel nurses and other professionals use its ecosystem. It has also added its own AI-powered search. Trying to beat it by aggregating more listings would therefore be attacking its strongest dimension.

We attack the layer after search.

---

## 1. Monopoly Wedge

We do not serve:

digital nomads

corporate travelers

physicians

students

military members

relocating families

vacation travelers

landlords

Even though eventually many could use the underlying technology.

Furnished Finder itself has expanded beyond travel nurses into many of those categories.

WAIMD intentionally goes in the opposite direction.

### ICP

> A U.S. travel nurse who has accepted a temporary hospital assignment, starts within 30 days, and has not secured housing.

That is the monopoly seed.

Not:

> "People needing furnished housing."

---

## 2. Trigger Event

Everything begins with one event:

The nurse accepts the assignment.

That produces several hard constraints immediately:

Facility
City
Start date
End date
Pay package / housing budget
Vehicle status
Commute tolerance
Pets
Housing type
Required amenities

That's valuable because the problem becomes computationally bounded.

We're not answering:

> "Where should I move someday?"

We're answering:

> "Where should I live from August 17 through November 16 while working at Banner University Medical Center for ≤$1,800/month?"

That is a solvable problem.

---

## 3. Evidence That the Problem Exists

Current complaints are remarkably close to the exact problem WAIMD addresses.

A travel nurse posting this week said they sent 15 Furnished Finder inquiries, got three responses, and learned that supposedly available units were already rented. They ultimately found housing through a local Facebook group. That's anecdotal evidence, but it's extremely relevant behavior.

Another nurse currently reports being only 10 days from an assignment start while still unable to find housing and considering canceling the contract.

Others describe price, upfront-payment, temporary-housing and availability problems around new assignments.

That gives us a sharper problem than simply:

> "Housing search sucks."

It is:

> Housing uncertainty threatens the economics and execution of an already-accepted work contract.

That's painful.

---

## 4. The Job To Be Done

> Before my first shift, tell me which three places actually fit my assignment and why I should choose one.

### WAIMD success state

The nurse moves from:

Accepted assignment + housing anxiety

to:

three defensible housing choices + evidence + clear next action.

---

## 5. The Product Equation

This is the entire company at V0:

```
CONFIRMED ASSIGNMENT
        +
HARD HOUSING CONSTRAINTS
        +
CURRENT HOUSING EVIDENCE
        ↓
3 VIABLE OPTIONS
        ↓
1 MOVE DECISION
```

Everything that doesn't improve that transformation gets deleted.

---

## 6. The Core Object: Housing Mission

Every customer produces exactly one structured object.

```yaml
mission_id: WAIMD-0001

traveler:
  profession: RN
  contract_status: accepted

assignment:
  facility: Banner University Medical Center
  city: Phoenix
  start_date: 2026-08-17
  end_date: 2026-11-16

housing:
  max_monthly_budget: 1800
  accommodation: entire_place
  max_commute_minutes: 20
  furnished_required: true

must_haves:
  parking: true
  laundry: true
  pets_allowed: false

preferences:
  private_bathroom: true

status:
  state: searching
```

This becomes WAIMD's primitive.

Not:

user

Not:

listing

Not:

landlord

Mission.

That's an important architectural decision.

---

## 7. V0 User Experience

The homepage should barely exist.

### Screen 1

Your contract is signed.

Let's solve where you'll live.

For travel nurses with a confirmed assignment.

Start my Housing Mission →

Trust underneath:

> No SSN. No rent payments. No deposits. No bank credentials.

---

### Screen 2 — Qualification

Have you accepted your assignment?

Yes

Not yet

Selecting Not yet:

> WAIMD is currently designed only for nurses with confirmed assignments.

No newsletter funnel.

No generic leads.

No contamination of the experiment.

---

## 8. Mission Intake

One question per screen.

### Assignment

Where are you working?

Hospital/facility.

---

When does your assignment start?

Date.

---

When does it end?

Date.

---

### Housing

What's the most you want to spend monthly?

$_______

---

What works?

Entire place

Private room

---

Longest commute you'll tolerate?

10 min

20 min

30 min

45 min

---

### Hard requirements

Parking
Laundry
Pet-friendly
Furnished
Private bathroom

Maximum five initially.

---

## 9. Confirmation Screen

Immediately after submission:

Mission WAIMD-0047 created.

Phoenix, AZ

August 17 → November 16

≤ $1,800/month

≤ 20-minute commute

Entire furnished place

Parking ✓
Laundry ✓

WAIMD is searching.

The customer now owns a visible object.

Not:

> "Thanks for contacting us."

That difference matters.

---

## 10. The WAIMD Decision Engine

Every candidate goes through five gates.

### Gate 1 — Dates

Does it plausibly cover the assignment period?

Fail → reject.

### Gate 2 — Economics

Does total expected cost satisfy the mission budget?

Fail → reject.

### Gate 3 — Commute

Within specified tolerance?

Fail → reject.

### Gate 4 — Hard requirements

All must-haves satisfied?

One failure → reject.

### Gate 5 — Evidence quality

How confident are we that the information is current?

---

## 11. WAIMD Must Never Lie

This becomes a hard product rule.

We use three evidence states:

### LISTED

The source currently claims availability.

### CHECKED

WAIMD has recently rechecked the source and found the information unchanged.

### CONFIRMED

A landlord/property representative has directly confirmed relevant availability.

Only the third state may say:

> Availability confirmed.

Never turn a stale calendar into fake certainty.

This trust mechanic could become one of WAIMD's strongest product features.

---

## 12. Housing Decision Card

Instead of a traditional listing card:

Match 01

94% WAIMD Fit

$1,640/month

11-minute estimated commute

Entire furnished apartment

Laundry ✓
Parking ✓
Dates ✓
Budget ✓

Availability

CHECKED

Source last checked:

2h 14m ago

Why WAIMD chose it

$160 below budget

9 min inside commute limit

5/5 required features

Watch-outs

$500 refundable deposit

Pet policy unclear

Source

View original listing →

---

## 13. Do Not Build a Fake "AI Score"

The score needs deterministic foundations.

For V0:

Hard requirement failure = disqualified

Remaining candidates:

```
Budget fit       30
Commute fit      25
Date confidence  20
Evidence freshness 15
Preference fit   10
                ───
                100
```

The model may explain the result.

The model does not invent the result.

That makes debugging possible.

---

## 14. The Three-Choice Rule

WAIMD will intentionally return:

Maximum 3 choices.

Not 50.

Not 100.

Not infinite scroll.

That's philosophical.

More inventory is not automatically more value.

After enough viable choices, additional choices create decision cost.

WAIMD exists to collapse the option space.

---

## 15. First Monetization

I recommend we test:

$29 Housing Decision

Not a subscription.

Not $99/month.

Not commissions.

Not landlord advertising.

And not payment before value.

### Free

Create Housing Mission.

Receive:

Match #1 preview.

### $29

Unlock complete WAIMD Decision:

3 strongest choices

plus:

evidence status

direct source

total estimated cost

commute comparison

required-feature comparison

deposits/known fees

risk flags

recommendation

next action

If WAIMD cannot produce three qualifying options:

Customer pays $0.

That reduces the trust burden dramatically.

---

## 16. What WAIMD Does NOT Do

This section matters more than the roadmap.

V0 does not:

❌ own housing

❌ lease apartments

❌ collect rent

❌ process deposits

❌ perform tenant screening

❌ guarantee landlords

❌ become a property manager

❌ host landlord listings

❌ provide neighborhood "safety scores"

❌ guarantee property condition

❌ book housing

❌ become an OTA

❌ support other professions

❌ create another marketplace

---

## 17. Supply Strategy

This is another first-principles inversion.

We don't need inventory.

Supply already exists across:

Furnished Finder
Airbnb monthly stays
Vrbo
extended-stay operators
local furnished rentals
apartment operators
hospital-area rentals
local housing communities

Furnished Finder alone advertises 150,000+ furnished monthly rentals.

Therefore:

Inventory isn't the scarce asset.

The scarce asset is:

> accurately converting fragmented inventory into a decision matching one medical assignment.

Do not scrape sources whose terms prohibit it.

V0 can combine public/authorized information with founder-assisted verification.

Later we pursue licensed feeds/APIs/partnerships where appropriate.

---

## 18. Founder-in-the-Loop Is a Feature

For the first 10–50 missions:

Software handles:
qualification
schema
requirements
filtering
scoring
presentation
payments
analytics

AJ handles:
difficult discovery
unclear availability
manual verification
weird edge cases

Every intervention becomes labeled data:

```
manual_reason:
  stale_availability
  dates_unclear
  pricing_unclear
  hidden_fee
  commute_unclear
  amenities_unclear
  source_conflict
  listing_suspicious
  landlord_unresponsive
```

Those interventions become the automation backlog.

Don't automate guesses.

Automate observed work.

---

## 19. Trust Architecture

This is critical.

WAIMD.org should clearly say:

> WAIMD is a product of Voco Technologies Inc.

Because .org can carry nonprofit associations and we must never create that false impression.

Footer:

Voco Technologies Inc.
Terms
Privacy
Contact
How WAIMD Works

And everywhere:

> WAIMD does not own or manage the properties shown. Housing agreements and payments occur directly with the relevant property provider.

No fake reviews.

No fake inventory.

No invented "verified" badges.

No fake nurses.

No vanity counters.

---

## 20. Acquisition Experiment

You were right to challenge manual user hunting.

### Hypothesis

Meta can deliver travel nurses who have already accepted assignments into WAIMD cheaply enough to validate the behavior.

Maximum founder-authorized experiment:

$70

$10/day × 7 days.

But this is a housing-related product, so Meta currently requires applicable housing campaigns to select the appropriate Special Ad Category.

We comply.

No attempts to circumvent targeting restrictions.

---

## 21. Hero Ad

### Creative thesis

Don't advertise AI.

Don't advertise "travel nurse housing platform."

Advertise the moment.

Accepted the contract.

Still don't know where you're living?

Tell WAIMD:

Hospital
Dates
Budget
Commute

Get your three strongest housing options.

No card required to start.

Start Housing Mission

---

## 22. Validation Funnel

We instrument only what affects the hypothesis.

```
META AD
   ↓
LANDING PAGE
   ↓
ACCEPTED ASSIGNMENT = YES
   ↓
MISSION STARTED
   ↓
MISSION COMPLETED
   ↓
MATCH #1 DELIVERED
   ↓
$29 UNLOCK
   ↓
HOUSING DECISION
```

Events:

landing_viewed
qualification_passed
mission_started
mission_submitted
candidate_found
three_candidates_found
preview_viewed
checkout_started
decision_purchased
source_clicked
mission_failed

---

## 23. Primary Metrics

Forget DAU.

Forget downloads.

Forget registrations.

Forget social followers.

### Metric #1

Qualified Housing Mission Acquisition Cost

ad spend / completed qualified missions

Initial test target:

≤ $14

---

### Metric #2

Mission Solvability

Can we produce three qualifying options?

Target:

≥ 80%

---

### Metric #3

Paid Decision Rate

After seeing Match #1:

purchases / completed solvable missions

Phase Zero pass:

≥30%

Three out of ten.

---

## 24. Kill Criteria

This is important because you're broke.

### Kill acquisition angle

$70 spent and:

<5 qualified missions

We do not spend another $70 automatically.

---

### Kill current product proposition

10 successfully fulfilled missions and:

0 purchases

Do not build more features.

---

### Investigate

10 fulfilled:

1–2 purchases

There is signal, but not enough.

Interview behavior and change one variable.

---

### Continue

10 fulfilled:

≥3 purchases

We earned another iteration.

---

## 25. 3-Line Business Model

### Customer

Travel nurse with an accepted U.S. assignment and unresolved housing.

### Value

Transform the assignment's dates, budget, facility and requirements into three defensible housing choices.

### Revenue

$29 per successful Housing Decision, initially paid by the nurse only after seeing evidence that WAIMD found a viable option.

That's it.

---

## 26. Technical Vertical Slice

Because you're broke, the architecture needs to behave like you're broke.

### Web

Next.js + TypeScript

Mobile-first.

### Database/Auth

Supabase free tier

Anonymous mission creation first.

Avoid requiring an account before demonstrating value.

### Payments

Stripe Checkout

No subscription system.

### Analytics

Simple event store/PostHog free tier if needed.

### Search/AI

No paid LLM is required on the critical path.

That's intentional.

The first decision engine is deterministic.

Use your existing AI tooling operationally during fulfillment until product economics justify API spend.

---

## 27. Minimal Data Model

```
missions
--------
id
email
phone_optional
profession
contract_status
facility
city
state
start_date
end_date
budget_max
housing_type
commute_max_minutes
created_at
status

requirements
------------
mission_id
parking
laundry
furnished
pets
private_bath

candidates
----------
id
mission_id
source_name
source_url
monthly_price
estimated_total_cost
availability_start
availability_end
commute_minutes
evidence_status
evidence_checked_at
score
status

candidate_requirements
----------------------
candidate_id
parking
laundry
furnished
pets
private_bath

interventions
-------------
candidate_id
reason
notes
created_at

orders
------
mission_id
stripe_session_id
amount
status
created_at
```

No landlord table.

That is intentional.

---

## 28. Admin System

Founder needs one ugly but effective screen.

### Mission Queue

```
WAIMD-0041     SEARCHING
Phoenix        starts Aug 17

WAIMD-0042     NEEDS REVIEW
San Diego      starts Aug 02

WAIMD-0043     READY
Dallas         starts Sep 04
```

Open mission:

Constraints

Left.

Candidates

Center.

Verification

Right.

AJ can:

Add candidate

Reject

Mark checked

Mark confirmed

Record issue

Publish Decision

That's enough.

---

## 29. The First Moat

Initially, there is no moat.

We should be honest.

Software can be copied.

Landing pages can be copied.

Matching can be copied.

The thing we can eventually possess that becomes increasingly difficult to reproduce is:

### Assignment Housing Graph

Over thousands of missions:

Hospital
→ assignment dates
→ nurse budget
→ desired commute
→ requested configuration
→ candidate supply
→ response rates
→ availability accuracy
→ actual choice
→ rejection reason
→ price sensitivity

Then WAIMD starts knowing:

> What housing actually works for a specific temporary healthcare assignment.

Not simply what's listed nearby.

That's potentially proprietary.

---

## 30. The Long-Term Secret

Here's the contrarian thesis underneath the company:

> Temporary housing should be organized around the work assignment, not around the property listing.

Today's marketplaces start with:

Property

Then ask:

> Who might rent this?

WAIMD starts with:

Assignment

Then asks:

> What housing satisfies this economic mission?

That's the inversion.

And that is why our core database object is Mission, not Listing.

---

## 31. What Happens Much Later

Only after proof:

```
Assignment
    ↓
Feasibility
    ↓
Housing Decision
    ↓
Availability Verification
    ↓
Contract Economics
    ↓
Move
```

Eventually WAIMD could tell a nurse before accepting an assignment:

> $2,450/week sounds attractive, but housing matching your requirements near this hospital is currently ~$2,400/month.

or:

> Assignment B pays $130/week less but leaves approximately $610/month more after likely housing costs.

That could eventually be much bigger than housing search.

It becomes:

> Should I accept this assignment?

But we do not build that now.

That is exactly how horizontal creep begins.

---

## 32. Seven-Day Zero-to-One Plan

### Day 1

Repository + domain + design skeleton.

Homepage → qualification.

### Day 2

Housing Mission intake + database.

Real persisted mission.

### Day 3

Founder Mission Queue + candidate entry.

### Day 4

Deterministic scoring + three-match Decision page.

### Day 5

Free preview + Stripe $29 unlock + event instrumentation.

### Day 6

End-to-end test using 3 synthetic test cases only; no fake customer evidence.

Fix mobile funnel.

Prepare Meta creative.

### Day 7

Founder gate.

Only after you authorize the $70:

Launch Meta.

Then real customers replace test cases immediately.

---

## Definition of Done

The vertical slice is finished only when this works:

> Stranger taps ad → WAIMD.org → confirms accepted assignment → submits real Housing Mission → founder sees it → candidates are evaluated → WAIMD produces three options → customer sees free evidence → pays $29 → receives Decision.

Anything less is not an MVP.

It's pieces of an MVP.

---

## The sentence I'd put above the repo

> WAIMD transforms a travel nurse's accepted assignment into three evidence-backed housing choices. Nothing else until strangers pay for that outcome.

That is our constitution.

And WAIMD — Work Assignment. Instant Move Decision. is the name I would lock.
