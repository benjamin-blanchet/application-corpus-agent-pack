# Reference — output routing and state updates

## Output files

Create or update:

```text
doc/prod/snapshots/YYYY-MM-DD-production-discovery.md
doc/prod/reliability-analyses/YYYY-MM-DD-production-temporal-correlation.md
doc/prod/BASELINES.md
doc/prod/COMPONENT_MAP.md
doc/prod/RUNTIME_ARCHITECTURE.md
doc/prod/SERVICE_FLOWS.md
doc/prod/INFRA_STATE.md
doc/prod/BATCH_HEALTH.md
doc/_indexes/by-production-signal.md
doc/_meta/kickstart-report.md
doc/_meta/coverage-matrix.md
doc/_meta/open-questions.md
doc/_meta/corpus-state.yaml
doc/_meta/discovery-coverage.md
```

Create atomic files only when evidence is strong enough:

```text
doc/prod/known-bugs/BUG-<id>-<slug>.md
doc/prod/structural-risks/RISK-<id>-<slug>.md
doc/prod/root-cause-playbooks/PLAYBOOK-<slug>.md
doc/prod/watchlist/WATCH-<slug>.md
```

## State updates

When the pass runs, update `doc/_meta/corpus-state.yaml`:

```yaml
corpus:
  first_prod_pass_done: true
  prod_discovery_status: "done"   # unavailable | partial | done
  last_prod_discovery:
```

If no production source is available, set:

```yaml
corpus:
  first_prod_pass_done: false
  prod_discovery_status: "unavailable"
```

and add the missing access or missing mapping to `doc/_meta/open-questions.md`.

Do not infer production health from code when Dynatrace or another production
source is unavailable. Repository evidence can identify expected runtime
components, but production discovery remains unavailable or partial until a
verified production source is consumed.
