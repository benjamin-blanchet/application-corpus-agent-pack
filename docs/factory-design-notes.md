# Factory design notes

Where the factory's rules come from, and what each one is answering.

Two inputs shaped it: a first draft built and run on a real enterprise
application, and a survey of the 2026 state of the art in spec-driven and
agentic development. This file records what each rule owes to which, so a
reader can argue with a decision instead of guessing at it.

Every measured figure below comes from a published source. Where a claim is a
design judgement rather than a measurement, it says so.

## V3: instructions became a control plane

The first factory version established the right protocol but still trusted an
agent to keep its place in that protocol. V3 makes four design judgements from
the real PGS pilot and keeps them repository-native:

1. **Typed events are truth; state is a projection.** A JSONL hash chain and a
   pure reducer replace manually edited state booleans. Every approval/review
   is tied to the digests it actually examined, so later changes make it stale.
2. **Scheduling is code.** The pure scheduler checks reviewed dependencies,
   blockers, attempt budgets and exact/prefix path reservations before a worker
   is spawned. The pilot's dependent lots cannot be launched together again.
3. **Authority is a capability, not prose.** Controller, implementer, reviewer,
   corpus, acceptance and delivery have deny-by-default action surfaces. In
   particular, only Delivery can open a draft PR; no agent can approve/merge.
4. **Evidence proves one candidate.** Environment, CI and acceptance contracts
   bind cases, oracles and checksummed artefacts to `candidate_sha`, deployed
   revision, dataset and build. User-visible errors cannot aggregate to PASS.

The same separation fixes the former persisted MCP availability model: the corpus declares a logical source
and its transport-neutral requirements; a run probes whichever adapter is
available locally; historical coverage records what was actually consulted.
Current workstation availability is never durable application knowledge.

---

## What the field agreed on independently

Every serious framework converged on the same three artefacts — *what*, *how*,
*steps* — and on a read-only planning phase with an explicit human proceed.
Nobody coordinated that. It is the strongest available signal that the shape
is right, and the pack does not deviate from it.

The economic argument, put best by one of them: catching a wrong turn in a
one-paragraph plan is nearly free; catching the same wrong turn in three
hundred lines of code is not.

## What the field got wrong, and the pack does differently

**Constitutions and conventions enforced by prompt do not hold.** The most
widely adopted spec-driven toolkit states in its own prompts that its
principles are non-negotiable, and no line of its code parses or enforces
them. Its own issue tracker carries the predictable consequence: the agent
loses the constitution from context mid-execution and resumes guessing.

The pack's answer is not a better-worded rule. It is the factory controller and
validators — invalid event chains, stale approvals, premature lots, colliding
path claims, capability violations, uncovered criteria and inconsistent
candidate/evidence provenance are rejected mechanically, whether or not anyone
is reading.

**Rules files do not improve correctness.** A controlled study across multiple
agents and models found that repository context files do not generally improve
task success, while adding over 20% to inference cost. A second study found
they make agents measurably faster and cheaper, and deliberately did not
evaluate correctness. A third, across 1,650 sessions, found no detectable
effect from file size, instruction position or structure.

So the pack does not try to win by writing better prose. It carries what a
model cannot derive — decisions, invariants, traps, observed behaviour — and
it puts the guarantees in code.

**One structural effect did show up, and it is the reason lots are bounded.**
In that same 1,650-session study, each additional function an agent generates
carries roughly 5.6% lower odds of instruction compliance. Compliance decays
*within* a session as output grows. No amount of formatting fixes that; only
smaller units of work do.

The same effect appears from the other direction: the leading toolkit's own
documentation concedes that long implementation runs degrade — agents lose the
plan, ignore tasks, drift — and prescribes as a workaround exactly what this
pack does by default.

Independently again: on a multi-language benchmark, resolve rates drop sharply
once a fix exceeds roughly 600 tokens or touches more than one file, and Java
resolves at about half the rate of Python. Bounded lots are not a stylistic
preference. They are the only lever with measured support.

---

## Rule by rule

### `clarify` — the gate the first draft did not have

Adopted from the strongest component of the surveyed field, and it is pure
prompt, which makes it free to take: eleven ambiguity categories scored
Clear/Partial/Missing, at most five questions ranked by impact × uncertainty,
asked one at a time, each answerable as 2–5 options or five words.

The part most worth copying is the fold-back: written after **each** answer,
routed into the section that owns it, and **replacing** the statement it
invalidated rather than appending beside it.

The pack adds a category — *can this change be observed at all* — because a
specification whose acceptance cannot be demonstrated anywhere is not
complete; it has moved the problem to whoever will be asked to prove it.

The first draft had no such step, while its first invariant was *never pick an
interpretation and implement silently*. An agent with no bounded way to ask
does not notice it is guessing.

