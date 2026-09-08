# PLAN 76: AWS Cost Analysis and Optimization

Status: Planned
Created: August 29, 2026
Owners: Infrastructure / Backend

## Objective

Understand which AWS resources generate the current Trailbook bill, remove
unnecessary fixed costs, and introduce lightweight cost controls without
weakening security, backups, or the production deployment described in
`PLAN_71`.

The first target is to validate the idle/low-traffic baseline. At the current
stage, fixed infrastructure costs matter much more than request volume, while
photo storage and downloads are the main long-term variable-cost risk.

## Current decision: observe September without changes

Decision date: August 29, 2026

- Keep the current AWS architecture unchanged throughout September 2026.
- Accept one full month without remaining Free Tier credits in order to measure
  the real steady-state bill and validate the current approximately `$118.50`
  forecast (`$115-$125` working range).
- Do not migrate to a single server or partially dismantle ECS/ALB/RDS before
  the September invoice is finalized.
- Treat September as a measurement month, not an optimization month. Normal
  production operation and genuine user activity may continue, but avoid
  artificial load tests or repeated deployments unless they are required and
  record them when they occur.
- Review the finalized September invoice in early October before deciding on
  any infrastructure change.

This is an explicit, time-bounded decision. It does not mean that the current
architecture has already been proven cost-effective.

## Final August invoice and Cost Explorer findings

The finalized August 1-31 invoice resolves the earlier difference between AWS
views:

1. Gross AWS service charges before credits and tax were `$98.73`.
2. The final `$64.94` of Free Tier credits covered all ECS and most load
   balancing charges.
3. Net charges after credits and before tax were `$33.79`.
4. VAT was `$6.76`, producing a final payable invoice of `$40.55`.

The account's full `$140` credit allocation is now consumed. September must be
planned with zero remaining credit.

| Service | Gross before tax | Credits | Final with 20% VAT |
| --- | ---: | ---: | ---: |
| ECS | $45.80 | -$45.80 | $0.00 |
| Elastic Load Balancing | $19.95 | -$19.14 | $0.97 |
| RDS | $16.73 | $0.00 | $20.08 |
| VPC | $14.83 | $0.00 | $17.80 |
| Amplify | $0.85 | $0.00 | $1.02 |
| Route 53 | $0.50 | $0.00 | $0.60 |
| ECR | $0.07 | $0.00 | $0.08 |
| Other services | <$0.01 | $0.00 | $0.00 |
| **Total** | **$98.73** | **-$64.94** | **$40.55** |

The daily Cost Explorer export supplied after invoice finalization is also a
post-credit/chargeable view. It cannot by itself describe the infrastructure
run rate because it reports ECS as zero and only the uncovered portion of load
balancing.

Key observations:

- The finalized August invoice is `$40.55`; the earlier approximately `$38`
  estimate was close but is superseded by this invoice.
- With no credits left, unchanged resources would have cost approximately
  `$118.48` including VAT in August (`$98.73 * 1.20`). Use `$115-$125` as the
  working September range rather than the earlier `$105-$115` range.
- Lower request volume alone will not materially reduce this baseline. Fargate
  tasks, the load balancer, RDS instances, and public IPv4 addresses are billed
  primarily for provisioned/running time.
- VPC is almost exactly `$0.48/day`. Usage-type detail confirms four
  continuously used public IPv4 addresses at `$0.005/address-hour`, costing
  `$14.81` before tax in August.
- RDS consists of a `db.t4g.micro` instance (`$14.02`) plus GP2 storage
  (`$2.72`). This is already a small managed database configuration; it is the
  largest paid invoice line only because credits covered ECS and load balancing.
- ECS (`$45.80`) and load balancing (`$19.95`) are the two largest gross lines.
  Together with the four public IPv4 addresses, they are the primary
  optimization targets after the September validation month.
- Amplify spikes caused by testing/deployments are visible but small compared
  with the fixed ECS/ALB/RDS/VPC baseline.

## Guardrails

- Confirm every suspected charge at usage-type and resource level before
  deleting, stopping, or resizing anything.
- Preserve the private S3 access model and never expose RDS publicly merely to
  avoid a networking charge.
- Preserve an explicit database backup and tested restore path.
- Do not trade a small saving for unreliable recording sync, authentication,
  media restore, or production deployment.
- Prefer changes that can be rolled back and measure the bill for at least
  seven complete days after each material change.
- Never put AWS account IDs, resource IDs, credentials, or secret values in this
  document or repository.
- Make no cost-driven AWS topology change during the September observation
  window unless required to stop a security incident, runaway cost, or service
  failure.

