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
import { signInWithGoogle, signInWithEmail, signUpWithEmail, signOutUser, onAuthChange, getCurrentUser, isWebView } from './auth.js';
import { submitScore, getTopScores } from './leaderboard.js';
import { inject } from '@vercel/analytics';
import html2canvas from 'html2canvas';

// Initialize Vercel Analytics
inject();

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
let leaderboardLastVisible = null;
let isFullLeaderboard = false;

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
  btnShareScore: document.getElementById('btn-share-score'),
  btnPlayAgain: document.getElementById('btn-play-again'),
  btnViewLeaderboard: document.getElementById('btn-view-leaderboard'),
  summaryMap: document.getElementById('summary-map'),
  summaryRating: document.getElementById('summary-rating'),
  totalScore: document.getElementById('total-score'),
  roundsBreakdown: document.getElementById('rounds-breakdown'),
  // Game (icons)
  iconExpand: document.getElementById('icon-expand'),
  iconCollapse: document.getElementById('icon-collapse'),
  // Debug
  debugPanel: document.getElementById('debug-panel'),
  debugLocationName: document.getElementById('debug-location-name'),
  btnDebugSkip: document.getElementById('btn-debug-skip'),
  // Leaderboard
  leaderboardBody: document.getElementById('leaderboard-body'),
  btnLbPlay: document.getElementById('btn-lb-play'),
  btnLbSeeAll: document.getElementById('btn-lb-see-all'),
  btnLbLoadMore: document.getElementById('btn-lb-load-more'),
  btnLbBack: document.getElementById('btn-lb-back'),
  // Modal
  modalExit: document.getElementById('modal-exit'),
  btnCancelExit: document.getElementById('btn-cancel-exit'),
  btnConfirmExit: document.getElementById('btn-confirm-exit'),
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
  if (isWebView()) {
    alert("Google Sign-In is blocked inside Instagram, Snapchat, Facebook, and TikTok. Please tap the ⋯ menu and select 'Open in System Browser' to play!");
    return;
  }
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
const DEBUG_ALL_LOCATIONS = false;

