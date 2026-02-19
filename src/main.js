/**
 * DrexelGuessr — Main Application Entry Point
 */
import './style.css';
import { GameState } from './game.js';
import { LOCATIONS } from './locations.js';
import {
  loadGoogleMapsAPI,
  createStreetView,
  createGuessMap,
  createResultMap,
  drawResultLine,
  metersToFeet,
  checkStreetViewCoverage,
} from './maps.js';

// ── State ──────────────────────────────────────────────
const game = new GameState();
let streetView = null;
let guessMap = null;
let guessMarker = null;
let guessPos = null;
let mapExpanded = false;
let timerInterval = null;
const TIME_LIMIT = 60;

// ── DOM Elements ───────────────────────────────────────
const screens = {
  start: document.getElementById('screen-start'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result'),
  summary: document.getElementById('screen-summary'),
};

const els = {
  btnStart: document.getElementById('btn-start'),
  btnGuess: document.getElementById('btn-guess'),
  btnNext: document.getElementById('btn-next'),
  btnPlayAgain: document.getElementById('btn-play-again'),
  btnToggleMap: document.getElementById('btn-toggle-map'),
  streetviewContainer: document.getElementById('streetview-container'),
  guessMapContainer: document.getElementById('guess-map'),
  mapPanel: document.getElementById('map-panel'),
  roundBadge: document.getElementById('round-badge'),
  timer: document.getElementById('timer'),
  resultMap: document.getElementById('result-map'),
  resultLocation: document.getElementById('result-location'),
  resultDistance: document.getElementById('result-distance'),
  resultScore: document.getElementById('result-score'),
  scoreBar: document.getElementById('score-bar'),
  summaryMap: document.getElementById('summary-map'),
  summaryRating: document.getElementById('summary-rating'),
  totalScore: document.getElementById('total-score'),
  roundsBreakdown: document.getElementById('rounds-breakdown'),
  iconExpand: document.getElementById('icon-expand'),
  iconCollapse: document.getElementById('icon-collapse'),
};

// ── Screen Management ──────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ── Animated Counter ───────────────────────────────────
function animateValue(el, start, end, duration = 1000) {
  const range = end - start;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + range * eased);

    el.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ── Pre-validate locations for Street View coverage ───
async function getValidLocations(count = 5) {
  const shuffled = [...LOCATIONS].sort(() => Math.random() - 0.5);
  const valid = [];

  for (const loc of shuffled) {
    if (valid.length >= count) break;
    const panoData = await checkStreetViewCoverage(loc, 50);
    if (panoData) {
      valid.push(loc);
    } else {
      console.warn(`No Street View coverage near: ${loc.name}, skipping.`);
    }
  }

  return valid;
}

// ── Start Game ─────────────────────────────────────────
async function startGame() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    alert(
      'Please add your Google Maps API key to the .env file!\n\nSet VITE_GOOGLE_MAPS_API_KEY=your_key_here'
    );
    return;
  }

  els.btnStart.disabled = true;
  els.btnStart.querySelector('span').textContent = 'Validating locations...';

  try {
    await loadGoogleMapsAPI(apiKey);

    // Pre-validate that all locations have Street View coverage
    const validLocations = await getValidLocations(5);

    if (validLocations.length < 5) {
      alert(`Only found ${validLocations.length} locations with Street View coverage. Starting with those.`);
    }

    if (validLocations.length === 0) {
      alert('No locations with Street View coverage found. Please check your API key permissions.');
      return;
    }

    game.resetWithLocations(validLocations);
    await startRound();
    showScreen('game');
  } catch (err) {
    console.error('Failed to load Google Maps:', err);
    alert('Failed to load Google Maps. Check your API key and internet connection.');
  } finally {
    els.btnStart.disabled = false;
    els.btnStart.querySelector('span').textContent = 'Start Game';
  }
}

// ── Timer Logic ────────────────────────────────────────
function startTimer() {
  let timeLeft = TIME_LIMIT;
  els.timer.textContent = `${timeLeft}s`;
  els.timer.classList.remove('warning');

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    timeLeft--;
    els.timer.textContent = `${timeLeft}s`;

    if (timeLeft <= 10) {
      els.timer.classList.add('warning');
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitGuess(); // Auto-submit with null guessPos
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  els.timer.textContent = '0s';
  els.timer.classList.remove('warning');
}

// ── Start Round ────────────────────────────────────────
async function startRound() {
  const location = game.getCurrentLocation();
  guessPos = null;
  guessMarker = null;
  mapExpanded = false;

  // Update round badge
  els.roundBadge.textContent = game.getRoundDisplay();

  // Reset guess button
  els.btnGuess.disabled = true;
  els.btnGuess.querySelector('span').textContent = 'Place your pin first';

  // Reset map panel size
  els.mapPanel.classList.remove('expanded');
  els.iconExpand.style.display = '';
  els.iconCollapse.style.display = 'none';

  // Start Timer
  startTimer();

  // Create Street View (async — waits for coverage check)
  streetView = await createStreetView(els.streetviewContainer, location);

  // Create Guess Map
  guessMap = createGuessMap(els.guessMapContainer);

  // Click to place pin
  guessMap.addListener('click', (e) => {
    guessPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };

    if (guessMarker) {
      guessMarker.setPosition(e.latLng);
    } else {
      guessMarker = new google.maps.Marker({
        position: e.latLng,
        map: guessMap,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#FFC600',
          fillOpacity: 1,
          strokeColor: '#e6b200',
          strokeWeight: 2,
        },
        draggable: true,
        title: 'Your Guess',
      });

      guessMarker.addListener('dragend', (ev) => {
        guessPos = { lat: ev.latLng.lat(), lng: ev.latLng.lng() };
      });
    }

    els.btnGuess.disabled = false;
    els.btnGuess.querySelector('span').textContent = 'Submit Guess';
  });
}

