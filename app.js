(() => {
  const DATA = window.DASHBOARD_DATA;
  if (!DATA) return;

  const flights = DATA.chain.filter(row => Number(row.EXTRA_SCHEDULED_SLACK_MIN) === 0);
  const scenarioRows = DATA.chain;
  const paths = [
    'M184 134 Q310 85 432 162',
    'M432 162 Q548 128 626 205',
    'M626 205 Q544 240 452 187',
    'M452 187 Q300 245 150 151'
  ];
  const planePositions = [[310, 115], [548, 155], [544, 219], [300, 205]];
  const airports = ['LAS', 'DAL', 'TPA', 'HOU', 'ONT'];
  const airportNames = { LAS: 'Las Vegas', DAL: 'Dallas', TPA: 'Tampa', HOU: 'Houston', ONT: 'Ontario' };
  let selectedFlight = Math.max(0, flights.length - 1);
  let selectedScenario = 0;

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

  function setupTailSelector() {
    const tails = [...new Set(flights.map(row => row.TAIL_NUM))];
    el('tailSelector').innerHTML = tails.map(tail => `<option value="${tail}">${tail} · ${flights.length} linked legs</option>`).join('');
    el('chainTail').textContent = tails[0] || 'Aircraft chain';
    // Only the chain with stored per-flight model and what-if outputs is offered here.
    el('tailSelector').addEventListener('change', () => renderFlight());
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

  function renderMap() {
    el('routeDone').setAttribute('d', paths.slice(0, selectedFlight).join(' '));
    el('routeNow').setAttribute('d', paths[selectedFlight]);
    el('plane').setAttribute('transform', `translate(${planePositions[selectedFlight][0]} ${planePositions[selectedFlight][1]})`);
    document.querySelectorAll('.airport').forEach(node => {
      const stop = airports.indexOf(node.dataset.airport);
      node.classList.toggle('active', stop === selectedFlight || stop === selectedFlight + 1);
      node.classList.toggle('done', stop < selectedFlight);
    });
    el('chainProgress').textContent = `LEG 0${selectedFlight + 1} / 0${flights.length}`;
  }

  function renderFlight() {
    const row = flights[selectedFlight];
    if (!row) return;
    const predicted = Number(row.MODEL_ALERT_AT_LOCKED_THRESHOLD) === 1;
    const actualDelayed = Number(row.DEP_DEL15) === 1;
    const correct = predicted === actualDelayed;
    const previousDelay = Number(row.PREV_ARR_DELAY_MIN);
    const slack = Number(row.SCHEDULED_TURNAROUND_SLACK_MIN);
    const actual = Number(row.DEP_DELAY_MIN);

    renderBoard();
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
    el('correctOutcome').textContent = correct ? 'PREDICTION CORRECT' : 'PREDICTION MISSED';
    el('predictionCard').classList.toggle('predicted-delay', predicted);
    el('predictionCard').classList.toggle('prediction-wrong', !correct);
    const score = Number(row.MODEL_RELATIVE_SCORE);
    el('modelScore').textContent = score.toFixed(3);
    el('scoreMeter').style.width = `${Math.round(score * 100)}%`;
    renderScenarios(row);
  }

  function scenariosForFlight(row) {
    return scenarioRows.filter(item => String(item.FLIGHT_NUM).replace(/\.0$/, '') === String(row.FLIGHT_NUM).replace(/\.0$/, '') && item.FLIGHT_DATE === row.FLIGHT_DATE)
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
    const alert = Number(chosen.MODEL_ALERT_AT_LOCKED_THRESHOLD) === 1;
    const changed = alert !== (Number(scenarios[0].MODEL_ALERT_AT_LOCKED_THRESHOLD) === 1);
    el('scenarioDetail').innerHTML = `<div><small>TURNAROUND IN THIS WHAT-IF</small><b>${Math.round(Number(row.SCHEDULED_TURNAROUND_SLACK_MIN))} <i>→</i> ${Math.round(Number(row.SCHEDULED_TURNAROUND_SLACK_MIN) + extra)} min</b><span>Original <i>→</i> hypothetical</span></div><div><small>RELATIVE MODEL SCORE</small><b>${score.toFixed(3)}</b><span>${alert ? 'Model flags 15+ min delay' : 'Model flags under 15 min'}</span></div><div class="scenario-change ${changed ? 'changed' : ''}"><small>PREDICTION CHANGE</small><b>${changed ? 'Changed' : 'No change'}</b><span>Compared with original schedule</span></div>`;
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
  renderImportance();
  renderPopulationScenarios();
  renderScatter();
  renderFlight();
  setupNavigation();
})();