## Business context and strategic boundary

Trailbook Premium Monthly is priced at `EUR 4`. A conservative store model uses
15% store commission and treats the consumer price as VAT-inclusive, producing
roughly `EUR 2.83` per paying user before income/profit tax and other business
costs.

The current architecture has unfavorable unit economics at very small scale but
improves as paying users grow because most compute/database/network cost is
fixed:

| Paying users | Gross subscription revenue | Current AWS implication |
| ---: | ---: | --- |
| 10 | EUR 40/month | Infrastructure materially exceeds net subscription revenue |
| 50 | EUR 200/month | Near early break-even; margin remains small |
| 100 | EUR 400/month | Current managed architecture can be economically reasonable |
| 500 | EUR 2,000/month | Fixed compute cost is small relative to revenue; media dominates growth |
| 1,000 | EUR 4,000/month | Media storage/download and measured capacity become the main cost controls |

### Working 12-month unit economics

The following table uses the conservative `EUR 2.83` net proceeds per paying
user, the current AWS architecture, 2 MB per uploaded photo, 400 new photos per
user/month, one equivalent full download of each month's new media, no media
deletion, 20% AWS tax, and the August 28, 2026 reference exchange rate. AWS cost
is the estimated monthly run rate at the end of month 12, not the cumulative
cost of the first year.

| Paying users | Net subscription proceeds | Estimated AWS cost | Remaining before other taxes and costs |
| ---: | ---: | ---: | ---: |
| 10 | EUR 28 | about EUR 104 | **EUR -76** |
| 50 | EUR 142 | about EUR 114 | **EUR +28** |
| 100 | EUR 283 | about EUR 126 | **EUR +157** |
| 500 | EUR 1,417 | about EUR 252 | **EUR +1,165** |
| 1,000 | EUR 2,833 | about EUR 412 | **EUR +2,421** |

The 1,000-user estimate assumes approximately 800 GB of new media per month and
9.6 TB retained after 12 months. It includes a working allowance for S3 storage,
PUT requests, and internet transfer above the shared free allowance, but it does
not assume additional ECS or RDS capacity. Load testing must determine whether
capacity cost needs to rise at that scale. Actual proceeds also depend on store,
user jurisdiction, VAT treatment, refunds, and commission eligibility.

Working usage model per paying user:

- up to 20 trips/month;
- average 20 photos/trip;
- up to 400 new photos/month;
- working average of 2 MB/uploaded photo, pending production measurement.

At that rate each user adds approximately 0.8 GB/month. At 500 continuously
active users this is approximately 400 GB/month and 4.8 TB after one year with
no deletion. The mobile app currently re-encodes photos as JPEG at quality 0.85
but does not reduce pixel dimensions, so production files may be materially
larger than 2 MB.

The long-term scaling priority is therefore photo economics rather than early
compute scaling:

- measure actual upload-size percentiles;
- generate bounded-resolution display images and thumbnails;
- avoid downloading originals for list/preview views;
- retain a persistent local cache to prevent repeated downloads;
- apply the explicit account/subscription retention policy below;
- track S3 storage and data transfer per active paying user.

### Photo retention and automatic deletion policy

The objective is to stop S3 storage from growing indefinitely for deleted
accounts and subscriptions that have genuinely ended, without deleting media
during cancellation, billing recovery, grace periods, or a paused subscription.

#### Account deletion

- Delete all user-owned S3 photo objects as part of confirmed account deletion.
- Delete S3 objects before deleting the corresponding database/account records.
- If any S3 deletion fails, keep the account/database state and retry or return
  an error; do not report complete account deletion while owned objects remain.
- The current `AccountDeletionService` already implements batched S3 deletion
  before database deletion and has failure-path tests. Retain this behavior and
  add a periodic orphan-object reconciliation as defense in depth.

#### Subscription expiry

- Start the retention clock only when the authoritative subscription status is
  continuously `expired`.
- Schedule deletion for 30 days after the first verified `expired` timestamp.
- Do not schedule or execute deletion for `active`, `canceled`,
  `in_grace_period`, `billing_retry`, or `lifetime`.
- Google Play `SUBSCRIPTION_STATE_PAUSED` is currently normalized to
  `billing_retry`; paused subscriptions must therefore retain all remote media.
- `canceled` means auto-renewal is disabled, not that paid access has already
  ended. Preserve photos through `currentPeriodEndsAt` and until a later
  authoritative transition to `expired` remains continuous for 30 days.
- If a subscription is renewed, restored, resumed, enters grace/billing retry,
  or otherwise leaves `expired` before deletion, cancel the deletion schedule
  and clear the expiry clock.