async function getValidLocations(count = 5) {
  const locationsToProcess = DEBUG_ALL_LOCATIONS
    ? [...LOCATIONS]
    : [...LOCATIONS].sort(() => Math.random() - 0.5);

  const valid = [];
  const targetCount = DEBUG_ALL_LOCATIONS ? locationsToProcess.length : count;

  for (const loc of locationsToProcess) {
    if (valid.length >= targetCount) break;

    // Validate data structure
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      console.warn('Invalid location data found:', loc);
      continue;
    }

    if (loc.panoId) {
      valid.push(loc);
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
    const count = DEBUG_ALL_LOCATIONS ? LOCATIONS.length : 5;
    const validLocations = await getValidLocations(count);

    if (DEBUG_ALL_LOCATIONS) {
      alert(`Debug Mode: Loading all ${validLocations.length} locations in sequence.`);
    } else if (validLocations.length < 5) {
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

  // Debug UI
  if (DEBUG_ALL_LOCATIONS) {
    els.debugPanel.style.display = 'block';
    els.debugLocationName.textContent = location.name;

    // Bind skip button exactly once
    els.btnDebugSkip.onclick = () => {
      // Force submit guess early indicating a skip
      guessPos = null;
      submitGuess(true); // pass true flag to indicate skip
    };
  } else {
    els.debugPanel.style.display = 'none';
  }

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
function submitGuess(isSkip = false) {
  if (isProcessing) return;
  isProcessing = true;
  stopTimer();

  els.btnGuess.disabled = true;
  els.btnGuess.querySelector('span').textContent = 'Submitting...';

  // Allow a small delay for UI to update even if synchronous
  setTimeout(() => {
    try {
      const result = game.submitGuess(guessPos, currentTimeLeft);
      showResult(result, isSkip);
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
function showResult(result, isSkip = false) {
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
  } else if (isSkip === true) {
    els.resultDistance.innerHTML = "<span style='color:#ef4444'>Skipped</span>";
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
    if (round.guessPos) {
      drawResultLine(sMap, round.guessPos, round.actualPos);
      bounds.extend(new google.maps.LatLng(round.guessPos.lat, round.guessPos.lng));
    }
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
        <span class="round-distance">${r.distance === Infinity ? (r.score === 0 ? "<span style='color:#ef4444'>Skipped/Time's Up</span>" : "Time's Up") : Math.round(metersToFeet(r.distance)) + " ft"}</span>
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

async function shareScore() {
  if (isProcessing) return;
  isProcessing = true;
  const originalBtnText = els.btnShareScore.innerHTML;
  els.btnShareScore.innerHTML = '<span>Generating...</span>';

  try {
    // Hide buttons for screenshot
    els.btnShareScore.parentElement.style.visibility = 'hidden';

    // html2canvas workaround for background-clip: text gradients
    els.totalScore.style.background = 'none';
    els.totalScore.style.webkitBackgroundClip = 'initial';
    els.totalScore.style.webkitTextFillColor = 'initial';
    els.totalScore.style.backgroundClip = 'initial';
    els.totalScore.style.color = '#FFC600';

    // Take snapshot
    const canvas = await html2canvas(document.querySelector('.summary-card'), {
      backgroundColor: '#0a0e17',
      scale: window.devicePixelRatio || 2, // High res for sharper images
    });

    // Restore styling and buttons
    els.totalScore.style.background = '';
    els.totalScore.style.webkitBackgroundClip = '';
    els.totalScore.style.webkitTextFillColor = '';
    els.totalScore.style.backgroundClip = '';
    els.totalScore.style.color = '';
    els.btnShareScore.parentElement.style.visibility = 'visible';

    // Download or Native Share image
    const score = els.totalScore.textContent;
    const caption = `I just scored ${score} on DrexelGuessr! Can you beat me? Play now at drexelguessr.vercel.app\n\n#DrexelGuessr @drexelguessr`;

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error("Failed to generate image blob");

    const file = new File([blob], 'drexelguessr-score.png', { type: 'image/png' });
    const shareData = {
      title: 'DrexelGuessr Score',
      text: caption,
      files: [file]
    };

    if (navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        showShareToast();
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn("Web Share failed:", err);
          await fallbackDownload(canvas, caption);
        }
      }
    } else {
      await fallbackDownload(canvas, caption);
    }
  } catch (err) {
    console.error('Error sharing score:', err);
    alert('Failed to generate image. Please try again.');
    els.btnShareScore.parentElement.style.visibility = 'visible';
  } finally {
    els.btnShareScore.innerHTML = originalBtnText;
    isProcessing = false;
  }
}

async function fallbackDownload(canvas, caption) {
  try {
    await navigator.clipboard.writeText(caption);
  } catch (e) {
    console.warn("Clipboard write failed", e);
  }

  if (isWebView()) {
    // ── Clean View Mode (Bypass Instagram/FB download blocks) ──
    const summaryButtons = document.querySelector('.summary-buttons');
    const instructionBox = document.createElement('div');

    // Save original state
    const originalDisplay = summaryButtons.style.display;
    summaryButtons.style.display = 'none';

    // Create Instruction Overlay
    instructionBox.id = 'screenshot-instruction';
    instructionBox.style.position = 'fixed';
    instructionBox.style.top = '20px';
    instructionBox.style.left = '50%';
    instructionBox.style.transform = 'translateX(-50%)';
    instructionBox.style.zIndex = '10000';
    instructionBox.style.width = '90%';
    instructionBox.style.maxWidth = '400px';
    instructionBox.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    instructionBox.style.border = '2px solid var(--gold)';
    instructionBox.style.borderRadius = '16px';
    instructionBox.style.padding = '20px';
    instructionBox.style.textAlign = 'center';
    instructionBox.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    instructionBox.style.position = 'fixed';

    instructionBox.innerHTML = `
      <div style="font-size: 1.2rem; color: #fff; font-weight: 700; margin-bottom: 8px;">📸 Screenshot Mode</div>
      <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 20px;">
        Instagram blocked the auto-save. <br/>
        <strong>Screenshot this screen now</strong> to share your score!
      </div>
      <button class="btn-primary" id="btn-exit-screenshot" style="width: 100%; padding: 12px;">Close</button>
    `;

    document.body.appendChild(instructionBox);

    // Make sure score text stays gold
    els.totalScore.style.color = '#FFC600';

    document.getElementById('btn-exit-screenshot').onclick = () => {
      instructionBox.remove();
      summaryButtons.style.display = originalDisplay;
      els.totalScore.style.color = '';
    };
  } else {
    // Standard browser download
    const link = document.createElement('a');
    link.download = 'drexelguessr-score.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showShareToast();
  }
}

function showShareToast() {
  const toast = document.createElement('div');
  toast.className = 'highscore-toast';
  toast.style.width = 'max-content';
  toast.style.maxWidth = '90vw';
  toast.style.lineHeight = '1.4';
  toast.style.padding = '12px 20px';
  toast.innerHTML = '<span>📸</span> <div style="display:inline-block; vertical-align:middle; text-align:left;">Image Saved!<br><span style="font-size: 0.8em; opacity: 0.8; font-weight: normal;">Caption copied. Post to your story & tag us!</span></div>';
  els.summaryRating.parentElement.appendChild(toast);

  toast.offsetHeight;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 500);
  }, 5000);
}

// ── Leaderboard ────────────────────────────────────────

function renderScoresToHtml(scores, currentUser, startRank = 1) {
  return scores
    .map((entry, i) => {
      const rank = startRank + i;
      const rankClass = rank <= 3 && !isFullLeaderboard ? ` rank-${rank}` : rank <= 3 ? ` rank-top` : '';
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
}

async function showLeaderboard() {
  showScreen('leaderboard');
  els.leaderboardBody.innerHTML = '<tr><td colspan="3" class="lb-loading">Loading...</td></tr>';
  els.btnLbSeeAll.style.display = '';
  els.btnLbLoadMore.style.display = 'none';
  isFullLeaderboard = false;
  leaderboardLastVisible = null;

  try {
    const { scores, lastDoc } = await getTopScores(10);
    leaderboardLastVisible = lastDoc;
    const currentUser = getCurrentUser();

    if (scores.length === 0) {
      els.leaderboardBody.innerHTML = '<tr><td colspan="3" class="lb-empty">No scores yet. Be the first!</td></tr>';
      els.btnLbSeeAll.style.display = 'none';
      return;
    }

    els.leaderboardBody.innerHTML = renderScoresToHtml(scores, currentUser, 1);

    // Hide 'See All' if there are 10 or fewer total scores since they are already fully loaded
    if (scores.length < 10) {
      els.btnLbSeeAll.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load leaderboard:', err.message);
    els.leaderboardBody.innerHTML = '<tr><td colspan="3" class="lb-empty">Failed to load leaderboard.</td></tr>';
  }
}

async function showFullLeaderboard(loadMore = false) {
  if (!loadMore) {
    els.leaderboardBody.innerHTML = '<tr><td colspan="3" class="lb-loading">Loading...</td></tr>';
    leaderboardLastVisible = null;
    isFullLeaderboard = true;
    els.btnLbSeeAll.style.display = 'none';
  } else {
    els.btnLbLoadMore.disabled = true;
    els.btnLbLoadMore.querySelector('span').textContent = 'Loading...';
  }

  try {
    const { scores, lastDoc } = await getTopScores(100, leaderboardLastVisible);
    const currentUser = getCurrentUser();

    if (!loadMore && scores.length === 0) {
      els.leaderboardBody.innerHTML = '<tr><td colspan="3" class="lb-empty">No scores yet.</td></tr>';
      els.btnLbLoadMore.style.display = 'none';
      return;
    }

    const startRank = loadMore ? els.leaderboardBody.querySelectorAll('tr').length + 1 : 1;
    const html = renderScoresToHtml(scores, currentUser, startRank);

    if (loadMore) {
      const loadingRow = els.leaderboardBody.querySelector('.lb-loading');
      if (loadingRow) loadingRow.remove();
      els.leaderboardBody.insertAdjacentHTML('beforeend', html);
    } else {
      els.leaderboardBody.innerHTML = html;
    }

    leaderboardLastVisible = lastDoc;

    if (scores.length === 100) {
      els.btnLbLoadMore.style.display = '';
    } else {
      els.btnLbLoadMore.style.display = 'none';
    }

  } catch (err) {
    console.error('Failed to load full leaderboard:', err.message);
    if (!loadMore) {
      els.leaderboardBody.innerHTML = '<tr><td colspan="3" class="lb-empty">Failed to load leaderboard.</td></tr>';
    }
  } finally {
    if (loadMore) {
      els.btnLbLoadMore.disabled = false;
      els.btnLbLoadMore.querySelector('span').textContent = 'Load More';
    }
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
  els.modalExit.style.display = 'flex';
}

function confirmExit() {
  els.modalExit.style.display = 'none';
  stopTimer();
  showScreen('start');
}

function cancelExit() {
  els.modalExit.style.display = 'none';
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
els.btnShareScore.addEventListener('click', shareScore);
els.btnPlayAgain.addEventListener('click', playAgain);
els.btnViewLeaderboard.addEventListener('click', showLeaderboard);

// Leaderboard
els.btnLbPlay.addEventListener('click', startGame);
els.btnLbSeeAll.addEventListener('click', () => showFullLeaderboard(false));
els.btnLbLoadMore.addEventListener('click', () => showFullLeaderboard(true));
els.btnLbBack.addEventListener('click', () => showScreen('start'));

// Modal
els.btnCancelExit.addEventListener('click', cancelExit);
els.btnConfirmExit.addEventListener('click', confirmExit);

// Keyboard shortcut: Enter to submit guess
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && screens.game.classList.contains('active') && guessPos) {
    submitGuess();
  } else if (e.key === ' ' && DEBUG_ALL_LOCATIONS && screens.game.classList.contains('active')) {
    e.preventDefault();
    submitGuess(true); // Skip
  } else if (e.key === ' ' && screens.result.classList.contains('active')) {
    e.preventDefault();
    handleNext();
  }
});
