(() => {
  const DATA = window.DASHBOARD_DATA;
  if (!DATA) return;

  const tailKey = row => String(row.TAIL_NUM ?? '').trim();
  const allFlights = DATA.chain.filter(row => Number(row.EXTRA_SCHEDULED_SLACK_MIN) === 0);
  const scenarioRows = DATA.chain;
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
  const airports = ['LAS', 'DAL', 'TPA', 'HOU', 'ONT'];
  const airportNames = { LAS: 'Las Vegas', DAL: 'Dallas', TPA: 'Tampa', HOU: 'Houston', ONT: 'Ontario' };
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

  const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const rangeText = (value, suffix = ' min') => value == null ? '—' : `${Math.round(value)}${suffix}`;

  function renderQuality() {
    const cards = [
      ['Missing tail numbers', quality.missing_tail_numbers, 'raw WN flight rows', true],
      ['Cancelled flights', quality.cancelled_flights, 'kept in flight-level data', true],
      ['Diverted flights', quality.diverted_flights, 'kept as disruption barriers', true],
      ['Missing timestamps', quality.missing_timestamps, 'unresolved UTC fields', true],
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
    options('filterTail', unique('TAIL_NUM')); options('filterOrigin', unique('ORIGIN')); options('filterDest', unique('DEST'));
    const months = [...new Set(allFlights.map(row => String(row.FLIGHT_DATE || '').slice(0, 7)).filter(Boolean))].sort();
    const dates = [...new Set(allFlights.map(row => String(row.FLIGHT_DATE || '').slice(0, 10)).filter(Boolean))].sort();
    options('filterMonth', [...months, ...dates], value => value.length === 7 ? value.replace('-', ' / ') : `Date · ${value}`);
    const values = id => allFlights.map(row => numeric(row[id])).filter(value => value != null);
    const configureRange = (id, list) => { const input = el(id); input.min = Math.floor(Math.min(...list)); input.max = Math.ceil(Math.max(...list)); input.value = input.max; return input; };
    configureRange('prevDelayRange', values('PREV_ARR_DELAY_MIN')); configureRange('slackRange', values('SCHEDULED_TURNAROUND_SLACK_MIN'));
    const apply = () => {
      const severity = el('filterSeverity').value; const correct = el('filterCorrect').value;
      const prevMax = Number(el('prevDelayRange').value); const slackMax = Number(el('slackRange').value);
      filteredFlights = allFlights.filter(row => {
        const delay = numeric(row.DEP_DELAY_MIN) ?? 0; const prev = numeric(row.PREV_ARR_DELAY_MIN); const slack = numeric(row.SCHEDULED_TURNAROUND_SLACK_MIN); const actual = Number(row.DEP_DEL15) === 1; const predicted = currentPrediction(row);
        const matchesSeverity = !severity || (severity === 'clear' && delay < 15) || (severity === 'mild' && delay >= 15 && delay < 60) || (severity === 'severe' && delay >= 60);
        const matchesCorrect = !correct || (correct === 'correct' ? predicted === actual : predicted !== actual);
        const period = el('filterMonth').value; const matchesPeriod = !period || (period.length === 7 ? String(row.FLIGHT_DATE).slice(0, 7) === period : String(row.FLIGHT_DATE).slice(0, 10) === period);
        return (!el('filterTail').value || tailKey(row) === el('filterTail').value) && (!el('filterOrigin').value || row.ORIGIN === el('filterOrigin').value) && (!el('filterDest').value || row.DEST === el('filterDest').value) && matchesPeriod && matchesSeverity && matchesCorrect && prev != null && prev <= prevMax && slack != null && slack <= slackMax;
      });
      const availableTails = [...new Set(filteredFlights.map(tailKey).filter(Boolean))].sort();
      if (!availableTails.includes(selectedTail)) selectedTail = availableTails[0] || '';
      flights = filteredFlights.filter(row => tailKey(row) === selectedTail); selectedFlight = Math.max(0, Math.min(selectedFlight, flights.length - 1));
      el('tailSelector').innerHTML = availableTails.map(tail => `<option value="${tail}">${tail} · ${filteredFlights.filter(row => tailKey(row) === tail).length} linked legs</option>`).join(''); el('tailSelector').value = selectedTail;
      el('filterCount').textContent = filteredFlights.length.toLocaleString(); el('filterSummary').textContent = `linked flight pairs match the current filters · ${availableTails.length.toLocaleString()} tails`;
      el('prevRangeValue').textContent = `${rangeText(Number(el('prevDelayRange').min))}–${rangeText(prevMax)}`; el('slackRangeValue').textContent = `${rangeText(Number(el('slackRange').min))}–${rangeText(slackMax)}`; renderFlight();
    };
    ['filterTail','filterOrigin','filterDest','filterMonth','filterSeverity','filterCorrect','prevDelayRange','slackRange'].forEach(id => el(id).addEventListener('input', apply));
    el('tailSelector').addEventListener('change', () => { el('filterTail').value = el('tailSelector').value; apply(); });
    el('resetFilters').addEventListener('click', () => { ['filterTail','filterOrigin','filterDest','filterMonth','filterSeverity','filterCorrect'].forEach(id => { el(id).value = ''; }); el('prevDelayRange').value = el('prevDelayRange').max; el('slackRange').value = el('slackRange').max; apply(); }); apply();
  }

  function setupTailSelector() {
    el('tailSelector').value = selectedTail;
    el('tailSelector').innerHTML = tails.map(tail => `<option value="${tail}">${tail} · ${allFlights.filter(row => tailKey(row) === tail).length} linked legs</option>`).join('');
    el('chainTail').textContent = selectedTail || 'Aircraft chain';
     // Only chains with stored per-flight model results and what-if outputs are offered here.
    el('tailSelector').addEventListener('change', () => {
      selectedTail = el('tailSelector').value;
      flights = allFlights.filter(row => tailKey(row) === selectedTail);
      selectedFlight = Math.max(0, flights.length - 1);
      selectedScenario = 0;
      el('chainTail').textContent = selectedTail || 'Aircraft chain';
      renderFlight();
    });
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
        <div class="all-flight-stats"><span><small>INBOUND DELAY</small><b>${minuteText(flight.PREV_ARR_DELAY_MIN)} min</b></span><span><small>TURNAROUND</small><b>${Math.round(Number(flight.SCHEDULED_TURNAROUND_SLACK_MIN))} min</b></span><span><small>ACTUAL DEPARTURE</small><b>${actualDelay > 0 ? `+${Math.round(actualDelay)} min late` : actualDelay < 0 ? `${Math.abs(Math.round(actualDelay))} min early` : 'On time'}</b></span><span><small>MODEL</small><b>${predicted ? '15+ min delay' : 'Under 15 min'}</b></span></div>
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
    if (!layer || !flights.length) return;

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
    el('prevFlightTime').textContent = 'exact arrival times not in saved model output';
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
    renderExplanation(row);
  }

  function scenariosForFlight(row) {
    return scenarioRows.filter(item => tailKey(item) === tailKey(row) && String(item.FLIGHT_NUM).replace(/\.0$/, '') === String(row.FLIGHT_NUM).replace(/\.0$/, '') && item.FLIGHT_DATE === row.FLIGHT_DATE)
      .sort((a, b) => Number(a.EXTRA_SCHEDULED_SLACK_MIN) - Number(b.EXTRA_SCHEDULED_SLACK_MIN));
  }
  function renderScenarios(row) {
    const scenarios = scenariosForFlight(row);
    const chosen = scenarios[selectedScenario] || scenarios[0];
    if (!chosen) return;
    el('scenarioOptions').innerHTML = scenarios.map((item, i) => `<button class="scenario-choice ${i === selectedScenario ? 'active' : ''}" data-scenario="${i}" aria-pressed="${i === selectedScenario}"><small>${Number(item.EXTRA_SCHEDULED_SLACK_MIN) === 0 ? 'ORIGINAL' : 'EXTRA SLACK'}</small><b>+${item.EXTRA_SCHEDULED_SLACK_MIN} min</b></button>`).join('');
    el('scenarioOptions').querySelectorAll('.scenario-choice').forEach(button => button.addEventListener('click', () => {
      selectedScenario = Number(button.dataset.scenario);
      renderScenarios(row);
    }));
    const extra = Number(chosen.EXTRA_SCHEDULED_SLACK_MIN);
    const score = Number(chosen.MODEL_RELATIVE_SCORE);
    const alert = Number(chosen.MODEL_RELATIVE_SCORE) >= selectedThreshold;
    const changed = alert !== (Number(scenarios[0].MODEL_RELATIVE_SCORE) >= selectedThreshold);
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

  function renderPopulationScenarios() {
    const entries = DATA.populationScenarios;
    el('populationScenario').innerHTML = entries.map(item => {
      const minutes = Number(item.EXTRA_SCHEDULED_SLACK_MIN);
      const score = Number(item.MEAN_MODEL_SCORE);
      return `<div class="population-row"><span>+${minutes} min</span><div class="population-bar"><i style="width:${score * 100}%"></i></div><b>${score.toFixed(3)}</b></div>`;
    }).join('');
    el('populationScenario').insertAdjacentHTML('afterend', '<div class="population-caption">Mean score across April records, using stored feature-only scenario outputs.</div>');
    const monotonic = Number(DATA.scenarioMonotonicShare);
    el('scenarioMonotonicNote').textContent = Number.isFinite(monotonic) ? `${(monotonic * 100).toFixed(1)}% of April flights have non-increasing scores across the full slack range; this is a sensitivity result, not a guarantee.` : 'Monotonicity is reported after the next dashboard data regeneration.';
    const empirical = DATA.empiricalTurnaround || [];
    el('empiricalTurnaround').innerHTML = empirical.length ? `<div class="explainability-subtitle">Historical comparison by scheduled slack</div>${empirical.map(item => `<div class="empirical-row"><span>${item.TURNAROUND_SLACK_BAND} min</span><b>${(Number(item.EMPIRICAL_DELAY_RATE) * 100).toFixed(1)}%</b><small>${Number(item.FLIGHT_COUNT).toLocaleString()} flights</small></div>`).join('')}` : '';
  }

  function renderImportance() {
    const items = DATA.importance;
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
    el('permutationChart').innerHTML = `<div class="explainability-subtitle">Permutation importance · ROC-AUC drop</div>${rows.length ? rows.map(item => `<div class="importance-row"><div class="importance-label"><span>${item.FEATURE_LABEL || item.FEATURE}</span><b>${Number(item.MEAN_IMPORTANCE).toFixed(4)}</b></div><div class="importance-track"><i class="primary-feature" style="width:${Math.min(100, Math.max(2, Number(item.MEAN_IMPORTANCE) * 900))}%"></i></div></div>`).join('') : '<span class="muted">Permutation and SHAP exports will appear after the next dashboard data regeneration.</span>'}`;
    if (shap.length) el('permutationChart').insertAdjacentHTML('beforeend', `<div class="explainability-subtitle">Mean absolute SHAP contribution</div>${shap.slice(0, 5).map(item => `<div class="importance-row"><div class="importance-label"><span>${item.FEATURE_LABEL || item.FEATURE}</span><b>${Number(item.MEAN_ABS_SHAP).toFixed(4)}</b></div><div class="importance-track"><i style="width:${Math.min(100, Math.max(2, Number(item.MEAN_ABS_SHAP) * 150))}%"></i></div></div>`).join('')}`);
  }

  function renderScatter() {
    const svg = el('scatterChart');
    const W = 620, H = 300, left = 54, right = 18, top = 16, bottom = 42;
    const xMin = -30, xMax = 180, yMin = -30, yMax = 180;
    const x = value => left + (Math.max(xMin, Math.min(xMax, value)) - xMin) / (xMax - xMin) * (W - left - right);
    const y = value => H - bottom - (Math.max(yMin, Math.min(yMax, value)) - yMin) / (yMax - yMin) * (H - top - bottom);
    const ticks = [-30, 0, 60, 120, 180];
    let markup = '';
    ticks.forEach(tick => {
      markup += `<line class="chart-grid" x1="${left}" y1="${y(tick)}" x2="${W - right}" y2="${y(tick)}"/><line class="chart-grid vertical" x1="${x(tick)}" y1="${top}" x2="${x(tick)}" y2="${H - bottom}"/><text class="axis-tick" x="${left - 9}" y="${y(tick) + 4}" text-anchor="end">${tick}</text><text class="axis-tick" x="${x(tick)}" y="${H - 20}" text-anchor="middle">${tick}</text>`;
    });
    markup += `<line class="zero-line" x1="${left}" y1="${y(0)}" x2="${W-right}" y2="${y(0)}"/><line class="zero-line" x1="${x(0)}" y1="${top}" x2="${x(0)}" y2="${H-bottom}"/>`;
    DATA.scatter.forEach((point, i) => {
      markup += `<circle class="scatter-dot" data-point="${i}" cx="${x(point.x)}" cy="${y(point.y)}" r="2.8"/>`;
    });
    markup += `<text class="axis-label" x="${(left + W-right)/2}" y="${H-2}" text-anchor="middle">PREVIOUS ARRIVAL DELAY · MINUTES</text><text class="axis-label" transform="translate(13 ${(top+H-bottom)/2}) rotate(-90)" text-anchor="middle">NEXT DEPARTURE DELAY · MINUTES</text>`;
    svg.innerHTML = markup;
    const tooltip = el('scatterTooltip');
    svg.querySelectorAll('.scatter-dot').forEach(dot => {
      const point = DATA.scatter[Number(dot.dataset.point)];
      const show = event => {
        const box = svg.getBoundingClientRect();
        const px = (event.clientX - box.left) / box.width * 100;
        const py = (event.clientY - box.top) / box.height * 100;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(78, Math.max(2, px))}%`;
        tooltip.style.top = `${Math.min(72, Math.max(2, py))}%`;
        tooltip.innerHTML = `<b>WN ${point.flight} · ${point.from} → ${point.to}</b><span>Previous arrival: ${minuteText(point.x)} min · next departure: ${minuteText(point.y)} min</span><span>Turnaround: ${Math.round(point.slack)} min · ${point.date}</span>`;
      };
      dot.addEventListener('pointerenter', show);
      dot.addEventListener('pointermove', show);
      dot.addEventListener('pointerleave', () => { tooltip.hidden = true; });
      dot.addEventListener('focus', () => { tooltip.hidden = false; });
    });
    el('scatterNote').textContent = `Showing ${DATA.scatter.length.toLocaleString()} systematically sampled points from ${DATA.scatterCount.toLocaleString()} April flight pairs. Values beyond −30 to 180 min are clipped at the chart edge.`;
  }

  function thresholdRow() {
    return DATA.thresholdMetrics.reduce((closest, row) => Math.abs(Number(row.THRESHOLD) - selectedThreshold) < Math.abs(Number(closest.THRESHOLD) - selectedThreshold) ? row : closest, DATA.thresholdMetrics[0]);
  }

  function renderExplanation(row) {
    const match = (DATA.explanations || []).find(item => tailKey(item) === tailKey(row) && String(item.FLIGHT_NUM).replace(/\.0$/, '') === String(row.FLIGHT_NUM).replace(/\.0$/, '') && item.FLIGHT_DATE === row.FLIGHT_DATE);
    if (!match) { el('flightExplanation').innerHTML = '<span class="muted">No offline explanation was exported for this flight.</span>'; return; }
    const items = [['Previous arrival delay', match.PREVIOUS_ARRIVAL_DELAY_CONTRIBUTION], ['Turnaround slack', match.TURNAROUND_SLACK_CONTRIBUTION], ['Route', match.ROUTE_CONTRIBUTION], ['Departure time', match.DEPARTURE_TIME_CONTRIBUTION]];
    el('flightExplanation').innerHTML = `<div class="explanation-summary"><b>${match.EXPLANATION}</b><span>${Number(match.RESULT_CORRECT) ? 'Stored result matches the historical outcome.' : 'Stored result differs from the historical outcome.'}</span></div><div class="reason-code-grid"><div><small>MAIN FACTORS INCREASING RISK</small><b>${match.MAIN_FACTORS_INCREASING_RISK || 'Available after SHAP export'}</b></div><div><small>MAIN FACTORS REDUCING RISK</small><b>${match.MAIN_FACTORS_REDUCING_RISK || 'Available after SHAP export'}</b></div></div><div class="explanation-bars">${items.map(([label, value]) => `<div class="explanation-row"><span>${label}</span><div><i class="${Number(value) >= 0 ? 'positive' : 'negative'}" style="width:${Math.min(100, Math.max(4, Math.abs(Number(value)) * 180))}%"></i></div><b>${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(3)}</b></div>`).join('')}</div><small>SHAP values are local model explanations; they are not causal effects.</small>`;
  }

  function renderThresholdDiagnostics() {
    const row = thresholdRow();
    const threshold = Number(row.THRESHOLD);
    el('thresholdValue').value = threshold.toFixed(2);
    el('thresholdSlider').value = threshold.toFixed(2);
    el('thresholdMetrics').innerHTML = [['Precision', row.PRECISION], ['Recall', row.RECALL], ['F1', row.F1], ['Predicted delays', row.PREDICTED_DELAY_COUNT]].map(([label, value]) => `<div><small>${label}</small><b>${label === 'Predicted delays' ? Number(value).toLocaleString() : Number(value).toFixed(3)}</b></div>`).join('');
    el('thresholdMatrixLabel').textContent = `Threshold ${threshold.toFixed(2)}`;
    el('thresholdMatrix').innerHTML = `<div class="matrix-corner"></div><div class="matrix-col">Under 15 min</div><div class="matrix-col">15+ min</div><div class="matrix-row">Under 15 min</div><div class="matrix-cell tn"><b>${Number(row.TN).toLocaleString()}</b></div><div class="matrix-cell fp"><b>${Number(row.FP).toLocaleString()}</b></div><div class="matrix-row">15+ min</div><div class="matrix-cell fn"><b>${Number(row.FN).toLocaleString()}</b></div><div class="matrix-cell tp"><b>${Number(row.TP).toLocaleString()}</b></div>`;
    el('prChart').innerHTML = DATA.thresholdMetrics.map(item => `<div class="pr-row ${Number(item.THRESHOLD) === threshold ? 'active' : ''}"><span>${Number(item.THRESHOLD).toFixed(2)}</span><i style="width:${Number(item.PRECISION) * 100}%"></i><b>${(Number(item.PRECISION) * 100).toFixed(0)}%</b><i class="recall" style="width:${Number(item.RECALL) * 100}%"></i><b>${(Number(item.RECALL) * 100).toFixed(0)}%</b></div>`).join('');
    el('brierScore').textContent = Number(DATA.brierScore).toFixed(3);
    el('calibrationChart').innerHTML = (DATA.calibration || []).map(item => `<div class="calibration-row"><span>${item.BUCKET}</span><div><i style="width:${Number(item.MEAN_PREDICTED_SCORE) * 100}%"></i><b style="left:${Number(item.OBSERVED_DELAY_RATE) * 100}%"></b></div><small>${(Number(item.OBSERVED_DELAY_RATE) * 100).toFixed(1)}%</small></div>`).join('');
    el('riskBuckets').innerHTML = (DATA.riskBuckets || []).map(item => `<span>${item.RISK_BUCKET}: ${Number(item.COUNT).toLocaleString()}</span>`).join('');
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
  renderPopulationScenarios();
  renderScatter();
  renderFlight();
  setupNavigation();
})();