### Review budget — a gate, not a field

One instrumented trial produced 2,577 lines of specification and **three and a
half hours of human review** for 689 lines of code, against 15 minutes for the
same work done conversationally. Its author's conclusion was that the process
made them roughly ten times slower.

At the other end of the scale, an organisation running ML-assisted change at
volume reported deliberately rate-limiting generation each week to avoid
overwhelming reviewers.

No surveyed framework models reviewer throughput at all. The pack does:
`review_budget` carries expected diff size, expected effort and reviewers named
by code ownership, and a change whose cost exceeds remaining capacity waits, is
split, or the operator records accepting the queue.

### Cross-family review — a measured bias, not a precaution

Models recognise their own output and prefer it. The effect is causal and
scales with recognition ability, while human raters score the same outputs as
equivalent. A same-family review is a second opinion from the same opinion.

`model-routing` makes reviewer independence an invariant rather than an
accident of allocation, and the consolidated reviewer receives evidence,
contracts and diffs — never the author's reasoning transcript, which is
precisely what makes a second reader agree too easily.

### Deltas at closeout

Taken from the one open framework with mechanically enforceable specs: a
change declares `ADDED` / `MODIFIED` / `REMOVED` against the living corpus,
merged on archive.

The first draft reconciled by hand, one document against another. That is
where closeout silently stops happening, because it is the step that always
looks optional once the code works.

### pass^k, not pass@k, and cost

A benchmark measuring agents across repeated independent trials found success
on *all* k attempts collapses relative to success on *any*: under 50% on a
single run, under 25% across eight. For a factory that runs repeatedly, the
first figure flatters and the second is the one that says whether it can be
left unattended.

Retries are not independent draws either — a failed attempt contaminates the
next one's context, which makes the naive estimate optimistic by a wide
margin. `work-journal` records attempts rather than computing a probability
from them.

It also records cost, because a delivery gain nobody costed is a conviction,
and it is the objection that survives after every other one has been answered.

### Why the corpus, and not just specs

The largest agentic-SDLC framework in the field built exactly this — a
generated documentation corpus over a legacy codebase — and then withdrew it,
replacing it with a small verified block and stating plainly that it does not
run builds or tests to confirm what it records.

Another framework's users report the complementary failure: specs are
task-centric, so after merge they become historical artefacts and no
module-level knowledge accumulates.

The difference is not the corpus. It is **evidence reconciliation** — code as
the implementation spine, runtime/intent/history kept in their proper scopes,
and the pass that resolves real contradictions without erasing valid revision
or environment differences.

### Deterministic beats inferred, where a deterministic form exists

A measured comparison of the same migration, same model: without a recipe
library, 4 of 15 tasks and 61M tokens without finishing; with one, all tasks
in about 30,000 tokens. Roughly three orders of magnitude.

The framing is worth keeping: *a recipe is a deterministic program that runs
once and finishes; a prompt is an inference that runs every time and resolves
differently each time.*

`technical-intervention-plan` therefore looks for a recipe before partitioning
by hand, and records an unmatched partition as a recipe candidate — so the
second change of a type does not pay what the first one did.

---

## Findings recorded but not acted on

Real, sourced, and deliberately out of this change's scope. They are written
down so they stay work rather than becoming a silent loss.

| Finding | Why it matters | Status |
|---|---|---|
| Agents degrade systematically past roughly 400K lines; a code-intelligence layer moves one benchmark task from a zero score in 6,000s to 0.90 in 89s | the corpus graph is a text approximation of a semantic index | not addressed |
| Ratcheting — a committed violation baseline that only shrinks, with counts stored line-oriented to survive parallel fixes | the answer to enforcing a convention on a codebase that violates it everywhere | not addressed |
| A signature file that is simultaneously a build gate and a human- and agent-readable ban list | the cheapest available "this exists but do not imitate it" artefact | not addressed |
| Nothing in the field lets you say *read this but never imitate it*; exclusion removes it from context, which is the wrong primitive since an agent must read legacy code to change it | genuine white space | not addressed |
| Convention inference from a codebase is not a solved problem; the practical path is mechanical frequency distributions plus human authorship | prevents a wasted attempt at automatic rule derivation | noted only |
| Roughly a quarter to a half of what a team writes down cannot be expressed in any available linter | bounds how much of a corpus can ever be mechanically checked | noted only |
| Enforcement belongs at the choke point, not in the agent file — an agent with write access can edit the file that constrains it | the guardrail question the pack answers only partially | not addressed |
| An LLM judge's raw agreement overstates its discriminative ability; one industrial code-review study measured 0.44–0.62 agreement with engineers | why no judge is a correctness gate here | reflected in the rules, not measured |
