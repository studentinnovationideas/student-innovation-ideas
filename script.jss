/* =========================================================
   FitCampus AI — Application Logic
   All DOM access happens after DOMContentLoaded so elements
   are guaranteed to exist before event listeners attach.
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------------------------------------------------------
     0. CONSTANTS
     --------------------------------------------------------- */
  const STORAGE_KEY = 'fitcampus_ai_state_v1';
  const SQUAT_GOAL = 20;
  const WATER_GOAL = 8;
  const POINTS_PER_SQUAT = 10;
  const CALORIES_PER_SQUAT = 0.32;
  const SQUAT_XP_REWARD = 50;
  const WALK_XP_REWARD = 30;
  const WATER_XP_REWARD = 20;

  // MediaPipe Pose landmark indices (BlazePose 33-point model)
  const LM = {
    LEFT_HIP: 23, LEFT_KNEE: 25, LEFT_ANKLE: 27,
    RIGHT_HIP: 24, RIGHT_KNEE: 26, RIGHT_ANKLE: 28
  };

  const LEADERBOARD_BASE = [
    { name: 'Rahul Sharma', xp: 1250 },
    { name: 'Priya Singh', xp: 1100 },
    { name: 'Vinay Kumar', xp: 900 },
    { name: 'Aman Verma', xp: 850 }
  ];

  /* ---------------------------------------------------------
     1. DOM REFERENCES
     --------------------------------------------------------- */
  const el = (id) => document.getElementById(id);

  const navbar = el('navbar');
  const hamburgerBtn = el('hamburgerBtn');
  const navLinks = el('navLinks');
  const navStartWorkoutBtn = el('navStartWorkoutBtn');
  const heroStartWorkoutBtn = el('heroStartWorkoutBtn');
  const heroViewChallengesBtn = el('heroViewChallengesBtn');

  const exerciseSelect = el('exerciseSelect');
  const cameraStatusBadge = el('cameraStatusBadge');
  const inputVideo = el('inputVideo');
  const outputCanvas = el('outputCanvas');
  const canvasCtx = outputCanvas.getContext('2d');
  const cameraPlaceholder = el('cameraPlaceholder');
  const cameraLoading = el('cameraLoading');
  const cameraErrorBox = el('cameraErrorBox');
  const cameraErrorText = el('cameraErrorText');

  const startCameraBtn = el('startCameraBtn');
  const stopCameraBtn = el('stopCameraBtn');
  const resetWorkoutBtn = el('resetWorkoutBtn');
  const feedbackText = el('feedbackText');

  const repsValue = el('repsValue');
  const stageValue = el('stageValue');
  const sessionCaloriesValue = el('sessionCaloriesValue');
  const sessionPointsValue = el('sessionPointsValue');

  const squatChallengeBar = el('squatChallengeBar');
  const squatChallengeText = el('squatChallengeText');
  const squatChallengeStatus = el('squatChallengeStatus');
  const walkChallengeBar = el('walkChallengeBar');
  const walkChallengeText = el('walkChallengeText');
  const markWalkBtn = el('markWalkBtn');
  const waterChallengeBar = el('waterChallengeBar');
  const waterChallengeText = el('waterChallengeText');
  const addWaterBtn = el('addWaterBtn');

  const dashTotalSquats = el('dashTotalSquats');
  const dashTotalPoints = el('dashTotalPoints');
  const dashStreak = el('dashStreak');
  const dashCalories = el('dashCalories');
  const scoreRing = el('scoreRing');
  const fitnessScoreValue = el('fitnessScoreValue');
  const dailyGoalBar = el('dailyGoalBar');
  const dailyGoalText = el('dailyGoalText');
  const resetAllBtn = el('resetAllBtn');
  const leaderboardList = el('leaderboardList');

  const toastContainer = el('toastContainer');
  const studyBreakModal = el('studyBreakModal');
  const startQuickExerciseBtn = el('startQuickExerciseBtn');
  const dismissBreakBtn = el('dismissBreakBtn');

  /* ---------------------------------------------------------
     2. STATE (persisted) + SESSION (not persisted)
     --------------------------------------------------------- */
  function getDefaultState() {
    return {
      totalPoints: 0,
      totalSquatsAllTime: 0,
      caloriesTotal: 0,
      squatsToday: 0,
      waterToday: 0,
      streak: 0,
      lastActiveDate: null, // 'YYYY-MM-DD'
      challenges: { squat: false, walk: false, hydration: false }
    };
  }

  let state = loadState();

  // Session-only counters, reset by "Reset Workout" (not persisted across reload)
  let session = { reps: 0, calories: 0, points: 0, stage: null };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultState();
      const parsed = JSON.parse(raw);
      // Merge with defaults in case of missing fields (forward compatibility)
      return Object.assign(getDefaultState(), parsed, {
        challenges: Object.assign({ squat: false, walk: false, hydration: false }, parsed.challenges || {})
      });
    } catch (e) {
      console.error('Failed to load saved progress, starting fresh.', e);
      return getDefaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save progress to localStorage.', e);
    }
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // Resets day-scoped counters (squatsToday, waterToday, challenges) if the
  // stored date is not today. Must run once at load, before rendering.
  function checkNewDay() {
    const today = todayStr();
    if (state.lastActiveDate !== today) {
      state.squatsToday = 0;
      state.waterToday = 0;
      state.challenges = { squat: false, walk: false, hydration: false };
    }
  }

  // Marks the user active today and updates the streak. Safe to call
  // multiple times per day — only the first call each day changes the streak.
  function markActiveToday() {
    const today = todayStr();
    if (state.lastActiveDate === today) return;

    if (state.lastActiveDate) {
      const prevDate = new Date(state.lastActiveDate + 'T00:00:00');
      const todayDate = new Date(today + 'T00:00:00');
      const diffDays = Math.round((todayDate - prevDate) / (1000 * 60 * 60 * 24));
      state.streak = (diffDays === 1) ? state.streak + 1 : 1;
    } else {
      state.streak = 1;
    }
    state.lastActiveDate = today;
  }

  checkNewDay();
  saveState();

  /* ---------------------------------------------------------
     3. TOASTS
     --------------------------------------------------------- */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity .3s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  /* ---------------------------------------------------------
     4. NAVIGATION
     --------------------------------------------------------- */
  hamburgerBtn.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => navLinks.classList.remove('open'));
  });

  function scrollToId(id) {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  }

  navStartWorkoutBtn.addEventListener('click', () => {
    scrollToId('ai-workout');
    startCamera();
  });
  heroStartWorkoutBtn.addEventListener('click', () => {
    scrollToId('ai-workout');
    startCamera();
  });
  heroViewChallengesBtn.addEventListener('click', () => scrollToId('challenges'));

  /* ---------------------------------------------------------
     5. EXERCISE SELECT (squats is the only fully working MVP)
     --------------------------------------------------------- */
  exerciseSelect.addEventListener('change', () => {
    if (exerciseSelect.value !== 'squats') {
      showToast('Push-up and jumping-jack detection are coming soon — showing the squat tracker for now.', 'error');
      exerciseSelect.value = 'squats';
    }
  });

  /* ---------------------------------------------------------
     6. CAMERA + MEDIAPIPE POSE
     --------------------------------------------------------- */
  let videoStream = null;
  let poseInstance = null;
  let cameraRunning = false;
  let rafId = null;
  let firstResultReceived = false;

  function setCameraStatus(text, kind) {
    cameraStatusBadge.textContent = text;
    cameraStatusBadge.className = 'status-badge ' +
      (kind === 'active' ? 'status-active' : kind === 'error' ? 'status-error' : 'status-idle');
  }

  function showCameraState(state_) {
    // state_: 'placeholder' | 'loading' | 'error' | 'live'
    cameraPlaceholder.classList.toggle('hidden', state_ !== 'placeholder');
    cameraLoading.classList.toggle('hidden', state_ !== 'loading');
    cameraErrorBox.classList.toggle('hidden', state_ !== 'error');
    inputVideo.classList.toggle('hidden', state_ !== 'live');
  }

  function handleCameraError(err) {
    console.error('Camera error:', err);
    let message = 'Something went wrong while accessing the camera.';
    if (err && err.name === 'NotAllowedError') {
      message = 'Camera access was denied. Please allow camera permission in your browser settings and try again.';
    } else if (err && err.name === 'NotFoundError') {
      message = 'No camera was found on this device.';
    } else if (err && err.name === 'NotReadableError') {
      message = 'Your camera is already in use by another application.';
    } else if (err && err.message) {
      message = err.message;
    }
    cameraErrorText.textContent = message;
    showCameraState('error');
    setCameraStatus('Camera Error', 'error');
    showToast(message, 'error');
    stopCamera(); // ensure everything is cleaned up
  }

  async function startCamera() {
    if (cameraRunning) return; // prevent duplicate camera instances

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      handleCameraError({ message: 'Your browser does not support camera access. Please use Chrome, Firefox, or Edge.' });
      return;
    }
    if (typeof Pose === 'undefined') {
      handleCameraError({ message: 'The AI engine failed to load. Please check your internet connection and refresh the page.' });
      return;
    }

    startCameraBtn.disabled = true;
    showCameraState('loading');
    setCameraStatus('Initializing...', 'idle');

    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });

      inputVideo.srcObject = videoStream;
      await inputVideo.play();

      await new Promise((resolve) => {
        if (inputVideo.videoWidth) return resolve();
        inputVideo.onloadedmetadata = () => resolve();
      });
      outputCanvas.width = inputVideo.videoWidth || 640;
      outputCanvas.height = inputVideo.videoHeight || 480;

      if (!poseInstance) {
        poseInstance = new Pose({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        poseInstance.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        poseInstance.onResults(onPoseResults);
      }

      cameraRunning = true;
      firstResultReceived = false;
      stopCameraBtn.disabled = false;
      startCameraBtn.disabled = true;
      showCameraState('live');
      feedbackText.textContent = 'Analyzing your pose...';

      processFrame();
    } catch (err) {
      startCameraBtn.disabled = false;
      handleCameraError(err);
    }
  }

  function processFrame() {
    if (!cameraRunning) return;
    poseInstance.send({ image: inputVideo })
      .then(() => {
        if (cameraRunning) rafId = requestAnimationFrame(processFrame);
      })
      .catch((e) => {
        console.error('Pose processing error:', e);
        if (cameraRunning) rafId = requestAnimationFrame(processFrame);
      });
  }

  function onPoseResults(results) {
    if (!firstResultReceived) {
      firstResultReceived = true;
      setCameraStatus('Camera Active', 'active');
    }
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    if (results.poseLandmarks) {
      try {
        if (typeof drawConnectors === 'function') {
          drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#39ff9d', lineWidth: 3 });
        }
        if (typeof drawLandmarks === 'function') {
          drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#ffffff', radius: 3 });
        }
      } catch (e) {
        console.error('Drawing error:', e);
      }
      processSquatDetection(results.poseLandmarks);
    } else {
      feedbackText.textContent = 'Pose Not Detected';
    }
    canvasCtx.restore();
  }

  function stopCamera() {
    cameraRunning = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      videoStream = null;
    }
    inputVideo.srcObject = null;
    canvasCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    startCameraBtn.disabled = false;
    stopCameraBtn.disabled = true;
    setCameraStatus('Camera Idle', 'idle');
    showCameraState('placeholder');
    feedbackText.textContent = 'Camera stopped.';
    session.stage = null;
    stageValue.textContent = '—';
  }

  startCameraBtn.addEventListener('click', startCamera);
  stopCameraBtn.addEventListener('click', stopCamera);

  /* ---------------------------------------------------------
     7. SQUAT DETECTION LOGIC
     --------------------------------------------------------- */
  function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  }

  function processSquatDetection(landmarks) {
    const leftVis = ((landmarks[LM.LEFT_HIP].visibility || 0) +
      (landmarks[LM.LEFT_KNEE].visibility || 0) +
      (landmarks[LM.LEFT_ANKLE].visibility || 0)) / 3;
    const rightVis = ((landmarks[LM.RIGHT_HIP].visibility || 0) +
      (landmarks[LM.RIGHT_KNEE].visibility || 0) +
      (landmarks[LM.RIGHT_ANKLE].visibility || 0)) / 3;

    const useLeft = leftVis >= rightVis;
    const vis = useLeft ? leftVis : rightVis;

    if (vis < 0.5) {
      feedbackText.textContent = 'Move Back - Full Body Not Visible';
      return;
    }

    const hip = useLeft ? landmarks[LM.LEFT_HIP] : landmarks[LM.RIGHT_HIP];
    const knee = useLeft ? landmarks[LM.LEFT_KNEE] : landmarks[LM.RIGHT_KNEE];
    const ankle = useLeft ? landmarks[LM.LEFT_ANKLE] : landmarks[LM.RIGHT_ANKLE];

    const angle = calculateAngle(hip, knee, ankle);

    if (angle > 160) {
      if (session.stage === 'down') {
        session.stage = 'up';
        stageValue.textContent = 'UP';
        feedbackText.textContent = 'Great Squat!';
        incrementSquatRep();
      } else {
        session.stage = 'up';
        stageValue.textContent = 'UP';
        feedbackText.textContent = 'Ready';
      }
    } else if (angle < 100) {
      session.stage = 'down';
      stageValue.textContent = 'DOWN';
      feedbackText.textContent = 'Good Depth!';
    } else {
      if (session.stage === 'up' || session.stage === null) {
        feedbackText.textContent = 'Go Down';
      } else {
        feedbackText.textContent = 'Stand Up';
      }
    }
  }

  function incrementSquatRep() {
    session.reps += 1;
    session.calories += CALORIES_PER_SQUAT;
    session.points += POINTS_PER_SQUAT;

    state.squatsToday += 1;
    state.totalSquatsAllTime += 1;
    state.totalPoints += POINTS_PER_SQUAT;
    state.caloriesTotal += CALORIES_PER_SQUAT;

    markActiveToday();
    checkSquatChallenge();
    saveState();
    renderAll();
  }

  resetWorkoutBtn.addEventListener('click', () => {
    session = { reps: 0, calories: 0, points: 0, stage: cameraRunning ? session.stage : null };
    feedbackText.textContent = cameraRunning ? 'Workout reset. Ready when you are.' : 'Ready when you are.';
    renderWorkoutStats();
    showToast('Workout reps, calories and points reset for this session.');
  });

  /* ---------------------------------------------------------
     8. CHALLENGES
     --------------------------------------------------------- */
  function checkSquatChallenge() {
    if (!state.challenges.squat && state.squatsToday >= SQUAT_GOAL) {
      state.challenges.squat = true;
      state.totalPoints += SQUAT_XP_REWARD;
      showToast(`Daily Squat Challenge complete! +${SQUAT_XP_REWARD} XP`);
    }
  }

  markWalkBtn.addEventListener('click', () => {
    if (state.challenges.walk) return; // prevent duplicate reward
    state.challenges.walk = true;
    state.totalPoints += WALK_XP_REWARD;
    markActiveToday();
    saveState();
    renderAll();
    showToast(`Move More challenge complete! +${WALK_XP_REWARD} XP`);
  });

  addWaterBtn.addEventListener('click', () => {
    if (state.waterToday >= WATER_GOAL) return;
    state.waterToday += 1;
    markActiveToday();
    if (!state.challenges.hydration && state.waterToday >= WATER_GOAL) {
      state.challenges.hydration = true;
      state.totalPoints += WATER_XP_REWARD;
      showToast(`Hydration Hero challenge complete! +${WATER_XP_REWARD} XP`);
    }
    saveState();
    renderAll();
  });

  /* ---------------------------------------------------------
     9. RESET ALL PROGRESS
     --------------------------------------------------------- */
  resetAllBtn.addEventListener('click', () => {
    const confirmed = window.confirm('This will permanently erase all saved progress on this device. Continue?');
    if (!confirmed) return;
    state = getDefaultState();
    session = { reps: 0, calories: 0, points: 0, stage: null };
    saveState();
    renderAll();
    showToast('All progress has been reset.');
  });

  /* ---------------------------------------------------------
     10. RENDERING
     --------------------------------------------------------- */
  function renderWorkoutStats() {
    repsValue.textContent = session.reps;
    sessionCaloriesValue.textContent = Math.round(session.calories);
    sessionPointsValue.textContent = session.points;
    stageValue.textContent = session.stage ? session.stage.toUpperCase() : '—';
  }

  function renderChallenges() {
    // Squat challenge
    const squatPct = Math.min(100, (state.squatsToday / SQUAT_GOAL) * 100);
    squatChallengeBar.style.width = squatPct + '%';
    squatChallengeText.textContent = `${Math.min(state.squatsToday, SQUAT_GOAL)} / ${SQUAT_GOAL} squats`;
    squatChallengeStatus.textContent = state.challenges.squat ? 'Completed ✓' : 'In Progress';
    squatChallengeStatus.classList.toggle('completed', state.challenges.squat);

    // Walk challenge
    walkChallengeBar.style.width = state.challenges.walk ? '100%' : '0%';
    walkChallengeText.textContent = state.challenges.walk ? 'Completed today ✓' : 'Not completed';
    markWalkBtn.disabled = state.challenges.walk;
    markWalkBtn.textContent = state.challenges.walk ? 'Completed ✓' : 'Mark Walk Complete';

    // Water challenge
    const waterPct = Math.min(100, (state.waterToday / WATER_GOAL) * 100);
    waterChallengeBar.style.width = waterPct + '%';
    waterChallengeText.textContent = `${state.waterToday} / ${WATER_GOAL} glasses`;
    addWaterBtn.disabled = state.waterToday >= WATER_GOAL;
    addWaterBtn.textContent = state.waterToday >= WATER_GOAL ? 'Goal Reached ✓' : 'Add Water Glass';
  }

  function computeFitnessScore() {
    const workoutPart = Math.min(1, state.squatsToday / SQUAT_GOAL) * 40;
    const challengeCount = Object.values(state.challenges).filter(Boolean).length;
    const challengePart = (challengeCount / 3) * 40;
    const streakPart = Math.min(state.streak, 5) * 4; // capped at 20
    return Math.round(Math.min(100, workoutPart + challengePart + streakPart));
  }

  function renderDashboard() {
    dashTotalSquats.textContent = state.totalSquatsAllTime;
    dashTotalPoints.textContent = state.totalPoints;
    dashStreak.textContent = state.streak;
    dashCalories.textContent = Math.round(state.caloriesTotal);

    const score = computeFitnessScore();
    fitnessScoreValue.textContent = score;
    scoreRing.style.background = `conic-gradient(var(--neon) ${score}%, rgba(255,255,255,0.08) ${score}%)`;

    const goalPct = Math.min(100, (state.squatsToday / SQUAT_GOAL) * 100);
    dailyGoalBar.style.width = goalPct + '%';
    dailyGoalText.textContent = `${Math.min(state.squatsToday, SQUAT_GOAL)} / ${SQUAT_GOAL} squats today`;
  }

  function renderLeaderboard() {
    const combined = LEADERBOARD_BASE.concat([{ name: 'You', xp: state.totalPoints, isYou: true }]);
    combined.sort((a, b) => b.xp - a.xp);

    leaderboardList.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉'];
    combined.forEach((entry, index) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-item' + (entry.isYou ? ' is-you' : '');
      const rankDisplay = medals[index] || (index + 1);
      li.innerHTML = `
        <span class="lb-name"><span class="lb-rank">${rankDisplay}</span> ${entry.name}</span>
        <span class="lb-xp">${entry.xp} XP</span>
      `;
      leaderboardList.appendChild(li);
    });
  }

  function renderAll() {
    renderWorkoutStats();
    renderChallenges();
    renderDashboard();
    renderLeaderboard();
  }

  /* ---------------------------------------------------------
     11. STUDY BREAK REMINDER
     --------------------------------------------------------- */
  // Demo interval: 60 seconds. For production, change 60000 to 30 * 60 * 1000 (30 minutes).
  const STUDY_BREAK_INTERVAL_MS = 60000;
  let studyBreakTimeoutId = null;

  function scheduleStudyBreak() {
    if (studyBreakTimeoutId) clearTimeout(studyBreakTimeoutId);
    studyBreakTimeoutId = setTimeout(showStudyBreakModal, STUDY_BREAK_INTERVAL_MS);
  }

  function showStudyBreakModal() {
    studyBreakModal.classList.remove('hidden');
  }

  function hideStudyBreakModal() {
    studyBreakModal.classList.add('hidden');
    scheduleStudyBreak();
  }

  startQuickExerciseBtn.addEventListener('click', () => {
    hideStudyBreakModal();
    scrollToId('ai-workout');
    startCamera();
  });
  dismissBreakBtn.addEventListener('click', hideStudyBreakModal);

  scheduleStudyBreak();

  /* ---------------------------------------------------------
     12. INITIAL RENDER
     --------------------------------------------------------- */
  renderAll();
});
