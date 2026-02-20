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
import { signInWithGoogle, signInWithEmail, signUpWithEmail, signOutUser, onAuthChange, getCurrentUser } from './auth.js';
import { submitScore, getTopScores } from './leaderboard.js';

// ── State ──────────────────────────────────────────────
const game = new GameState();
let streetView = null;
let guessMap = null;
let guessMarker = null;
let guessPos = null;
let mapExpanded = false;
let timerInterval = null;
let currentTimeLeft = 0;
const TIME_LIMIT = 60;
let isGuest = false;
let isSignUpMode = false;
let isProcessing = false;

// ── Global Error Handling ──────────────────────────────
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  showFatalError();
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showFatalError();
});

function showFatalError() {
  const existing = document.getElementById('fatal-error-overlay');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.id = 'fatal-error-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(10, 14, 23, 0.95);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    z-index: 9999; color: #fff; font-family: 'Inter', sans-serif; text-align: center;
  `;
  overlay.innerHTML = `
    <h2 style="color: #FFC600; margin-bottom: 1rem;">Something went wrong</h2>
    <p style="margin-bottom: 2rem; color: #8b97b0;">The application encountered an unexpected error.</p>
    <button onclick="window.location.reload()" style="
      padding: 12px 24px; background: #FFC600; color: #000; border: none;
      border-radius: 8px; font-weight: 700; cursor: pointer;
    ">Reload Application</button>
  `;
  document.body.appendChild(overlay);
}

// ── DOM Elements ───────────────────────────────────────
const screens = {
  login: document.getElementById('screen-login'),
  start: document.getElementById('screen-start'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result'),
  summary: document.getElementById('screen-summary'),
  leaderboard: document.getElementById('screen-leaderboard'),
};

const els = {
  // Login
  btnGoogleSignIn: document.getElementById('btn-google-signin'),
  btnGuest: document.getElementById('btn-guest'),
  emailAuthForm: document.getElementById('email-auth-form'),
  authName: document.getElementById('auth-name'),
  authEmail: document.getElementById('auth-email'),
  authPassword: document.getElementById('auth-password'),
  authError: document.getElementById('auth-error'),
  btnEmailSubmit: document.getElementById('btn-email-submit'),
  btnToggleAuthMode: document.getElementById('btn-toggle-auth-mode'),
  // Start
  btnStart: document.getElementById('btn-start'),
  btnShowLeaderboard: document.getElementById('btn-show-leaderboard'),
  userBadge: document.getElementById('user-badge'),
  userAvatar: document.getElementById('user-avatar'),
  userName: document.getElementById('user-name'),
  btnSignout: document.getElementById('btn-signout'),
  // Game
  btnExit: document.getElementById('btn-exit-game'),
  btnGuess: document.getElementById('btn-guess'),
  btnNext: document.getElementById('btn-next'),
  btnToggleMap: document.getElementById('btn-toggle-map'),
  streetviewContainer: document.getElementById('streetview-container'),
  guessMapContainer: document.getElementById('guess-map'),
  mapPanel: document.getElementById('map-panel'),
  roundBadge: document.getElementById('round-badge'),
  timer: document.getElementById('timer'),
  // Result
  resultMap: document.getElementById('result-map'),
  resultLocation: document.getElementById('result-location'),
  resultDistance: document.getElementById('result-distance'),
  resultScore: document.getElementById('result-score'),
  scoreBar: document.getElementById('score-bar'),
  // Summary
  btnPlayAgain: document.getElementById('btn-play-again'),
  btnViewLeaderboard: document.getElementById('btn-view-leaderboard'),
  summaryMap: document.getElementById('summary-map'),
  summaryRating: document.getElementById('summary-rating'),
  totalScore: document.getElementById('total-score'),
  roundsBreakdown: document.getElementById('rounds-breakdown'),
  // Game (icons)
  iconExpand: document.getElementById('icon-expand'),
  iconCollapse: document.getElementById('icon-collapse'),
  // Leaderboard
  leaderboardBody: document.getElementById('leaderboard-body'),
  btnLbPlay: document.getElementById('btn-lb-play'),
  btnLbBack: document.getElementById('btn-lb-back'),
};

// ── Screen Management ──────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ── Auth ───────────────────────────────────────────────
function updateUserBadge(user) {
  if (user && !isGuest) {
    els.userBadge.style.display = 'flex';
    const name = user.displayName || 'Player';
    els.userName.textContent = name;

    if (user.photoURL) {
      els.userAvatar.src = user.photoURL;
      els.userAvatar.alt = name;
      els.userAvatar.style.display = '';
      // Remove initials fallback if it exists
      const existing = els.userBadge.querySelector('.avatar-initials');
      if (existing) existing.remove();
    } else {
      els.userAvatar.style.display = 'none';
      // Show initials fallback
      let initialsEl = els.userBadge.querySelector('.avatar-initials');
      if (!initialsEl) {
        initialsEl = document.createElement('div');
        initialsEl.className = 'avatar-initials';
        els.userBadge.insertBefore(initialsEl, els.userBadge.firstChild);
      }
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      initialsEl.textContent = initials;
    }
  } else {
    els.userBadge.style.display = 'none';
  }
}

async function handleGoogleSignIn() {
  try {
    els.btnGoogleSignIn.disabled = true;
    const user = await signInWithGoogle();
    isGuest = false;
    updateUserBadge(user);
    showScreen('start');
  } catch (err) {
    console.error('Sign-in error:', err.message);
    alert('Sign-in failed. Please try again.');
  } finally {
    els.btnGoogleSignIn.disabled = false;
  }
}

function handleGuestPlay() {
  isGuest = true;
  updateUserBadge(null);
  showScreen('start');
}

// ── Email Auth ─────────────────────────────────────────
function getFirebaseAuthErrorMessage(code) {
  switch (code) {
    case 'auth/email-already-in-use': return 'An account with this email already exists.';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/user-not-found': return 'No account found with this email.';
    case 'auth/wrong-password': return 'Incorrect password.';
    case 'auth/invalid-credential': return 'Invalid email or password.';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
    default: return 'Authentication failed. Please try again.';
  }
}

async function handleEmailAuth(e) {
  e.preventDefault();
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  const name = els.authName.value.trim();
  els.authError.textContent = '';
  els.btnEmailSubmit.disabled = true;

  try {
    let user;
    if (isSignUpMode) {
      user = await signUpWithEmail(email, password, name || null);
    } else {
      user = await signInWithEmail(email, password);
    }
    isGuest = false;
    updateUserBadge(user);
    showScreen('start');
  } catch (err) {
    els.authError.textContent = getFirebaseAuthErrorMessage(err.code);
  } finally {
    els.btnEmailSubmit.disabled = false;
  }
}

function toggleAuthMode() {
  isSignUpMode = !isSignUpMode;
  els.authName.style.display = isSignUpMode ? '' : 'none';
  els.btnEmailSubmit.querySelector('span').textContent = isSignUpMode ? 'Sign Up' : 'Sign In';
  els.btnToggleAuthMode.innerHTML = isSignUpMode
    ? 'Already have an account? <strong>Sign In</strong>'
    : "Don't have an account? <strong>Sign Up</strong>";
  els.authError.textContent = '';
}

async function handleSignOut() {
  try {
    await signOutUser();
    isGuest = false;
    updateUserBadge(null);
    showScreen('login');
  } catch (err) {
    console.error('Sign-out error:', err.message);
  }
}

// Listen for auth state on load
onAuthChange((user) => {
  if (user && !isGuest) {
    updateUserBadge(user);
    // If on login screen, skip to start
    if (screens.login.classList.contains('active')) {
      showScreen('start');
    }
  }
});

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

    // Validate data structure
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      console.warn('Invalid location data found:', loc);
      continue;
    }

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
    console.error('Failed to load Google Maps:', err.message);
    alert('Failed to load Google Maps. Check your API key and internet connection.');
  } finally {
    els.btnStart.disabled = false;
    els.btnStart.querySelector('span').textContent = 'Start Game';
  }
}

// ── Timer Logic ────────────────────────────────────────
function startTimer() {
  currentTimeLeft = TIME_LIMIT;
  els.timer.textContent = `${currentTimeLeft}s`;
  els.timer.classList.remove('warning');

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    currentTimeLeft--;
    els.timer.textContent = `${currentTimeLeft}s`;

    if (currentTimeLeft <= 10) {
      els.timer.classList.add('warning');
    }

    if (currentTimeLeft <= 0) {
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
  if (isProcessing) return;
  isProcessing = true;
  stopTimer();

  els.btnGuess.disabled = true;
  els.btnGuess.querySelector('span').textContent = 'Submitting...';

  // Allow a small delay for UI to update even if synchronous
  setTimeout(() => {
    try {
      const result = game.submitGuess(guessPos, currentTimeLeft);
      showResult(result);
    } catch (err) {
      console.error('Error submitting guess:', err.message);
      // If error, re-enable button (though timer stopped, so maybe just alert)
      alert('Error processing guess. Please try again.');
      els.btnGuess.disabled = false;
      els.btnGuess.querySelector('span').textContent = 'Submit Guess';
    } finally {
      isProcessing = false;
    }
  }, 50);
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
  if (isProcessing) return;
  isProcessing = true;

  // Disable button to show work is happening
  els.btnNext.disabled = true;

  try {
    els.scoreBar.style.width = '0%';

    if (game.isLastRound()) {
      await showSummary();
    } else {
      game.nextRound();
      await startRound();
      showScreen('game');
    }
  } catch (err) {
    console.error('Error proceeding to next round:', err.message);
    alert('Failed to load next round. Please try again.');
  } finally {
    isProcessing = false;
    els.btnNext.disabled = false;
    // Reset guess button state for next round
    els.btnGuess.disabled = false;
    els.btnGuess.querySelector('span').textContent = 'Submit Guess';
  }
}

// ── Show Summary ───────────────────────────────────────
async function showSummary() {
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

  // Submit score to leaderboard if signed in
  const user = getCurrentUser();
  if (user && !isGuest) {
    try {
      const result = await submitScore(user, game.totalScore, game.rounds);
      if (result.updated) {
        showHighScoreToast();
      }
    } catch (err) {
      console.error('Failed to submit score:', err.message);
      alert(`Failed to save score: ${err.message}`);
    }
  }
}

function showHighScoreToast() {
  const toast = document.createElement('div');
  toast.className = 'highscore-toast';
  toast.innerHTML = '<span>🏆</span> New High Score!';
  els.summaryRating.parentElement.appendChild(toast);

  // Trigger reflow
  toast.offsetHeight;
  toast.classList.add('show');

  // Remove after animation
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// ── Leaderboard ────────────────────────────────────────
async function showLeaderboard() {
  showScreen('leaderboard');
  els.leaderboardBody.innerHTML = '<tr><td colspan="3" class="lb-loading">Loading...</td></tr>';

  try {
    const scores = await getTopScores(10);
    const currentUser = getCurrentUser();

    if (scores.length === 0) {
      els.leaderboardBody.innerHTML = '<tr><td colspan="3" class="lb-empty">No scores yet. Be the first!</td></tr>';
      return;
    }

    els.leaderboardBody.innerHTML = scores
      .map((entry, i) => {
        const rank = i + 1;
        const rankClass = rank <= 3 ? ` rank-${rank}` : '';
        const isCurrentUser = currentUser && entry.uid === currentUser.uid;
        const rowClass = isCurrentUser ? ' class="lb-current-user"' : '';
        const avatar = entry.photoURL
          ? `<img src="${entry.photoURL}" alt="" referrerpolicy="no-referrer" />`
          : `<div style="width:28px;height:28px;border-radius:50%;background:var(--surface);"></div>`;

        return `
          <tr${rowClass}>
            <td class="lb-rank${rankClass}">${rank}</td>
            <td><div class="lb-player">${avatar}<span class="lb-player-name">${entry.displayName}</span></div></td>
            <td class="lb-score">${entry.score.toLocaleString()}</td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    console.error('Failed to load leaderboard:', err.message);
    els.leaderboardBody.innerHTML = '<tr><td colspan="3" class="lb-empty">Failed to load leaderboard.</td></tr>';
  }
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

