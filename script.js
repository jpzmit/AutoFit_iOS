import * as THREE from 'three';

// --- State Tracking Variables ---
let container, arSession = null, referenceSpace = null;
let camera, scene, renderer;
let hitTestSource = null, hitTestSourceRequested = false;
let reticle, latestHitTestResult = null;
let isScanning = false;

let measurements = [];
let currentLine = null;
const markers = [];

const ui = document.getElementById('ui');
const info = document.getElementById('info');
const startButton = document.getElementById('startButton');
const scanningUi = document.getElementById('scanning-ui');
const scanCountdown = document.getElementById('scan-countdown');
const centerCrosshair = document.getElementById('center-crosshair');

// Connect entry point
startButton.addEventListener('click', activateAR);

async function activateAR() {
    try {
        container = document.getElementById('app-container');
        
        // Setup explicit WebGL2 context configuration required by iOS XR viewers
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        const gl = canvas.getContext('webgl2', { xrCompatible: true });

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
        light.position.set(0.5, 1, 0.25);
        scene.add(light);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: canvas, context: gl });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;

        // Manual WebXR Session request with clean DOM overlay declarations
        arSession = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.body }
        });
        
        renderer.xr.setSession(arSession);
        referenceSpace = await arSession.requestReferenceSpace('local');
        const viewerSpace = await arSession.requestReferenceSpace('viewer');
        hitTestSource = await arSession.requestHitTestSource({ space: viewerSpace });

        // Bind interactive selection handling
        arSession.addEventListener('select', onARSelect);
        arSession.addEventListener('end', onSessionEnd);

        // Build surface alignment Reticle
        const ringGeo = new THREE.RingGeometry(0.015, 0.02, 32).rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        reticle = new THREE.Mesh(ringGeo, ringMat);
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        scene.add(reticle);

        // Hide start panel, kick off VIO onboarding tracking loop
        startButton.classList.add('hidden');
        window.addEventListener('resize', onWindowResize);
        
        startScanningCountdown();
        arSession.requestAnimationFrame(onXRFrame);

    } catch (error) {
        console.error('Failed to initialize WebXR Session:', error);
        alert('WebXR initialization failed. Ensure you are inside Mozilla XR Viewer or an enabled testing browser: ' + error.message);
        startButton.classList.remove('hidden');
    }
}

// Blocks screen inputs and forces device motion to build stable spatial map matrices
function startScanningCountdown() {
    isScanning = true;
    scanningUi.classList.remove('hidden');
    centerCrosshair.classList.remove('hidden');
    ui.classList.add('hidden');

    let timeLeft = 10;
    scanCountdown.innerText = timeLeft;

    const interval = setInterval(() => {
        timeLeft--;
        scanCountdown.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(interval);
            isScanning = false;
            scanningUi.classList.add('hidden');
            ui.classList.remove('hidden');
            info.textContent = "Point at a surface and tap to start measuring";
        }
    }, 1000);
}

function getMarker() {
    return new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
}

function getLine(p1, p2) {
    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 5 }));
}

function onARSelect() {
    // Intercept input actions if tracking maps are not ready
    if (isScanning || !reticle.visible) return;

    if (measurements.length === 2) {
        // Clear previous measurement group
        measurements = [];
        markers.forEach(m => scene.remove(m));
        markers.length = 0;
        if (currentLine) {
            scene.remove(currentLine);
            currentLine = null;
        }
        info.textContent = "Point at a surface and tap to start measuring";
    }

    const position = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
    const marker = getMarker();
    marker.position.copy(position);
    
    scene.add(marker);
    markers.push(marker);
    measurements.push(position);

    if (measurements.length === 1) {
        info.textContent = "Move and tap again to finish measurement";
    } else if (measurements.length === 2) {
        const distance = measurements[0].distanceTo(measurements[1]);
        const distanceMm = (distance * 1000).toFixed(1);
        info.textContent = `Distance: ${distanceMm} mm`;

        currentLine = getLine(measurements[0], measurements[1]);
        scene.add(currentLine);
    }
}

function onXRFrame(time, frame) {
    if (!arSession) return;
    arSession.requestAnimationFrame(onXRFrame);

    const pose = frame.getViewerPose(referenceSpace);
    if (pose && hitTestSource) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);

        if (hitTestResults.length > 0) {
            latestHitTestResult = hitTestResults[0];
            const hitPose = latestHitTestResult.getPose(referenceSpace);

            reticle.visible = true;
            reticle.matrix.fromArray(hitPose.transform.matrix);
        } else {
            reticle.visible = false;
        }
    }
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onSessionEnd() {
    arSession = null;
    hitTestSource = null;
    ui.classList.add('hidden');
    centerCrosshair.classList.add('hidden');
    scanningUi.classList.add('hidden');
    startButton.classList.remove('hidden');
    
    // Cleanup 3D scene elements
    markers.forEach(m => scene.remove(m));
    markers.length = 0;
    if (currentLine) scene.remove(currentLine);
    currentLine = null;
    measurements = [];
    
    if (container) container.innerHTML = '';
}