# Turnaround scenario notes

Selected illustrative aircraft tail: `N8804L`. The model threshold remains `0.4988`, selected on February validation.

## Population scenario summary

| Added slack (min) | Mean relative model score | Share with lower score vs baseline | Model alerts at locked threshold | Rule flags delayed | Rule/model agreement |
|---:|---:|---:|---:|---:|---:|
| 0 | 0.4233 | 0.0% | 27.8% | 2.9% | 75.0% |
| 5 | 0.4164 | 45.7% | 26.9% | 2.4% | 75.5% |
| 10 | 0.4060 | 56.7% | 25.8% | 2.1% | 76.2% |
| 15 | 0.3922 | 59.0% | 24.2% | 1.8% | 77.6% |
| 20 | 0.3680 | 56.2% | 20.7% | 1.6% | 80.8% |
| 30 | 0.3586 | 55.0% | 19.3% | 1.2% | 81.8% |
| 45 | 0.3586 | 54.2% | 19.4% | 0.8% | 81.4% |
| 60 | 0.3593 | 53.4% | 19.5% | 0.6% | 81.0% |

## Assumptions and limits

The buffer is a feature-only what-if. It is not a causal estimate and does not establish that schedule changes are feasible or beneficial. Outputs are relative model scores, not calibrated risk probabilities. The transparent rule uses residual inbound delay after scheduled slack as a simple cross-check.
