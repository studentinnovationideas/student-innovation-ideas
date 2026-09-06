let squatCount = 0;
let totalPoints = 0;
let stage = "up";
let cameraStarted = false;

const videoElement = document.querySelector(".input_video");
const canvasElement = document.querySelector(".output_canvas");
const canvasCtx = canvasElement.getContext("2d");


// Calculate angle between 3 points
function calculateAngle(a, b, c) {

  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) -
    Math.atan2(a.y - b.y, a.x - b.x);

  let angle = Math.abs((radians * 180) / Math.PI);

  if (angle > 180) {
    angle = 360 - angle;
  }

  return angle;
}


// MediaPipe Pose Results
function onResults(results) {

  if (!canvasElement.width) {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
  }

  canvasCtx.save();

  canvasCtx.clearRect(
    0,
    0,
    canvasElement.width,
    canvasElement.height
  );

  canvasCtx.drawImage(
    results.image,
    0,
    0,
    canvasElement.width,
    canvasElement.height
  );

  if (results.poseLandmarks) {

    drawConnectors(
      canvasCtx,
      results.poseLandmarks,
      POSE_CONNECTIONS,
      { color: "#00e5a8", lineWidth: 4 }
    );

    drawLandmarks(
      canvasCtx,
      results.poseLandmarks,
      { color: "#ffffff", lineWidth: 2, radius: 5 }
    );


    // LEFT LEG LANDMARKS
    const hip = results.poseLandmarks[23];
    const knee = results.poseLandmarks[25];
    const ankle = results.poseLandmarks[27];

    const kneeAngle = calculateAngle(hip, knee, ankle);

    // Squat detection
    if (kneeAngle < 105) {
      stage = "down";
      document.getElementById("postureText").innerText = "Good! Go Up";
    }

    if (kneeAngle > 160 && stage === "down") {

      stage = "up";
      squatCount++;

      updateWorkout();

      document.getElementById("postureText").innerText =
        "Great Squat!";

    }

    // Feedback
    if (kneeAngle > 110 && kneeAngle < 150) {
      document.getElementById("postureText").innerText =
        "Keep Going";
    }

  }

  canvasCtx.restore();
}


// Setup Pose AI
const pose = new Pose({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
  }
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  smoothSegmentation: true,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});

pose.onResults(onResults);


// Start Camera
function startWorkout() {

  document
    .getElementById("workout")
    .scrollIntoView({ behavior: "smooth" });

  if (cameraStarted) return;

  cameraStarted = true;

  navigator.mediaDevices
    .getUserMedia({
      video: true
    })
    .then((stream) => {

      videoElement.srcObject = stream;

      videoElement.play();

      const camera = new Camera(videoElement, {
        onFrame: async () => {
          await pose.send({
            image: videoElement
          });
        },

        width: 640,
        height: 480
      });

      camera.start();

    })
    .catch((error) => {

      console.error(error);

      alert(
        "Camera permission denied. Please allow camera access."
      );

      cameraStarted = false;

    });

}


// Update workout
function updateWorkout() {

  totalPoints += 10;

  const calories = (squatCount * 0.5).toFixed(1);

  document.getElementById("repDisplay").innerText =
    squatCount;

  document.getElementById("calories").innerText =
    calories + " kcal";

  document.getElementById("pointsWorkout").innerText =
    totalPoints + " XP";


  document.getElementById("totalSquats").innerText =
    squatCount;

  document.getElementById("totalPoints").innerText =
    totalPoints;

  document.getElementById("userLeaderboardPoints").innerText =
    totalPoints + " XP";


  // Fitness Score
  const score = Math.min(
    100,
    Math.round((squatCount / 20) * 100)
  );

  document.getElementById("fitnessScore").innerText =
    score + "/100";


  // Progress
  const progress = Math.min(
    100,
    (squatCount / 20) * 100
  );

  document.getElementById("progressFill").style.width =
    progress + "%";

  document.getElementById("goalPercent").innerText =
    Math.round(progress) + "%";


  // Challenge
  document.getElementById("challengeFill").style.width =
    progress + "%";

  document.getElementById("challengeText").innerText =
    squatCount + " / 20 Squats";


  saveProgress();

}


// Local Storage
function saveProgress() {

  localStorage.setItem(
    "fitcampusSquats",
    squatCount
  );

  localStorage.setItem(
    "fitcampusPoints",
    totalPoints
  );

}


// Load Progress
function loadProgress() {

  squatCount =
    parseInt(
      localStorage.getItem("fitcampusSquats")
    ) || 0;

  totalPoints =
    parseInt(
      localStorage.getItem("fitcampusPoints")
    ) || 0;

  updateDisplay();

}


function updateDisplay() {

  const calories = (squatCount * 0.5).toFixed(1);

  document.getElementById("repDisplay").innerText =
    squatCount;

  document.getElementById("calories").innerText =
    calories + " kcal";

  document.getElementById("pointsWorkout").innerText =
    totalPoints + " XP";

  document.getElementById("totalSquats").innerText =
    squatCount;

  document.getElementById("totalPoints").innerText =
    totalPoints;

  document.getElementById("userLeaderboardPoints").innerText =
    totalPoints + " XP";


  const progress = Math.min(
    100,
    (squatCount / 20) * 100
  );

  document.getElementById("progressFill").style.width =
    progress + "%";

  document.getElementById("challengeFill").style.width =
    progress + "%";

  document.getElementById("goalPercent").innerText =
    Math.round(progress) + "%";

  document.getElementById("challengeText").innerText =
    squatCount + " / 20 Squats";

  document.getElementById("fitnessScore").innerText =
    Math.min(100, Math.round(progress)) + "/100";

}


// Study break reminder
setTimeout(() => {

  document.getElementById("breakPopup").style.display =
    "flex";

}, 30 * 60 * 1000);


// Close break popup
function closeBreak() {

  document.getElementById("breakPopup").style.display =
    "none";

}


// Load saved data
window.onload = loadProgress;
