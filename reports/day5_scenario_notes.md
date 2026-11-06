# Day 5 - Scenario demo notes

Selected illustrative aircraft tail: `N8804L`. The model threshold remains `0.4988`, selected on February validation.

## Population scenario summary

| Added slack (min) | Mean relative model score | Share with lower score vs baseline | Model alerts at locked threshold | Rule flags delayed | Rule/model agreement |
|---:|---:|---:|---:|---:|---:|
| 0 | 0.4233 | 0.0% | 27.8% | 2.9% | 75.0% |
| 15 | 0.3922 | 59.0% | 24.2% | 1.8% | 77.6% |
| 30 | 0.3586 | 55.0% | 19.3% | 1.2% | 81.8% |

## Assumptions and limits

The buffer is a feature-only what-if. It is not a causal estimate and does not establish that schedule changes are feasible or beneficial. Outputs are relative model scores, not calibrated risk probabilities. The transparent rule uses residual inbound delay after scheduled slack as a simple cross-check.