- Do not derive deletion eligibility merely from `autoRenewEnabled = false`, a
  missed webhook, local mobile state, or an old `currentPeriodEndsAt` value.
- `revoked`/refund cases require a separate product/legal decision. Do not map
  them automatically to this 30-day deletion policy until their retention and
  dispute requirements are defined.

The 30-day period is a business retention window, not additional Premium
access. An expired user remains unable to use cloud-gated functionality during
the window, but may renew and recover the retained remote media.

#### User communication and recoverability

- Disclose the policy in Terms/Privacy and in the subscription/account UI.
- On confirmed expiry, show/email the exact scheduled deletion date.
- Send a reminder approximately seven days before deletion when a verified
  contact channel is available.
- Explain that local device copies are unaffected, but server sync, restore,
  shared-photo access, and deleted remote originals cannot be recovered after
  the retention window.
- A renewed user before the deadline regains access to the same retained media;
  after successful deletion, renewal does not promise recovery.

#### Safe deletion workflow

Do not implement this as an S3 lifecycle rule based only on object age: object
age does not encode account ownership, current entitlement, pause/resume, or
renewal state.

1. Persist explicit server fields such as `premiumExpiredAt`,
   `mediaDeletionScheduledAt`, `mediaDeletionStartedAt`, and
   `mediaDeletedAt`; store the authoritative status/reason used for the decision.
2. A scheduled backend job selects only users whose status is still `expired`
   and whose `mediaDeletionScheduledAt` is in the past.
3. Re-verify current provider entitlement immediately before destructive work.
4. Mark the job as claimed/idempotent so concurrent runs cannot perform
   conflicting deletion.
5. Delete objects in bounded batches, record per-object/batch failures, and
   retry with backoff.
6. Only after S3 confirms deletion, update image metadata to a terminal deleted
   state and record aggregate object count/bytes freed. Do not log object URLs,
   user content, or credentials.
7. Reconcile S3 objects against database ownership periodically to find
   incomplete uploads, legacy orphans, and failed deletions.

#### Additional S3 cost controls

- Add an S3 lifecycle rule only for abandoned/incomplete multipart uploads;
  this is independent of user media retention.
- Prefer image dimension limits, thumbnails, local caching, and deletion of
  expired-user media before introducing storage-class transitions.
- Evaluate S3 Intelligent-Tiering or Standard-IA only from measured access age
  and retrieval patterns. A blind transition shortly before 30-day deletion can
  add minimum-storage-duration, monitoring, and retrieval charges instead of
  saving money.
- Track monthly `storedBytes`, `deletedBytes`, object count, average/P90 image
  size, download bytes, and deletion failures, grouped by active versus expired
  ownership without exposing user-identifying data.

### Product contingency if paid adoption remains small

If the number of paying users remains too small to justify the backend business,
the fallback is not currently a partial migration to a cheaper server. The
strategic contingency is to discontinue the hosted/premium model:

- remove the complete backend deployment;
- remove in-app purchases and Premium subscription operation;
- remove server-mediated sync, restore, entitlement, and sharing features;
- replace server-side sharing with local device-to-device Bluetooth sharing;
- redesign the product explicitly as a local/offline application.

This is close to discontinuing the current business model and is therefore a
separate product decision, not a routine infrastructure optimization. It must
have its own implementation and data-migration/decommission plan before any
backend resource is deleted.

## Workstream 1: Establish resource-level attribution

Status: September observation in progress; detailed review due in October

1. Preserve the August Cost Explorer, Bills, Credits, and service-level exports
   as the credited baseline.
2. Export September Cost Explorer and Bills data after the invoice is finalized,
   using the same scope and cost metric.
3. Reconcile gross consumption, credits, chargeable usage, tax, and final invoice
   instead of comparing totals from unlike AWS views.
4. Group September VPC cost by:
   - usage type;
   - operation;
   - region;
   - availability zone;
   - resource, with hourly/resource-level cost data enabled if necessary.
5. Inventory all allocated and in-use public IPv4 addresses, including addresses
   attached to load balancers, NAT gateways, ECS tasks, EC2 instances, and RDS.
6. For RDS, group cost by usage type and resource, separating:
   - instance hours;
   - storage;
   - backup/snapshot storage;
   - I/O;
   - data transfer;
   - Performance Insights or Extended Support, if present.
7. Split Amplify cost into build minutes, hosting storage, data served, and SSR
   or compute usage. Correlate the August 5 and August 24-26 spikes with deploys.
8. Record the resource, usage type, quantity, rate, and owner for every recurring
   charge above `$0.05/day`.

### Deliverable