// ── Exit Game ──────────────────────────────────────────
function exitGame() {
  if (confirm('Are you sure you want to exit the current game?')) {
    stopTimer();
    showScreen('start');
  }
}

// ── Event Listeners ────────────────────────────────────
// Login
els.btnGoogleSignIn.addEventListener('click', handleGoogleSignIn);
els.btnGuest.addEventListener('click', handleGuestPlay);
els.emailAuthForm.addEventListener('submit', handleEmailAuth);
els.btnToggleAuthMode.addEventListener('click', toggleAuthMode);

// Start
els.btnStart.addEventListener('click', startGame);
els.btnShowLeaderboard.addEventListener('click', showLeaderboard);
els.btnSignout.addEventListener('click', handleSignOut);

// Game
els.btnExit.addEventListener('click', exitGame);
els.btnGuess.addEventListener('click', submitGuess);
els.btnNext.addEventListener('click', handleNext);
els.btnToggleMap.addEventListener('click', toggleMapSize);

// Summary
els.btnPlayAgain.addEventListener('click', playAgain);
els.btnViewLeaderboard.addEventListener('click', showLeaderboard);

// Leaderboard
els.btnLbPlay.addEventListener('click', startGame);
els.btnLbBack.addEventListener('click', () => showScreen('start'));

// Keyboard shortcut: Enter to submit guess
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && screens.game.classList.contains('active') && guessPos) {
    submitGuess();
  }
});
