(() => {
  const DATA = window.DASHBOARD_DATA;
  if (!DATA) return;

  const tailKey = row => String(row.TAIL_NUM ?? '').trim();
  const allFlights = (Array.isArray(DATA.chain) ? DATA.chain : []).filter(row => Number(row.EXTRA_SCHEDULED_SLACK_MIN) === 0);
  const scenarioRows = Array.isArray(DATA.chain) ? DATA.chain : [];
  const quality = DATA.quality || {
    missing_tail_numbers: 726,
    cancelled_flights: 5969,
    diverted_flights: 798,
    missing_timestamps: 11952,
    unknown_airport_timezones: 0,
    invalid_turnaround_values: 0,
    linked_aircraft_pairs: 423660,
    rejected_aircraft_pairs: 14470,
    candidate_aircraft_pairs: 438130
  };
  const paths = [
    'M184 134 Q310 85 432 162',
    'M432 162 Q548 128 626 205',
    'M626 205 Q544 240 452 187',
    'M452 187 Q300 245 150 151'
  ];
  const planePositions = [[310, 115], [548, 155], [544, 219], [300, 205]];
  const airportNames = DATA.airportNames || {};
  const airportLabel = code => airportNames[code] ? `${airportNames[code]} (${code})` : code;
  const tails = [...new Set(allFlights.map(tailKey).filter(Boolean))].sort();
  let selectedTail = tails[0] || '';
  let filteredFlights = allFlights.slice();
  let flights = filteredFlights.filter(row => tailKey(row) === selectedTail);
  let selectedFlight = Math.max(0, flights.length - 1);
  let selectedScenario = 0;
  let selectedThreshold = 0.5;

  const el = id => document.getElementById(id);
  const minuteText = value => {
    const n = Number(value);
    if (n > 0) return `+${Math.round(n)}`;
    if (n < 0) return `−${Math.abs(Math.round(n))}`;
    return '0';
  };
  const timeText = value => {
    if (!value) return 'not in saved output';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'not in saved output';
    return `${date.toISOString().slice(11, 16)} UTC`;
  };
  const readableFeature = key => ({
    PREV_ARR_DELAY_LOG1P: 'Previous arrival delay',
    PREV_DELAY_X_SHORT_SLACK: 'Previous delay × short turnaround',
    DEPARTURE_HOUR_SIN: 'Departure time (cycle)',
    SCHEDULED_SLACK_LOG1P: 'Turnaround slack',
    SHORT_SLACK_LT_60: 'Turnaround under 60 min',
    DEPARTURE_HOUR_COS: 'Departure time (cycle)',
    ORIGIN: 'Origin airport', DEST: 'Destination airport', DAY_OF_WEEK: 'Day of week'
  })[key] || key.replaceAll('_', ' ').toLowerCase();
  const currentPrediction = row => Number(row.MODEL_RELATIVE_SCORE) >= selectedThreshold;

  const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const rangeText = (value, suffix = ' min') => value == null ? '—' : `${Math.round(value)}${suffix}`;

  function renderQuality() {
    const cards = [
      ['Missing tail numbers', quality.missing_tail_numbers, 'raw WN flight rows', true],
      ['Cancelled flights', quality.cancelled_flights, 'kept in flight-level data', true],
      ['Diverted flights', quality.diverted_flights, 'kept as disruption barriers', true],
      ['Missing timestamps', quality.missing_timestamp_values ?? quality.missing_timestamps, 'unresolved UTC fields', true],
      ['Unknown airport timezones', quality.unknown_airport_timezones, 'airport mappings unresolved', false],
      ['Invalid turnaround values', quality.invalid_turnaround_values, 'candidate pairs outside 0–24 h', true],
      ['Linked aircraft pairs', quality.linked_aircraft_pairs, 'tail + airport handoffs accepted', false],
      ['Rejected aircraft pairs', quality.rejected_aircraft_pairs, 'candidate handoffs excluded', true]
    ];
    el('qualityGrid').innerHTML = cards.map(([label, value, note, warn]) => `<article class="quality-card ${warn && Number(value) > 0 ? 'warn' : ''}"><b>${Number(value).toLocaleString()}</b><small>${label}</small><span>${note}</span></article>`).join('');
    el('qualityNote').textContent = `${Number(quality.linked_aircraft_pairs).toLocaleString()} of ${Number(quality.candidate_aircraft_pairs || quality.linked_aircraft_pairs).toLocaleString()} candidate aircraft handoffs were linked. Cancelled and diverted records remain visible in the quality accounting but are excluded from predictive pairs.`;
  }

  function setupFilters() {
    const unique = key => [...new Set(allFlights.map(row => String(row[key] ?? '').trim()).filter(Boolean))].sort();
    const options = (id, values, label = value => value) => { el(id).insertAdjacentHTML('beforeend', values.map(value => `<option value="${value}">${label(value)}</option>`).join('')); };
    options('filterTail', unique('TAIL_NUM')); options('filterOrigin', unique('ORIGIN'), airportLabel); options('filterDest', unique('DEST'), airportLabel);
    const months = [...new Set(allFlights.map(row => String(row.FLIGHT_DATE || '').slice(0, 7)).filter(Boolean))].sort();
    const dates = [...new Set(allFlights.map(row => String(row.FLIGHT_DATE || '').slice(0, 10)).filter(Boolean))].sort();
    options('filterMonth', [...months, ...dates], value => value.length === 7 ? value.replace('-', ' / ') : `Date · ${value}`);
    const values = id => allFlights.map(row => numeric(row[id])).filter(value => value != null);
    const configureRange = (id, list) => { const input = el(id); input.min = Math.floor(Math.min(...list)); input.max = Math.ceil(Math.max(...list)); input.value = input.max; return input; };
    configureRange('prevDelayRange', values('PREV_ARR_DELAY_MIN')); configureRange('slackRange', values('SCHEDULED_TURNAROUND_SLACK_MIN'));
    const apply = () => {
      const severity = el('filterSeverity').value;
      const prevMax = Number(el('prevDelayRange').value); const slackMax = Number(el('slackRange').value);
      filteredFlights = allFlights.filter(row => {
        const delay = numeric(row.DEP_DELAY_MIN) ?? 0; const prev = numeric(row.PREV_ARR_DELAY_MIN); const slack = numeric(row.SCHEDULED_TURNAROUND_SLACK_MIN);
        const matchesSeverity = !severity || (severity === 'clear' && delay < 15) || (severity === 'mild' && delay >= 15 && delay < 60) || (severity === 'severe' && delay >= 60);
        const period = el('filterMonth').value; const matchesPeriod = !period || (period.length === 7 ? String(row.FLIGHT_DATE).slice(0, 7) === period : String(row.FLIGHT_DATE).slice(0, 10) === period);
        return (!el('filterTail').value || tailKey(row) === el('filterTail').value) && (!el('filterOrigin').value || row.ORIGIN === el('filterOrigin').value) && (!el('filterDest').value || row.DEST === el('filterDest').value) && matchesPeriod && matchesSeverity && prev != null && prev <= prevMax && slack != null && slack <= slackMax;
      });
      const availableTails = [...new Set(filteredFlights.map(tailKey).filter(Boolean))].sort();
      if (!availableTails.includes(selectedTail)) selectedTail = availableTails[0] || '';
      flights = filteredFlights.filter(row => tailKey(row) === selectedTail); selectedFlight = Math.max(0, Math.min(selectedFlight, flights.length - 1));
      el('tailSelector').innerHTML = availableTails.map(tail => `<option value="${tail}">${tail} · ${filteredFlights.filter(row => tailKey(row) === tail).length} linked legs</option>`).join(''); el('tailSelector').value = selectedTail;
      el('filterCount').textContent = filteredFlights.length.toLocaleString(); el('filterSummary').textContent = `linked flight pairs match the current filters · ${availableTails.length.toLocaleString()} tails`;
      el('prevRangeValue').textContent = `${rangeText(Number(el('prevDelayRange').min))}–${rangeText(prevMax)}`; el('slackRangeValue').textContent = `${rangeText(Number(el('slackRange').min))}–${rangeText(slackMax)}`; renderFlight();
    };
    ['filterTail','filterOrigin','filterDest','filterMonth','filterSeverity','prevDelayRange','slackRange'].forEach(id => el(id).addEventListener('input', apply));
    el('tailSelector').addEventListener('change', () => { el('filterTail').value = el('tailSelector').value; apply(); });
    el('resetFilters').addEventListener('click', () => { ['filterTail','filterOrigin','filterDest','filterMonth','filterSeverity'].forEach(id => { el(id).value = ''; }); el('prevDelayRange').value = el('prevDelayRange').max; el('slackRange').value = el('slackRange').max; apply(); }); apply();
  }

  function setupTailSelector() {
    el('tailSelector').value = selectedTail;
    el('tailSelector').innerHTML = tails.map(tail => `<option value="${tail}">${tail} · ${allFlights.filter(row => tailKey(row) === tail).length} linked legs</option>`).join('');
    el('chainTail').textContent = selectedTail || 'Aircraft chain';
     // Only chains with stored per-flight model results and what-if outputs are offered here.
    // Selection is handled by setupFilters so filter controls and the demo
    // selector always operate on the same filtered flight list.
  }

  function renderBoard() {
    el('flightBoard').innerHTML = flights.map((flight, i) => {
      const delayed = Number(flight.DEP_DEL15) === 1;
      const label = delayed ? '15+ MIN LATE' : 'UNDER 15 MIN';
      return `<button class="leg-button ${i === selectedFlight ? 'selected' : ''}" type="button" data-leg="${i}" aria-pressed="${i === selectedFlight}">
        <span class="leg-index">0${i + 1}</span><span class="leg-content"><span class="leg-meta">WN ${flight.FLIGHT_NUM} <i>·</i> ${new Date(`${flight.FLIGHT_DATE}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span><b>${flight.ORIGIN} <i>→</i> ${flight.DEST}</b><small>Inbound ${minuteText(flight.PREV_ARR_DELAY_MIN)} min <i>·</i> turn ${Math.round(Number(flight.SCHEDULED_TURNAROUND_SLACK_MIN))} min</small></span><span class="leg-status ${delayed ? 'is-late' : 'is-clear'}">${label}</span><span class="leg-chevron">›</span>
      </button>`;
    }).join('');
    el('flightBoard').querySelectorAll('.leg-button').forEach(button => button.addEventListener('click', () => {
      selectedFlight = Number(button.dataset.leg);
      selectedScenario = 0;
      renderFlight();
    }));
  }

  function renderAllFlightDetails() {
    el('allFlightDetails').innerHTML = flights.map((flight, index) => {
      const delayed = Number(flight.DEP_DEL15) === 1;
      const predicted = currentPrediction(flight);
      const actualDelay = Number(flight.DEP_DELAY_MIN);
      return `<article class="all-flight-card ${index === selectedFlight ? 'selected' : ''}">
        <div class="all-flight-card-head"><span>LEG 0${index + 1}</span><b>WN ${flight.FLIGHT_NUM}</b><span>${flight.FLIGHT_DATE}</span></div>
        <h3>${flight.ORIGIN} → ${flight.DEST}</h3>
        <div class="all-flight-stats"><span><small>PREVIOUS ARRIVAL</small><b>${timeText(flight.PREV_ACTUAL_ARR_UTC)}</b></span><span><small>SCHEDULED DEPARTURE</small><b>${timeText(flight.SCHEDULED_DEP_UTC)}</b></span><span><small>INBOUND DELAY / TURN</small><b>${minuteText(flight.PREV_ARR_DELAY_MIN)} / ${Math.round(Number(flight.SCHEDULED_TURNAROUND_SLACK_MIN))} min</b></span><span><small>ACTUAL DEPARTURE</small><b>${timeText(flight.ACTUAL_DEP_UTC)} · ${actualDelay > 0 ? `+${Math.round(actualDelay)} late` : actualDelay < 0 ? `${Math.abs(Math.round(actualDelay))} early` : 'on time'}</b></span></div>
        <p>${delayed ? 'Actual outcome: 15+ min late' : 'Actual outcome: under 15 min'} · Relative score ${Number(flight.MODEL_RELATIVE_SCORE).toFixed(3)}</p>
      </article>`;
    }).join('');
  }

  function setupAllFlightDetails() {
    el('allFlightsToggle').addEventListener('click', () => {
      const expanded = el('allFlightsToggle').getAttribute('aria-expanded') === 'true';
      el('allFlightsToggle').setAttribute('aria-expanded', String(!expanded));
      el('allFlightsToggle').textContent = expanded ? 'Show all flight details' : 'Hide all flight details';
      el('allFlightDetails').hidden = expanded;
    });
  }

  function renderMap() {
    const layer = el('dynamicMapLayer');
    if (!layer) return;
    if (!flights.length) { layer.innerHTML = ''; el('chainProgress').textContent = 'NO LEGS'; return; }

    // The original map used a fixed five-airport demo route. Hide those legacy
    // nodes and redraw the selected tail's actual chain on every render.
    document.querySelectorAll('.route-base, .airport, #routeDone, #routeNow, #plane')
      .forEach(node => { node.style.display = 'none'; });

    const stopCodes = [...new Set([flights[0].ORIGIN, ...flights.map(row => row.DEST)].filter(Boolean))];
    const denominator = Math.max(1, stopCodes.length - 1);
    const points = new Map(stopCodes.map((code, index) => [code, {
      x: 80 + (index * 740 / denominator),
      y: 145 + Math.sin(index * 1.35) * Math.min(62, 28 + stopCodes.length * 4)
    }]));
    const routePath = (from, to, index) => {
      if (!from || !to) return '';
      const bend = index % 2 === 0 ? 38 : -38;
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 + bend;
      return `M${from.x} ${from.y} Q${midX} ${midY} ${to.x} ${to.y}`;
    };
    const routePaths = flights.map((row, index) => routePath(points.get(row.ORIGIN), points.get(row.DEST), index));
    const currentPath = routePaths[selectedFlight] || '';
    const currentRow = flights[selectedFlight];
    const currentFrom = currentRow && points.get(currentRow.ORIGIN);
    const currentTo = currentRow && points.get(currentRow.DEST);
    const plane = currentFrom && currentTo
      ? `<g class="map-plane" transform="translate(${(currentFrom.x + currentTo.x) / 2} ${(currentFrom.y + currentTo.y) / 2})"><text text-anchor="middle" y="7">✈</text></g>`
      : '';
    const stops = stopCodes.map((code, index) => {
      const point = points.get(code);
      const active = index === selectedFlight || index === selectedFlight + 1;
      const done = index < selectedFlight;
      return `<g class="airport ${active ? 'active' : ''} ${done ? 'done' : ''}" transform="translate(${point.x} ${point.y})"><circle r="11"/><circle class="airport-dot" r="3"/><text y="27">${code}</text></g>`;
    }).join('');
    layer.innerHTML = `${routePaths.map(path => `<path class="route-base" d="${path}"/>`).join('')}<path class="route-done" d="${routePaths.slice(0, selectedFlight).join(' ')}"/><path class="route-now" d="${currentPath}"/>${stops}${plane}`;
    el('chainProgress').textContent = `LEG 0${selectedFlight + 1} / 0${flights.length}`;
  }

  function renderFlight() {
    const row = flights[selectedFlight];
    if (!row) {
      renderBoard(); renderAllFlightDetails(); renderMap();
      el('chainTail').textContent = selectedTail || 'No matching aircraft';
      el('selectedTitle').textContent = 'No matching flight pair';
      el('flightDate').textContent = 'ADJUST FILTERS';
      el('scenarioOptions').innerHTML = '<span class="muted">No stored feature-only scenarios are available for this flight.</span>';
      el('scenarioDetail').textContent = '';
      el('scenarioChart').textContent = '';
      return;
    }
    const predicted = currentPrediction(row);
    const actualDelayed = Number(row.DEP_DEL15) === 1;
    const correct = predicted === actualDelayed;
    const previousDelay = Number(row.PREV_ARR_DELAY_MIN);
    const slack = Number(row.SCHEDULED_TURNAROUND_SLACK_MIN);
    const actual = Number(row.DEP_DELAY_MIN);

    renderBoard();
    renderAllFlightDetails();
    renderMap();
    el('selectedTitle').innerHTML = `WN ${row.FLIGHT_NUM} <span>${row.ORIGIN} → ${row.DEST}</span>`;
    el('flightDate').textContent = new Date(`${row.FLIGHT_DATE}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
    el('prevRoute').textContent = `WN ${String(row.PREV_FLIGHT_NUM).replace(/\.0$/, '')} · ${row.PREV_ORIGIN} → ${row.PREV_DEST}`;
    el('prevDelay').innerHTML = `${minuteText(previousDelay)} <small>min</small>`;
    el('prevFlightTime').textContent = `Scheduled ${timeText(row.PREV_SCHEDULED_ARR_UTC)} · actual ${timeText(row.PREV_ACTUAL_ARR_UTC)}`;
    el('turnLocation').textContent = `${row.ORIGIN} · ${airportNames[row.ORIGIN] || 'turnaround airport'}`;
    el('turnSlack').innerHTML = `${Math.round(slack)} <small>min</small>`;
    el('turnMeter').style.width = `${Math.max(4, Math.min(100, slack / 3.6))}%`;
    el('turnContext').textContent = slack < 60 ? 'Tight scheduled turnaround' : slack > 180 ? 'Long scheduled turnaround' : 'Scheduled turnaround buffer';
    el('nextRoute').textContent = `${row.ORIGIN} → ${row.DEST}`;
    el('actualDelay').innerHTML = actual > 0 ? `+${Math.round(actual)} <small>min late</small>` : actual < 0 ? `${Math.abs(Math.round(actual))} <small>min early</small>` : 'On time';
    el('scheduledDeparture').textContent = timeText(row.SCHEDULED_DEP_UTC);
    el('actualDeparture').textContent = timeText(row.ACTUAL_DEP_UTC);
    el('predictionValue').textContent = predicted ? 'DELAYED' : 'UNDER 15 MIN';
    el('actualOutcome').textContent = `Actual: ${actualDelayed ? '15+ min late' : 'under 15 min'}`;
     el('correctOutcome').textContent = correct ? 'RESULT MATCHES OUTCOME' : 'RESULT DIFFERS FROM OUTCOME';
    el('predictionCard').classList.toggle('predicted-delay', predicted);
    el('predictionCard').classList.toggle('prediction-wrong', !correct);
    const score = Number(row.MODEL_RELATIVE_SCORE);
    el('modelScore').textContent = score.toFixed(3);
    el('scoreMeter').style.width = `${Math.round(score * 100)}%`;
    renderScenarios(row);
  }

  function scenariosForFlight(row) {
    const matches = scenarioRows.filter(item => tailKey(item) === tailKey(row) && String(item.FLIGHT_NUM).replace(/\.0$/, '') === String(row.FLIGHT_NUM).replace(/\.0$/, '') && item.FLIGHT_DATE === row.FLIGHT_DATE && item.ORIGIN === row.ORIGIN && item.DEST === row.DEST && item.SCHEDULED_DEP_UTC === row.SCHEDULED_DEP_UTC);
    const byBuffer = new Map(matches.map(item => [Number(item.EXTRA_SCHEDULED_SLACK_MIN), item]));
    return [0, 5, 10, 15, 20, 30, 45, 60].map(buffer => byBuffer.get(buffer)).filter(Boolean);
  }
  function renderScenarios(row) {
    const scenarios = scenariosForFlight(row);
    const chosen = scenarios[selectedScenario] || scenarios[0];
    if (!chosen) { el('scenarioOptions').innerHTML = '<span class="muted">No stored feature-only scenarios are available for this flight.</span>'; el('scenarioDetail').textContent = ''; el('scenarioChart').textContent = ''; return; }
    selectedScenario = Math.min(selectedScenario, scenarios.length - 1);
    el('scenarioOptions').innerHTML = scenarios.map((item, i) => `<button class="scenario-choice ${i === selectedScenario ? 'active' : ''}" data-scenario="${i}" aria-pressed="${i === selectedScenario}"><small>${Number(item.EXTRA_SCHEDULED_SLACK_MIN) === 0 ? 'ORIGINAL' : 'EXTRA SLACK'}</small><b>+${item.EXTRA_SCHEDULED_SLACK_MIN} min</b></button>`).join('');
    el('scenarioOptions').querySelectorAll('.scenario-choice').forEach(button => button.addEventListener('click', () => {
      selectedScenario = Number(button.dataset.scenario);
      renderScenarios(row);
    }));
    const extra = Number(chosen.EXTRA_SCHEDULED_SLACK_MIN);
    const score = Number(chosen.MODEL_RELATIVE_SCORE);
    const alert = Number(chosen.MODEL_ALERT_AT_LOCKED_THRESHOLD) === 1;
    const changed = alert !== (Number(scenarios[0].MODEL_ALERT_AT_LOCKED_THRESHOLD) === 1);
    el('scenarioDetail').innerHTML = `<div><small>TURNAROUND IN THIS WHAT-IF</small><b>${Math.round(Number(row.SCHEDULED_TURNAROUND_SLACK_MIN))} <i>→</i> ${Math.round(Number(row.SCHEDULED_TURNAROUND_SLACK_MIN) + extra)} min</b><span>Original <i>→</i> hypothetical</span></div><div><small>RELATIVE MODEL SCORE</small><b>${score.toFixed(3)}</b><span>${alert ? 'Stored result flags 15+ min delay' : 'Stored result flags under 15 min'}</span></div><div class="scenario-change ${changed ? 'changed' : ''}"><small>STORED RESULT CHANGE</small><b>${changed ? 'Changed' : 'No change'}</b><span>Compared with original schedule</span></div>`;
    el('scenarioChart').innerHTML = scenarios.map(item => {
      const value = Number(item.MODEL_RELATIVE_SCORE);
      const minutes = Number(item.EXTRA_SCHEDULED_SLACK_MIN);
      const active = item === chosen;
      return `<button class="score-column ${active ? 'active' : ''}" data-scenario="${scenarios.indexOf(item)}" title="${minutes} extra minutes · relative score ${value.toFixed(3)}"><span class="score-column-value">${value.toFixed(3)}</span><span class="score-column-track"><i style="height:${Math.max(5, value * 100)}%"></i></span><span class="score-column-label">+${minutes} MIN</span></button>`;
    }).join('');
    el('scenarioChart').querySelectorAll('.score-column').forEach(button => button.addEventListener('click', () => {
      selectedScenario = Number(button.dataset.scenario);
      renderScenarios(row);
    }));
  }

  function renderImportance() {
    const items = DATA.importance || [];
    if (!items.length) { el('importanceChart').innerHTML = '<span class="muted">Impurity importance is unavailable.</span>'; return; }
    el('importanceChart').innerHTML = items.map((item, index) => {
      const value = Number(item.IMPORTANCE);
      const primary = ['PREV_ARR_DELAY_LOG1P', 'PREV_DELAY_X_SHORT_SLACK', 'SCHEDULED_SLACK_LOG1P'].includes(item.ORIGINAL_FEATURE);
      return `<div class="importance-row ${index >= 5 ? 'extra-feature' : ''}" title="${readableFeature(item.ORIGINAL_FEATURE)} · ${(value * 100).toFixed(2)}% of total Random Forest importance" ${index >= 5 ? 'hidden' : ''}><div class="importance-label"><span>${readableFeature(item.ORIGINAL_FEATURE)}</span><b>${(value * 100).toFixed(1)}%</b></div><div class="importance-track"><i class="${primary ? 'primary-feature' : ''}" style="width:${value / Number(items[0].IMPORTANCE) * 100}%"></i></div></div>`;
    }).join('');
    el('featureToggle').addEventListener('click', () => {
      const expanded = el('featureToggle').getAttribute('aria-expanded') === 'true';
      el('featureToggle').setAttribute('aria-expanded', String(!expanded));
      document.querySelectorAll('.extra-feature').forEach(row => { row.hidden = expanded; });
      el('featureToggle').textContent = expanded ? 'Show remaining features' : 'Show fewer features';
    });
  }

  function renderPermutationAndShap() {
    const permutation = DATA.permutationImportance || [];
    const shap = DATA.shapImportance || [];
    const rows = permutation.slice(0, 6);
    el('permutationChart').innerHTML = `<div class="explainability-subtitle">Permutation importance · ROC-AUC drop</div>${rows.length ? rows.map(item => `<div class="importance-row"><div class="importance-label"><span>${item.FEATURE_LABEL || item.FEATURE}</span><b>${Number(item.MEAN_IMPORTANCE).toFixed(4)}</b></div><div class="importance-track"><i class="primary-feature" style="width:${Math.min(100, Math.max(2, Number(item.MEAN_IMPORTANCE) * 900))}%"></i></div></div>`).join('') : '<span class="muted">Permutation importance unavailable.</span>'}`;
    if (shap.length) el('permutationChart').insertAdjacentHTML('beforeend', `<div class="explainability-subtitle">Mean absolute SHAP contribution</div>${shap.slice(0, 5).map(item => `<div class="importance-row"><div class="importance-label"><span>${item.FEATURE_LABEL || item.FEATURE}</span><b>${Number(item.MEAN_ABS_SHAP).toFixed(4)}</b></div><div class="importance-track"><i style="width:${Math.min(100, Math.max(2, Number(item.MEAN_ABS_SHAP) * 150))}%"></i></div></div>`).join('')}`);
  }

  function thresholdRow() {
    const rows = Array.isArray(DATA.thresholdMetrics) ? DATA.thresholdMetrics : [];
    return rows.length ? rows.reduce((closest, row) => Math.abs(Number(row.THRESHOLD) - selectedThreshold) < Math.abs(Number(closest.THRESHOLD) - selectedThreshold) ? row : closest, rows[0]) : null;
  }

  function renderThresholdDiagnostics() {
    const row = thresholdRow();
    if (!row) {
      el('thresholdMetrics').innerHTML = '<span class="muted">Threshold metrics are unavailable in this dashboard export.</span>';
      el('thresholdMatrix').innerHTML = '';
      el('prChart').innerHTML = '';
      return;
    }
    const threshold = Number(row.THRESHOLD);
    el('thresholdValue').value = threshold.toFixed(2);
    el('thresholdSlider').value = threshold.toFixed(2);
    el('thresholdMetrics').innerHTML = [['Precision', row.PRECISION], ['Recall', row.RECALL], ['F1', row.F1], ['Predicted delays', row.PREDICTED_DELAY_COUNT]].map(([label, value]) => `<div><small>${label}</small><b>${label === 'Predicted delays' ? Number(value).toLocaleString() : Number(value).toFixed(3)}</b></div>`).join('');
    el('thresholdMatrixLabel').textContent = `Threshold ${threshold.toFixed(2)}`;
    el('thresholdMatrix').innerHTML = `<div class="matrix-corner"></div><div class="matrix-col">Under 15 min</div><div class="matrix-col">15+ min</div><div class="matrix-row">Under 15 min</div><div class="matrix-cell tn"><b>${Number(row.TN).toLocaleString()}</b></div><div class="matrix-cell fp"><b>${Number(row.FP).toLocaleString()}</b></div><div class="matrix-row">15+ min</div><div class="matrix-cell fn"><b>${Number(row.FN).toLocaleString()}</b></div><div class="matrix-cell tp"><b>${Number(row.TP).toLocaleString()}</b></div>`;
    el('prChart').innerHTML = DATA.thresholdMetrics.map(item => `<div class="pr-row ${Number(item.THRESHOLD) === threshold ? 'active' : ''}"><span>${Number(item.THRESHOLD).toFixed(2)}</span><i style="width:${Number(item.PRECISION) * 100}%"></i><b>${(Number(item.PRECISION) * 100).toFixed(0)}%</b><i class="recall" style="width:${Number(item.RECALL) * 100}%"></i><b>${(Number(item.RECALL) * 100).toFixed(0)}%</b></div>`).join('');
  }

  function setupThresholdControl() {
    el('thresholdSlider').addEventListener('input', () => { selectedThreshold = Number(el('thresholdSlider').value); renderThresholdDiagnostics(); renderFlight(); });
  }

  function setupNavigation() {
    const links = [...document.querySelectorAll('.nav-link')];
    const sections = links.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, .1, .25] });
    sections.forEach(section => observer.observe(section));
  }

  setupTailSelector();
  setupFilters();
  renderQuality();
  setupAllFlightDetails();
  setupThresholdControl();
  renderImportance();
  renderPermutationAndShap();
  renderThresholdDiagnostics();
  renderFlight();
  setupNavigation();
})();
