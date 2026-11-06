# Project guideline notes for the final

These notes summarize reusable expectations from the CSL236 mid-term project guideline PDF. The PDF is for the **mid-term evaluation**; its exact marks, deadlines, page/slide counts, team limits, and file-naming rules should not be assumed to apply to the final unless the final-project instructions confirm them.

## Reusable expectations

1. **Explain the data before modeling.** Report dataset shape, column types, summary statistics, missing-value counts and percentages, and identify numeric versus categorical features.
2. **Make preprocessing decisions visible.** For every meaningful step, state which columns it affects, why it is appropriate, and what alternatives were considered. If a technique does not suit the data, explain why it was skipped.
3. **Handle missing values deliberately.** Document per-column treatment, such as imputation, retaining a meaningful missing category, or dropping rows/columns, with a reason.
4. **Encode categories appropriately.** Distinguish binary, ordinal, and nominal fields; write down ordinal order where one exists. Avoid arbitrary numeric codes for nominal categories.
5. **Use binning, scaling, transformations, and outlier treatment only where justified.** State boundaries or methods, investigate extreme values before removing them, and explain why a model needs scaling or transformation.
6. **Show feature selection or reduction.** Name the method and report the number of features before and after selection/reduction.
7. **Prevent data leakage.** Split data before fitting imputers, encoders, scalers, or feature selection. For this flight project, prefer a chronological split so future flights do not inform the past; fit preprocessing on training data only.
8. **Train a clear baseline and report suitable metrics.** Explain the target and model, and interpret metrics in context rather than presenting a score alone.
9. **Make the notebook reproducible.** It should run from top to bottom after restarting the kernel, with explanations in Markdown cells and outputs that support the conclusions.
10. **Prepare to explain the work.** Every team member should understand the full workflow and be able to describe their contribution. Cite external datasets, code, documentation, and AI assistance as required by the final course rules.

## Application to the flight disruption project

- State the prediction point clearly. For delay propagation, a useful row is a current flight paired with its immediately previous flight on the same aircraft; the current flight's departure delay of at least 15 minutes can be the target.
- Use only information that would be available at the chosen prediction point. Previous-flight arrival delay and scheduled turnaround slack are plausible inputs. Current-flight actual departure/arrival times, current departure delay, and post-flight delay-cause fields would leak the answer and must not be used as predictors.
- Keep cancelled and diverted flights as separate disruption outcomes or sequence barriers where appropriate. Do not treat missing actual times on cancellations as ordinary missing values to impute into an operated-flight delay model.
- Check missingness, class balance, route/carrier/time categories, unusually large delays and turnaround values, then justify each treatment. Select encoding/scaling methods based on the chosen model.
- Evaluate on later dates than the training data. Compare a simple majority baseline with an interpretable classifier and report more than accuracy if class imbalance makes accuracy misleading (for example, precision, recall, F1, and ROC-AUC or PR-AUC).

## Mid-term-only requirements to verify before reusing

The source rubric specified a 3–5 page project description, an 8–12 slide presentation lasting 8 minutes, a 3–4 minute individual viva, and a maximum team size of three. It also named a particular mid-term mark breakdown and submission naming convention. Treat all of these as mid-term-specific until the final-project rubric confirms them.
