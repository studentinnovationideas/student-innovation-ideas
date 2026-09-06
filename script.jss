/* =========================================================
   FitCampus AI — Live App Logic
   Real webcam pose detection (MediaPipe Pose) — no fake demo counters.
   Everything here reacts to actual body landmarks tracked live.
   ========================================================= */

(function () {
  'use strict';

  /* ---------------------------------------------------------
     0. DOM SHORTCUTS
  --------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);

  const els = {
    toastContainer: $('toastContainer'),
    studyBreakModal: $('studyBreakModal'),
    startQuickExerciseBtn: $('startQuickExerciseBtn'),
    dismissBreakBtn: $('dismissBreakBtn'),

    navbar: $('navbar'),
    hamburgerBtn: $('hamburgerBtn'),
    navLinks: $('navLinks'),
    navStartWorkoutBtn: $('navStartWorkoutBtn'),

    heroStartWorkoutBtn: $('heroStartWorkoutBtn'),
    heroViewChallengesBtn: $('heroViewChallengesBtn'),

    exerciseSelect: $('exerciseSelect'),
    cameraStatusBadge: $('cameraStatusBadge'),
    inputVideo: $('inputVideo'),
    outputCanvas: $('outputCanvas'),
    cameraPlaceholder: $('cameraPlaceholder'),
    cameraLoading: $('cameraLoading'),
    cameraErrorBox: $('cameraErrorBox'),
    cameraErrorText: $('cameraErrorText'),

    startCameraBtn: $('startCameraBtn'),
    stopCameraBtn: $('stopCameraBtn'),
    resetWorkoutBtn: $('resetWorkoutBtn'),
    feedbackText: $('feedbackText'),

    repsValue: $('repsValue'),
    stageValue: $('stageValue'),
    sessionCaloriesValue: $('sessionCaloriesValue'),
    sessionPointsValue: $('sessionPointsValue'),

    squatChallengeBar: $('squatChallengeBar'),
    squatChallengeText: $('squatChallengeText'),
    squatChallengeStatus: $('squatChallengeStatus'),
    walkChallengeBar: $('walkChallengeBar'),
    walkChallengeText: $('walkChallengeText'),
    markWalkBtn: $('markWalkBtn'),
    waterChallengeBar: $('waterChallengeBar'),
    waterChallengeText: $('waterChallengeText'),
    addWaterBtn: $('addWaterBtn'),

    dashTotalSquats: $('dashTotalSquats'),
    dashTotalPoints: $('dashTotalPoints'),
    dashStreak: $('dashStreak'),
    dashCalories: $('dashCalories'),
    scoreRing: $('scoreRing'),
    fitnessScoreValue: $('fitnessScoreValue'),
    dailyGoalBar: $('dailyGoalBar'),
    dailyGoalText: $('dailyGoalText'),
    resetAllBtn: $('resetAllBtn'),
    leaderboardList: $('leaderboardList'),
  };

  const canvasCtx = els.outputCanvas.getContext('2d');

  /* ---------------------------------------------------------
     1. PERSISTENT STATE (localStorage)
  --------------------------------------------------------- */
  const STORAGE_KEY = 'fitcampusAI_v1';
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const CAL_PER_REP = { squats: 0.32, pushups: 0.4, jumpingjacks: 0.22 };
  const XP_PER_REP = 2;
  const DAILY_SQUAT_GOAL = 20;
  const WATER_GOAL = 8;

  function defaultState() {
    return {
      totals: { squats: 0, pushups: 0, jumpingjacks: 0, points: 0, calories: 0 },
      streak: 0,
      lastActiveDate: null,
      daily: {
        date: todayStr(),
        squats: 0,
        pushups: 0,
        jumpingjacks: 0,
        water: 0,
        walkDone: false,
      },
    };
  }

  function loadState() {
    let s;
    try {
      s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      s = null;
    }
    if (!s) return defaultState();

    // Roll the daily bucket over if it's a new day
    if (s.daily.date !== todayStr()) {
      s.daily = {
        date: todayStr(),
        squats: 0,
        pushups: 0,
        jumpingjacks: 0,
        water: 0,
        walkDone: false,
      };
    }
    return s;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  function registerActivityForStreak() {
    const today = todayStr();
    if (state.lastActiveDate === today) return; // already counted today
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (state.lastActiveDate === yesterday) {
      state.streak += 1;
    } else {
      state.streak = 1;
    }
    state.lastActiveDate = today;
  }

  /* ---------------------------------------------------------
     2. TOASTS
  --------------------------------------------------------- */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'opacity .25s ease, transform .25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 3200);
  }

  /* ---------------------------------------------------------
     3. NAV / SCROLL BEHAVIOUR
  --------------------------------------------------------- */
  els.hamburgerBtn.addEventListener('click', () => {
    els.navLinks.classList.toggle('open');
  });

  function closeMobileNav() {
    els.navLinks.classList.remove('open');
  }

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeMobileNav();
  }

  document.querySelectorAll('.nav-link').forEach((a) => {
    a.addEventListener('click', closeMobileNav);
  });

  els.heroViewChallengesBtn.addEventListener('click', () => scrollToId('challenges'));

  function goToWorkoutAndStart() {
    scrollToId('ai-workout');
    setTimeout(() => {
      if (!cameraActive) startCamera();
    }, 450);
  }
  els.heroStartWorkoutBtn.addEventListener('click', goToWorkoutAndStart);
  els.navStartWorkoutBtn.addEventListener('click', goToWorkoutAndStart);

  /* ---------------------------------------------------------
     4. STUDY BREAK MODAL (real inactivity-based reminder)
  --------------------------------------------------------- */
  const BREAK_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes of sitting
  let breakTimer = null;

  function scheduleBreakReminder() {
    clearTimeout(breakTimer);
    breakTimer = setTimeout(() => {
      if (!cameraActive) {
        els.studyBreakModal.classList.remove('hidden');
      } else {
        scheduleBreakReminder(); // already moving, push it back
      }
    }, BREAK_INTERVAL_MS);
  }

  els.dismissBreakBtn.addEventListener('click', () => {
    els.studyBreakModal.classList.add('hidden');
    scheduleBreakReminder();
  });
  els.startQuickExerciseBtn.addEventListener('click', () => {
    els.studyBreakModal.classList.add('hidden');
    goToWorkoutAndStart();
  });
  scheduleBreakReminder();

  /* ---------------------------------------------------------
     5. POSE MATH HELPERS
  --------------------------------------------------------- */
  function angleAt(a, b, c) {
    // angle at point b, formed by rays b->a and b->c, in degrees
    const rad =
      Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let deg = Math.abs((rad * 180) / Math.PI);
    if (deg > 180) deg = 360 - deg;
    return deg;
  }

  function visible(lm, idx, threshold = 0.5) {
    return lm[idx] && (lm[idx].visibility === undefined || lm[idx].visibility >= threshold);
  }

  const LM = {
    L_SHOULDER: 11, R_SHOULDER: 12,
    L_ELBOW: 13, R_ELBOW: 14,
    L_WRIST: 15, R_WRIST: 16,
    L_HIP: 23, R_HIP: 24,
    L_KNEE: 25, R_KNEE: 26,
    L_ANKLE: 27, R_ANKLE: 28,
  };

  /* ---------------------------------------------------------
     6. EXERCISE STATE MACHINES
  --------------------------------------------------------- */
  const session = { reps: 0, stage: 'up', calories: 0, points: 0 };
  let repFlashTimer = null;

  function pulseRep() {
    els.repsValue.classList.remove('rep-pulse');
    void els.repsValue.offsetWidth; // restart animation
    els.repsValue.classList.add('rep-pulse');
  }

  function flashFeedback(kind) {
    const bar = els.feedbackText.closest('.feedback-bar');
    bar.classList.remove('flash-good', 'flash-warn');
    bar.classList.add(kind === 'good' ? 'flash-good' : 'flash-warn');
    clearTimeout(repFlashTimer);
    repFlashTimer = setTimeout(() => bar.classList.remove('flash-good', 'flash-warn'), 500);
  }

  function setFeedback(text, kind) {
    els.feedbackText.textContent = text;
    if (kind) flashFeedback(kind);
  }

  function onRepCompleted(exerciseKey) {
    session.reps += 1;
    session.calories += CAL_PER_REP[exerciseKey];
    session.points += XP_PER_REP;

    state.totals[exerciseKey] += 1;
    state.totals.points += XP_PER_REP;
    state.totals.calories += CAL_PER_REP[exerciseKey];
    state.daily[exerciseKey] += 1;
    registerActivityForStreak();
    saveState();

    pulseRep();
    updateSessionUI();
    updateChallenges();
    updateDashboard();

    if (session.reps % 5 === 0) {
      showToast(`${session.reps} reps this session — keep going!`);
      speak(`${session.reps} reps`);
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.volume = 0.6;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* ignore speech errors silently */
    }
  }

  function processSquats(lm) {
    const leftOk = visible(lm, LM.L_HIP) && visible(lm, LM.L_KNEE) && visible(lm, LM.L_ANKLE);
    const rightOk = visible(lm, LM.R_HIP) && visible(lm, LM.R_KNEE) && visible(lm, LM.R_ANKLE);
    if (!leftOk && !rightOk) {
      setFeedback('Step back so your hips, knees and ankles are all visible.');
      return;
    }
    const angles = [];
    if (leftOk) angles.push(angleAt(lm[LM.L_HIP], lm[LM.L_KNEE], lm[LM.L_ANKLE]));
    if (rightOk) angles.push(angleAt(lm[LM.R_HIP], lm[LM.R_KNEE], lm[LM.R_ANKLE]));
    const kneeAngle = angles.reduce((a, b) => a + b, 0) / angles.length;

    if (kneeAngle < 100) {
      if (session.stage === 'up') setFeedback('Good depth — now drive back up!', 'good');
      session.stage = 'down';
    } else if (kneeAngle > 160) {
      if (session.stage === 'down') {
        session.stage = 'up';
        onRepCompleted('squats');
        setFeedback('Nice squat! Reset and go again.', 'good');
      } else if (session.stage === 'up') {
        setFeedback('Bend your knees to start a squat.');
      }
    } else if (session.stage === 'up') {
      setFeedback('Go lower for a full rep.', 'warn');
    }
    els.stageValue.textContent = session.stage === 'down' ? 'Down' : 'Up';
  }

  function processPushups(lm) {
    const leftOk = visible(lm, LM.L_SHOULDER) && visible(lm, LM.L_ELBOW) && visible(lm, LM.L_WRIST);
    const rightOk = visible(lm, LM.R_SHOULDER) && visible(lm, LM.R_ELBOW) && visible(lm, LM.R_WRIST);
    if (!leftOk && !rightOk) {
      setFeedback('Position yourself so your shoulders, elbows and wrists are visible.');
      return;
    }
    const angles = [];
    if (leftOk) angles.push(angleAt(lm[LM.L_SHOULDER], lm[LM.L_ELBOW], lm[LM.L_WRIST]));
    if (rightOk) angles.push(angleAt(lm[LM.R_SHOULDER], lm[LM.R_ELBOW], lm[LM.R_WRIST]));
    const elbowAngle = angles.reduce((a, b) => a + b, 0) / angles.length;

    if (elbowAngle < 95) {
      if (session.stage === 'up') setFeedback('Good depth — now push up!', 'good');
      session.stage = 'down';
    } else if (elbowAngle > 155) {
      if (session.stage === 'down') {
        session.stage = 'up';
        onRepCompleted('pushups');
        setFeedback('Solid push-up! Keep your core tight.', 'good');
      } else if (session.stage === 'up') {
        setFeedback('Lower your chest to start a rep.');
      }
    } else if (session.stage === 'up') {
      setFeedback('Bend your elbows further for a full rep.', 'warn');
    }
    els.stageValue.textContent = session.stage === 'down' ? 'Down' : 'Up';
  }

  function processJumpingJacks(lm) {
    const need = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_WRIST, LM.R_WRIST, LM.L_HIP, LM.R_HIP, LM.L_ANKLE, LM.R_ANKLE];
    if (!need.every((i) => visible(lm, i))) {
      setFeedback('Step back so your whole body is visible in frame.');
      return;
    }
    const shoulderY = (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2;
    const wristY = (lm[LM.L_WRIST].y + lm[LM.R_WRIST].y) / 2;
    const armsUp = wristY < shoulderY - 0.02;

    const hipWidth = Math.abs(lm[LM.L_HIP].x - lm[LM.R_HIP].x);
    const ankleWidth = Math.abs(lm[LM.L_ANKLE].x - lm[LM.R_ANKLE].x);
    const legsApart = ankleWidth > hipWidth * 1.6;

    if (armsUp && legsApart) {
      if (session.stage === 'closed') setFeedback('Great extension — snap back together!', 'good');
      session.stage = 'open';
    } else if (!armsUp && !legsApart) {
      if (session.stage === 'open') {
        session.stage = 'closed';
        onRepCompleted('jumpingjacks');
        setFeedback('Nice jack! Keep the rhythm.', 'good');
      }
    }
    els.stageValue.textContent = session.stage === 'open' ? 'Open' : 'Closed';
  }

  function processExercise(lm) {
    const ex = els.exerciseSelect.value;
    if (ex === 'squats') processSquats(lm);
    else if (ex === 'pushups') processPushups(lm);
    else processJumpingJacks(lm);
  }

  /* ---------------------------------------------------------
     7. MEDIAPIPE POSE SETUP + CAMERA LOOP
  --------------------------------------------------------- */
  let pose = null;
  let cameraActive = false;
  let rafId = null;
  let stream = null;

  function initPose() {
    if (pose) return pose;
    pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    pose.onResults(onPoseResults);
    return pose;
  }

  function onPoseResults(results) {
    if (els.outputCanvas.width !== results.image.width || els.outputCanvas.height !== results.image.height) {
      els.outputCanvas.width = results.image.width;
      els.outputCanvas.height = results.image.height;
    }
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, els.outputCanvas.width, els.outputCanvas.height);

    if (results.poseLandmarks) {
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: '#39ff9d',
        lineWidth: 3,
      });
      drawLandmarks(canvasCtx, results.poseLandmarks, {
        color: '#eef1f8',
        fillColor: '#39ff9d',
        lineWidth: 1,
        radius: 3,
      });
      processExercise(results.poseLandmarks);
    } else {
      setFeedback('No person detected — step into frame.');
    }
    canvasCtx.restore();
  }

  async function detectLoop() {
    if (!cameraActive) return;
    if (els.inputVideo.readyState >= 2) {
      await pose.send({ image: els.inputVideo });
    }
    rafId = requestAnimationFrame(detectLoop);
  }

  async function startCamera() {
    if (cameraActive) return;
    els.startCameraBtn.disabled = true;
    els.cameraPlaceholder.classList.add('hidden');
    els.cameraErrorBox.classList.add('hidden');
    els.cameraLoading.classList.remove('hidden');
    els.cameraStatusBadge.textContent = 'Starting…';
    els.cameraStatusBadge.className = 'status-badge status-idle';

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      els.inputVideo.srcObject = stream;
      await els.inputVideo.play();

      initPose();

      els.inputVideo.classList.remove('hidden');
      els.inputVideo.classList.add('mirror');
      els.outputCanvas.classList.add('mirror');
      els.cameraLoading.classList.add('hidden');

      cameraActive = true;
      session.stage = els.exerciseSelect.value === 'jumpingjacks' ? 'closed' : 'up';
      els.stopCameraBtn.disabled = false;
      els.cameraStatusBadge.textContent = 'Live';
      els.cameraStatusBadge.className = 'status-badge status-active';
      setFeedback("You're live — let's see that first rep!");
      scheduleBreakReminder();

      detectLoop();
    } catch (err) {
      console.error(err);
      els.cameraLoading.classList.add('hidden');
      els.cameraPlaceholder.classList.add('hidden');
      els.cameraErrorBox.classList.remove('hidden');
      let msg = 'Could not access your camera.';
      if (err && err.name === 'NotAllowedError') {
        msg = 'Camera permission was denied. Allow camera access in your browser settings and try again.';
      } else if (err && err.name === 'NotFoundError') {
        msg = 'No camera was found on this device.';
      }
      els.cameraErrorText.textContent = msg;
      els.cameraStatusBadge.textContent = 'Error';
      els.cameraStatusBadge.className = 'status-badge status-error';
      els.startCameraBtn.disabled = false;
      showToast(msg, 'error');
    }
  }

  function stopCamera() {
    cameraActive = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    els.inputVideo.pause();
    els.inputVideo.srcObject = null;
    els.inputVideo.classList.add('hidden');
    canvasCtx.clearRect(0, 0, els.outputCanvas.width, els.outputCanvas.height);

    els.cameraPlaceholder.classList.remove('hidden');
    els.cameraErrorBox.classList.add('hidden');
    els.startCameraBtn.disabled = false;
    els.stopCameraBtn.disabled = true;
    els.cameraStatusBadge.textContent = 'Camera Idle';
    els.cameraStatusBadge.className = 'status-badge status-idle';
    setFeedback('Ready when you are.');
  }

  els.startCameraBtn.addEventListener('click', startCamera);
  els.stopCameraBtn.addEventListener('click', stopCamera);

  els.resetWorkoutBtn.addEventListener('click', () => {
    session.reps = 0;
    session.calories = 0;
    session.points = 0;
    session.stage = els.exerciseSelect.value === 'jumpingjacks' ? 'closed' : 'up';
    updateSessionUI();
    setFeedback('Session reset. Ready when you are.');
  });

  els.exerciseSelect.addEventListener('change', () => {
    session.reps = 0;
    session.calories = 0;
    session.points = 0;
    session.stage = els.exerciseSelect.value === 'jumpingjacks' ? 'closed' : 'up';
    updateSessionUI();
    const labels = { squats: 'Squat Reps', pushups: 'Push-up Reps', jumpingjacks: 'Jack Reps' };
    els.repsValue.parentElement.querySelector('.stat-label').textContent = labels[els.exerciseSelect.value];
    setFeedback('Exercise switched. Stand back and get in frame.');
  });

  function updateSessionUI() {
    els.repsValue.textContent = session.reps;
    els.sessionCaloriesValue.textContent = session.calories.toFixed(1);
    els.sessionPointsValue.textContent = session.points;
  }

  /* ---------------------------------------------------------
     8. CHALLENGES
  --------------------------------------------------------- */
  function updateChallenges() {
    const squatProgress = Math.min(state.daily.squats, DAILY_SQUAT_GOAL);
    const squatPct = (squatProgress / DAILY_SQUAT_GOAL) * 100;
    els.squatChallengeBar.style.width = squatPct + '%';
    els.squatChallengeText.textContent = `${squatProgress} / ${DAILY_SQUAT_GOAL} squats`;
    els.squatChallengeStatus.textContent = squatProgress >= DAILY_SQUAT_GOAL ? 'Completed' : 'In Progress';
    els.squatChallengeStatus.classList.toggle('completed', squatProgress >= DAILY_SQUAT_GOAL);

    els.walkChallengeBar.style.width = state.daily.walkDone ? '100%' : '0%';
    els.walkChallengeText.textContent = state.daily.walkDone ? 'Completed today!' : 'Not completed';
    els.markWalkBtn.disabled = state.daily.walkDone;
    els.markWalkBtn.textContent = state.daily.walkDone ? 'Completed ✓' : 'Mark Walk Complete';

    const waterPct = (state.daily.water / WATER_GOAL) * 100;
    els.waterChallengeBar.style.width = Math.min(waterPct, 100) + '%';
    els.waterChallengeText.textContent = `${state.d
