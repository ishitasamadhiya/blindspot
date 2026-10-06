# Decisions log

Short record of the choices that shaped Blindspot, in the order they were made. The README
has the summary table; this file has the reasoning and what was rejected.

## Problem selection

Five candidate problems for a Microsoft Delta engagement were compared on relevance,
originality, technical depth, usefulness, demoability, fit, story clarity and memorability:
(A) the eval harness that learns from production, (B) a discovery-phase accelerator, (C) a
tenant agent flight recorder, (D) judge-versus-expert calibration, (E) a prototype-to-tenant
handoff kit. A won every judge; D is one of A's stages; C overlaps with Foundry tracing and
breaks the in-tenant data model; B and E read as consulting tooling.

The strongest objection to A, that Foundry already converts traces into evaluation datasets with
intelligent sampling and runs continuous evaluation, was verified against the Foundry docs
(traces-to-dataset, preview, September 2026) and absorbed into the positioning: those are the
ingredient, and the five numbers Blindspot adds (coverage, blind spots of uncovered traffic,
per-cluster judge agreement, paired-bootstrap deltas, a gate on representativeness) are not
computed by Foundry, LangSmith, Arize or Braintrust.

## Mechanically real discovery

The blind spots must come from an algorithm reading content, never from seed labels, so an
engineer can ask "did you seed the drift you found?" and the answer is "I seeded the traffic
shapes; the clusters and their names come from the embedding." The agent under test is real
code whose failures are consequences of its parser, and the fix is a visible patch whose effect
is computed, not typed in.

## Rejected

- **Agent trace viewer / latency dashboard.** Crowded category; not the missing layer.
- **Dollar-impact headline numbers.** Fabricated on synthetic data. Only "claim value in uncovered
  traffic" is shown, summed from seeded amounts and labelled synthetic.
- **Raw PCA map.** Collapsed every shape to a dot; replaced by the cluster-aware layout.
- **better-sqlite3 / Postgres.** A native build step or a service would cost the "no keys, no
  setup" demo; `node:sqlite` is enough for a prototype and is one file to replace.
- **Temporal in the prototype.** Needs a server; the job runner keeps the activity contract so the
  swap is mechanical.
- **Kappa auto-accept and active learning in v1.** Each is a day on its own; both are on the roadmap
  and both are strictly additive to the three visible moves.