A compact attribution table backed by Cost Explorer evidence:

| Resource/purpose | Usage type | Quantity | Daily cost | Required? | Candidate action |
| --- | --- | ---: | ---: | --- | --- |
| To be measured | To be measured | n/a | n/a | Unknown | Investigate |

### Acceptance criteria

- At least 95% of pre-tax August cost is attributed to a usage type and concrete
  resource or account-level fee.
- The VPC `$0.48/day` baseline and RDS `$0.544/day` baseline have evidence-backed
  usage-type explanations.
- Cost Explorer gross cost, applied credits, tax, and the final invoice reconcile
  within rounding/timing differences.

## Workstream 2: Reduce VPC and public IPv4 cost

Status: Deferred until the finalized September review

Public IPv4 addresses are confirmed as the VPC baseline:

1. Map each address to the component that requires it.
2. Release unattached Elastic IPs immediately after confirming they are unused.
3. Check whether ECS tasks received public IPs individually. Prefer private ECS
   tasks behind one ingress path when the total network design is cheaper.
4. Check whether an internet-facing load balancer holds multiple billed public
   IPv4 addresses and whether it is justified at current traffic.
5. Compare the complete monthly cost of these viable low-traffic designs:
   - current ECS/ALB/VPC layout;
   - ECS behind a single necessary ingress path;
   - IPv6-first/dual-stack where every dependency supports it;
   - a smaller single-host deployment as a temporary early-stage option.
6. Include NAT Gateway hourly and processing charges, interface endpoints, load
   balancer charges, operational work, and availability risk in every comparison.

Do not introduce a NAT Gateway merely to eliminate task public IPs: at low
traffic its fixed hourly cost can exceed the current suspected IPv4 charge.

If the VPC charge comes from NAT Gateway or endpoints instead, first remove
unused resources, then compare scheduled operation or a simpler network path.

### Acceptance criteria

- No public IPv4 address, NAT Gateway, or VPC endpoint exists without a named
  purpose.
- The selected topology has a documented monthly total, not only one cheaper
  line item.
- Backend health, HTTPS, S3 access, RDS access, deployment, and rollback are
  verified after the change.

## Workstream 3: Right-size RDS

Status: Deferred until the finalized September review

1. Record engine/version, instance class, deployment mode, storage type/size,
   backup retention, Multi-AZ setting, connections, CPU, memory, I/O, and free
   storage.
2. Measure at least seven representative days, including a deployment and normal
   mobile sync/restore activity.
3. Treat the August usage-type attribution as the baseline:
   - `EUC1-InstanceUsage:db.t4g.micro`: `$14.02`;
   - `EUC1-RDS:GP2-Storage`: `$2.72`.
4. Compare only proportionate optimizations:
   - retain `db.t4g.micro` unless measured capacity proves it unsuitable;
   - GP2-to-GP3 migration and its small absolute saving;
   - Single-AZ versus Multi-AZ for the current risk level;
   - stopping non-production RDS when unused;
   - deleting obsolete snapshots after retention review;
   - a non-RDS PostgreSQL deployment only if its backup, patching, monitoring,
     restore, and outage costs are accepted explicitly.
5. Run a backup and restore test before and after any instance/storage change.
6. Consider a one-year reservation only after the current architecture and
   continuous `db.t4g` usage are stable; the likely absolute saving is limited
   because only approximately `$14/month` is instance compute.

RDS is not the first optimization priority. Removing managed RDS entirely would
save only approximately `$20/month` including VAT while materially increasing
database operations and recovery risk. Review ECS, load balancing, and public
IPv4 first.

### Acceptance criteria

- The database choice is based on measured CPU, memory, connections, storage,
  I/O, recovery requirements, and expected growth.
- Restore is tested, and backup retention remains explicit.
- Auth, sync, sharing, purchases, and media metadata pass a production smoke test.

## Workstream 4: Control Amplify and secondary costs

Status: Deferred until the finalized September review

1. Confirm whether repeated or automatic branch builds caused the observed
   Amplify spikes.
2. Build locally or in CI before triggering a production Amplify build when that
   reduces duplicate build minutes without weakening release checks.
3. Remove unused preview branches and old artifacts according to a documented
   retention policy.
4. Review Route 53 hosted zones and registered domains; remove only duplicates
   or abandoned zones after checking delegation and certificates.
5. Add ECR lifecycle rules for untagged and superseded images while retaining
   the images required for rollback.
6. Add S3 incomplete-multipart cleanup and sensible media lifecycle rules, but
   do not expire user media or required backups.
7. Set CloudWatch log retention before production traffic makes the currently
   negligible line item material.