// ── Submit Guess ───────────────────────────────────────
function submitGuess() {
  stopTimer();

  if (!guessPos) {
    // Timeout or manual submit without pin (should be disabled but safe to check)
    // If called from timer, guessPos is null
    // If called from button, guessPos is set
  }

  const result = game.submitGuess(guessPos);
  showResult(result);
}

// ── Show Result ────────────────────────────────────────
function showResult(result) {
  showScreen('result');

  // Create result map and draw line
  const rMap = createResultMap(els.resultMap);
  drawResultLine(
    rMap,
    result.guessPos,
    result.actualPos
  );

  // Update text
  els.resultLocation.textContent = result.location.name;

  // Animate distance
  let distFeet = 0;
  if (result.distance === Infinity) {
    els.resultDistance.textContent = "Time's Up!";
    els.resultDistance.style.fontSize = "1.5rem";
  } else {
    distFeet = Math.round(metersToFeet(result.distance));
    els.resultDistance.style.fontSize = "";
    animateValue(els.resultDistance, 0, distFeet, 1200);
  }

  // Animate score
  animateValue(els.resultScore, 0, result.score, 1200);

  // Score bar
  const pct = (result.score / 5000) * 100;
  setTimeout(() => {
    els.scoreBar.style.width = `${pct}%`;
  }, 200);

  // Update next button text
  if (game.isLastRound()) {
    els.btnNext.querySelector('span').textContent = 'See Results';
  } else {
    els.btnNext.querySelector('span').textContent = 'Next Round';
  }
}

// ── Next Round / Summary ───────────────────────────────
async function handleNext() {
  els.scoreBar.style.width = '0%';

  if (game.isLastRound()) {
    showSummary();
  } else {
    game.nextRound();
    await startRound();
    showScreen('game');
  }
}

// ── Show Summary ───────────────────────────────────────
function showSummary() {
  showScreen('summary');

  // Rating
  const rating = game.getRating();
  els.summaryRating.textContent = `${rating.emoji} ${rating.title}`;

  // Update max score display dynamically
  const maxScore = game.totalRounds * 5000;
  document.querySelector('.total-max').textContent = `/ ${maxScore.toLocaleString()}`;

  // Total score animation
  animateValue(els.totalScore, 0, game.totalScore, 1500);

  // Build summary map showing all rounds
  const sMap = createResultMap(els.summaryMap);
  const bounds = new google.maps.LatLngBounds();

  game.rounds.forEach((round, i) => {
    // Draw line for each round
    drawResultLine(sMap, round.guessPos, round.actualPos);
    bounds.extend(new google.maps.LatLng(round.guessPos.lat, round.guessPos.lng));
    bounds.extend(new google.maps.LatLng(round.actualPos.lat, round.actualPos.lng));
  });

  sMap.fitBounds(bounds, { top: 60, bottom: 300, left: 60, right: 60 });

  // Round breakdown rows
  els.roundsBreakdown.innerHTML = game.rounds
    .map(
      (r) => `
    <div class="round-row">
      <div class="round-row-left">
        <span class="round-num">${r.round}</span>
        <span class="round-name">${r.location.name}</span>
        <span class="round-distance">${r.distance === Infinity ? "Time's Up" : Math.round(metersToFeet(r.distance)) + " ft"}</span>
      </div>
      <span class="round-score">${r.score.toLocaleString()}</span>
    </div>
  `
    )
    .join('');
}

// ── Play Again ─────────────────────────────────────────
async function playAgain() {
  els.btnPlayAgain.disabled = true;
  els.btnPlayAgain.querySelector('span').textContent = 'Loading...';

  try {
    const validLocations = await getValidLocations(5);
    game.resetWithLocations(validLocations);
    await startRound();
    showScreen('game');
  } finally {
    els.btnPlayAgain.disabled = false;
    els.btnPlayAgain.querySelector('span').textContent = 'Play Again';
  }
}

// ── Map Toggle ─────────────────────────────────────────
function toggleMapSize() {
  mapExpanded = !mapExpanded;
  els.mapPanel.classList.toggle('expanded', mapExpanded);
  els.iconExpand.style.display = mapExpanded ? 'none' : '';
  els.iconCollapse.style.display = mapExpanded ? '' : 'none';

  // Trigger map resize
  if (guessMap) {
    setTimeout(() => {
      google.maps.event.trigger(guessMap, 'resize');
    }, 400);
  }
}

// ── Event Listeners ────────────────────────────────────
els.btnStart.addEventListener('click', startGame);
els.btnGuess.addEventListener('click', submitGuess);
els.btnNext.addEventListener('click', handleNext);
els.btnPlayAgain.addEventListener('click', playAgain);
els.btnToggleMap.addEventListener('click', toggleMapSize);

// Keyboard shortcut: Enter to submit guess
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && screens.game.classList.contains('active') && guessPos) {
    submitGuess();
  }
});