### Acceptance criteria

- Amplify spike dates are explained and unnecessary duplicate builds are gone.
- Every hosted zone, image repository, bucket, secret, and retained log group
  has a named purpose and retention rule.

## Workstream 5: Budgets and ongoing visibility

Status: Partially active

1. Add mandatory cost-allocation tags where supported: `Project`, `Environment`,
   `Service`, `Owner`, and `ManagedBy`.
2. Keep the existing `$100/month` budget and verify its notification types.
   Configure separate, clearly named alerts for:
   - forecast reaches 80% of the `$100` budget;
   - actual cost reaches 80%;
   - forecast reaches 100%;
   - actual cost reaches 100%;
   - actual cost reaches 120% as an escalation.
3. Send alerts to an actively monitored email or SNS destination.
4. Enable Cost Anomaly Detection for the account and the main services.
5. Review cost weekly during optimization and monthly after the baseline is
   stable.
6. Export the same daily, service-level view each month so trends remain
   comparable.

### Acceptance criteria

- A forecast or anomaly produces a verified notification.
- At least 95% of supported recurring cost is allocated to Trailbook and its
  environment.
- The monthly review records total, baseline, traffic-dependent cost, and the
  reason for any material change.

## Workstream 6: Implement media retention enforcement

Status: Planned; design may proceed, destructive automation remains release-gated

1. Add explicit expiry/deletion timestamps and an indexed selection path for
   due users.
2. Preserve provider pause/grace/billing-retry distinctions and add fixtures for
   Apple and Google state transitions.
3. Implement the idempotent scheduled deletion worker with provider recheck,
   bounded S3 batches, retries, and measurable results.
4. Add user notices and update Terms/Privacy before enabling deletion.
5. Add dry-run mode that reports eligible users, objects, and bytes without
   deleting anything; run it for at least one complete 30-day window.
6. Enable deletion only after dry-run review, restore/renewal tests, and explicit
   production approval.

### Required tests

- account deletion removes all owned S3 objects and database ownership rows;
- account deletion stops safely when any S3 batch fails;
- `expired` for less than 30 days never deletes;
- continuously `expired` beyond 30 days deletes once and retries partial failure;
- `canceled` before period end never starts the deletion clock;
- paused/`billing_retry` and `in_grace_period` never delete;
- renewal/resume/restore before the deadline cancels scheduled deletion;
- stale/out-of-order webhook cannot re-schedule deletion over a newer active
  provider state;
- provider verification outage postpones destructive work rather than assuming
  expiry;
- concurrent workers remain idempotent;
- shared links stop exposing a photo after successful owner-media deletion;
- object/byte metrics reconcile with deleted metadata and S3 results.

### Acceptance criteria

- No photo is deleted unless account deletion is confirmed or the subscription
  remains authoritatively `expired` for more than 30 days.
- Paused, canceled-but-paid, grace-period, billing-retry, active, and lifetime
  users retain all remote media.
- Every destructive run is auditable by non-sensitive counts/statuses and safe
  to retry.
- The policy and exact recovery deadline are visible to affected users before
  production enforcement.

## Delivery order

1. Keep the current configuration unchanged through September 2026.
2. Capture weekly gross Cost Explorer totals and note deployments/tests without
   changing resources in response to ordinary variation.
3. In early October, reconcile the finalized September invoice and compare it
   with the approximately `$118.50` forecast (`$115-$125` range).
4. Decide whether measured cost and paying-user trajectory justify keeping the
   current architecture, applying low-risk optimizations, or initiating the
   separate hosted-business discontinuation plan.
5. Design and dry-run the media retention worker; do not enable destructive
   expiry deletion until its full 30-day dry-run and release gates pass.
6. Only after the October decision, optimize in this initial priority order:
   ECS, load balancing, public IPv4, RDS, Amplify, and retention.
7. Maintain budgets, anomaly detection, tags, and a recurring review.

## Success criteria

- At least 95% of the bill is explainable from resource-level evidence.
- The finalized September invoice validates or replaces the current
  approximately `$118.50` including-tax forecast with a measured no-credit
  baseline.
- No optimization is undertaken solely to minimize the bill when its migration
  and operational cost is disproportionate to the expected saving and paying-user
  trajectory.
- If the hosted model continues, photo storage/download cost per paying user is
  measured before it becomes the dominant bill component.
- Expired-user media stops accumulating beyond the documented 30-day window,
  while paused and recoverable subscription states are protected from deletion.
- No change is accepted unless its seven-day post-change cost and functional
  checks confirm the expected result.
- Future unexpected increases are detected during the billing month rather than
  after the invoice arrives.
