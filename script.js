import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Firebase Setup ---
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBeJrO0D_ccG-z0uncPyHg89LrSK15XCMc",
  authDomain: "autofit-ae75b.firebaseapp.com",
  projectId: "autofit-ae75b",
  storageBucket: "autofit-ae75b.firebasestorage.app",
  messagingSenderId: "1020837120566",
  appId: "1:1020837120566:web:52e858363ff81462126697",
  measurementId: "G-T5WCH261LY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// ---------------------------

// Global counter for items
let globalItemCounter = 1;

// --- DOM Elements ---
const appContainer = document.getElementById('app-container');
const uiPanel = document.getElementById('ui-panel');
const arMode = document.getElementById('ar-mode');
const fittingMode = document.getElementById('fitting-mode');

const restaurantNameInput = document.getElementById('restaurantNameInput');

// Vertical Slider Elements
const verticalSliderContainer = document.getElementById('vertical-slider-container');
const largeHeightSlider = document.getElementById('largeHeightSlider');
const largeHeightValue = document.getElementById('largeHeightValue');

// AR Mode Elements
const startButton = document.getElementById('startButton');
const measurementControls = document.getElementById('measurement-controls');
const arHeader = document.getElementById('ar-header');
const instructionText = document.getElementById('instruction-text');
const tapIndicator = document.getElementById('tap-indicator');
const tapCounter = document.getElementById('tap-counter');
const adjustmentControls = document.getElementById('adjustment-controls');
const itemNameInput = document.getElementById('itemNameInput');
const itemWeightInput = document.getElementById('itemWeightInput');

const nonRotationalCheck = document.getElementById('nonRotationalCheck');
const saveItemButton = document.getElementById('saveItemButton');
const cancelItemButton = document.getElementById('cancelItemButton');
const savedItemsContainer = document.getElementById('saved-items');
const savedItemList = document.getElementById('savedItemList');
const clearSavedButton = document.getElementById('clearSavedButton');
const nextStep2Button = document.getElementById('nextStep2Button');

const scanningUi = document.getElementById('scanning-ui');
const scanCountdown = document.getElementById('scan-countdown');
let isScanning = false; 
const centerCrosshair = document.getElementById('center-crosshair');
let scannedGroundY = null;

// Step 2 Mode Elements
const step2Mode = document.getElementById('step2-mode');
const step2ItemList = document.getElementById('step2ItemList');
const pkgName = document.getElementById('pkgName');
const pkgLength = document.getElementById('pkgLength');
const pkgWidth = document.getElementById('pkgWidth');
const pkgDepth = document.getElementById('pkgDepth');
const goToFittingButton = document.getElementById('goToFittingButton');
const backToARFromStep2 = document.getElementById('backToARFromStep2');

const exportJSONButton = document.getElementById('exportJSONButton');

// Fitting Mode Elements
const containerLengthInput = document.getElementById('containerLength');
const containerWidthInput = document.getElementById('containerWidth');
const containerHeightInput = document.getElementById('containerHeight');
const updateContainerButton = document.getElementById('updateContainerButton');
const backToARButton = document.getElementById('backToARButton');

// --- Three.js & WebXR Variables ---
let arRenderer, arScene, arCamera;
let arSession = null;
let referenceSpace = null;
let hitTestSource = null;
let reticle;

// WebXR Anchor Variables
let latestHitTestResult = null; 
let tapAnchors = []; 
let currentMeasuringAnchor = null; 
let currentMeasuringAnchorGroup = null; 
let currentMeasuringObject = null;

let fittingRenderer, fittingScene, fittingCamera;
let orbitControls;
let containerMesh;
const savedObjects = [];

// Variables for Box creation
let tapPoints = [];
let tapMarkers = [];
let tempLines = [];
let tempSprites = [];

const defaultMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6 });
const collideMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 });
const transparentSolidMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.1 });

// --- Helper: Create Text Sprite ---
function createTextSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; 
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 72px sans-serif'; 
    ctx.fillStyle = '#00ff00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    
    sprite.scale.set(0.15, 0.0375, 1);
    sprite.renderOrder = 999;
    return sprite;
}

// --- Helper: Create Item Name Sprite ---
function createItemNameSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(10, 10);
    ctx.font = 'bold 3px sans-serif'; 
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 20, canvas.height / 20);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    
    sprite.scale.set(0.1, 0.025, 1);
    sprite.renderOrder = 999;
    return sprite;
}

function startScanningProcess() {
    isScanning = true;
    scanningUi.classList.remove('hidden');
    measurementControls.classList.add('hidden');
    
    let timeLeft = 10;
    scanCountdown.innerText = timeLeft;
    
    const timer = setInterval(() => {
        timeLeft--;
        scanCountdown.innerText = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            isScanning = false;
            scanningUi.classList.add('hidden');
            measurementControls.classList.remove('hidden');
            resetUIForNextMeasurement(); 
        }
    }, 1000);
}

// --- AR Functions ---
async function activateXR() {
    try {
        const canvas = document.createElement('canvas');
        appContainer.innerHTML = '';
        appContainer.appendChild(canvas);
        const gl = canvas.getContext('webgl2', { xrCompatible: true });

        arScene = new THREE.Scene();
        arCamera = new THREE.PerspectiveCamera();
        arCamera.matrixAutoUpdate = false;

        arRenderer = new THREE.WebGLRenderer({
            alpha: true, preserveDrawingBuffer: true, canvas: canvas, context: gl
        });
        arRenderer.autoClear = false;

        // CHANGED: Moved 'dom-overlay' and 'anchors' to optionalFeatures[cite: 5]
        arSession = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay', 'anchors'],
            domOverlay: { root: document.body }
        });
        arSession.updateRenderState({ baseLayer: new XRWebGLLayer(arSession, gl) });

        referenceSpace = await arSession.requestReferenceSpace('local');
        const viewerSpace = await arSession.requestReferenceSpace('viewer');
        hitTestSource = await arSession.requestHitTestSource({ space: viewerSpace });

        arSession.addEventListener('select', onARSelect);
        arSession.addEventListener('end', () => { 
            arSession = null; 
            centerCrosshair.classList.add('hidden');
            scannedGroundY = null;
            resetUIForNextMeasurement(); 
        });

        reticle = new THREE.Group();
        
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        const dot = new THREE.Mesh(
            new THREE.CircleGeometry(0.005, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        
        reticle.add(ring);
        reticle.add(dot);
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        arScene.add(reticle);
        
        startButton.classList.add('hidden');
        startScanningProcess();
        centerCrosshair.classList.remove('hidden'); 

        arSession.requestAnimationFrame(onXRFrame);
    } catch (error) {
        console.error('Error starting AR session:', error);
        alert('Error starting AR session. Make sure your browser and shell support WebXR anchors and hit testing: ' + error.message);
        startButton.classList.remove('hidden');
        measurementControls.classList.add('hidden');
    }
}

function onARSelect(event) {
    if (isScanning) return;

    if (reticle.visible && !currentMeasuringObject && latestHitTestResult) {
        const point = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
        const tapIndex = tapPoints.length;
        
        tapPoints.push(point);
        tapCounter.innerText = `Taps: ${tapPoints.length} / 3`;

        if (tapPoints.length === 1) {
            arHeader.classList.add('hidden');
            instructionText.classList.add('hidden');
            savedItemsContainer.classList.add('hidden');
            nextStep2Button.classList.add('hidden');
        }

        const markerGeo = new THREE.SphereGeometry(0.0075, 16, 16);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.copy(point);
        arScene.add(marker);
        tapMarkers.push(marker);

        // CHANGED: Added fallback to check if createAnchor is supported before calling it[cite: 5]
        if (typeof latestHitTestResult.createAnchor === 'function') {
            latestHitTestResult.createAnchor().then(anchor => {
                tapAnchors.push({ anchor: anchor, index: tapIndex });
            }).catch(err => console.warn("Failed to create anchor", err));
        } else {
            console.log("Anchors not supported by this viewer, relying on static tracking.");
        }

        if (tapPoints.length === 2) {
            const p0 = tapPoints[0];
            const p1 = tapPoints[1];
            
            const lineGeo = new THREE.BufferGeometry().setFromPoints([p0, p1]);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false });
            const line = new THREE.Line(lineGeo, lineMat);
            arScene.add(line);
            tempLines.push(line);

            const dist = p0.distanceTo(p1);
            const sprite = createTextSprite(`${(dist * 100).toFixed(1)} cm`);
            const midPoint = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
            sprite.position.copy(midPoint);
            sprite.position.y += 0.05; 
            arScene.add(sprite);
            tempSprites.push(sprite);
        }

        if (tapPoints.length === 3) { 
            const p0 = tapPoints[0];
            const p1 = tapPoints[1];
            const p2 = tapPoints[2];

            tempLines.forEach(l => arScene.remove(l));
            tempLines = [];
            tempSprites.forEach(s => arScene.remove(s));
            tempSprites = [];

            const xAxis = new THREE.Vector3().subVectors(p1, p0);
            const finalWidth = xAxis.length();
            xAxis.normalize();

            const yAxis = new THREE.Vector3(0, 1, 0);
            const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
            
            const vectorToP2 = new THREE.Vector3().subVectors(p2, p0);
            if (vectorToP2.dot(zAxis) < 0) {
                zAxis.negate();
            }
            const finalDepth = Math.abs(vectorToP2.dot(zAxis));

            let calculatedHeight = parseFloat(largeHeightSlider.value);
            const rotationMatrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);

            const geometry = new THREE.BoxGeometry(1, 1, 1);
            geometry.translate(0.5, 0.5, 0.5); 

            currentMeasuringObject = new THREE.Mesh(geometry, transparentSolidMaterial);
            currentMeasuringAnchorGroup = new THREE.Group();
            arScene.add(currentMeasuringAnchorGroup);

            const firstTapAnchorObj = tapAnchors.find(a => a.index === 0);
            if (firstTapAnchorObj && firstTapAnchorObj.anchor) {
                currentMeasuringAnchor = firstTapAnchorObj.anchor;
            }

            currentMeasuringAnchorGroup.position.copy(p0);
            currentMeasuringObject.position.set(0, 0, 0);
            currentMeasuringObject.scale.set(finalWidth, calculatedHeight, finalDepth);
            currentMeasuringObject.quaternion.setFromRotationMatrix(rotationMatrix);

            const edges = new THREE.EdgesGeometry(geometry);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
            currentMeasuringObject.add(line);

            const rectGeo = new THREE.PlaneGeometry(1, 1);
            rectGeo.rotateX(-Math.PI / 2); 
            rectGeo.translate(0.5, 0, 0.5);
            const rectMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
            const baseRect = new THREE.Mesh(rectGeo, rectMat);
            currentMeasuringObject.add(baseRect);

            const unscaledRotatedGroup = new THREE.Group();
            unscaledRotatedGroup.quaternion.setFromRotationMatrix(rotationMatrix);
            
            const frontLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(finalWidth, 0, 0)]);
            const frontLine = new THREE.Line(frontLineGeo, new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false }));
            unscaledRotatedGroup.add(frontLine);

            const sideLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(finalWidth, 0, 0), new THREE.Vector3(finalWidth, 0, finalDepth)]);
            const sideLine = new THREE.Line(sideLineGeo, new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false }));
            unscaledRotatedGroup.add(sideLine);

            const frontSprite = createTextSprite(`${(finalWidth * 100).toFixed(1)} cm`);
            frontSprite.position.set(finalWidth / 2, 0.05, 0);
            unscaledRotatedGroup.add(frontSprite);

            const sideSprite = createTextSprite(`${(finalDepth * 100).toFixed(1)} cm`);
            sideSprite.position.set(finalWidth, 0.05, finalDepth / 2);
            unscaledRotatedGroup.add(sideSprite);

            currentMeasuringAnchorGroup.add(unscaledRotatedGroup);
            currentMeasuringAnchorGroup.add(currentMeasuringObject);

            tapMarkers.forEach(m => arScene.remove(m));
            tapMarkers = [];
            
            tapAnchors.forEach(a => {
                if (a.index !== 0 && a.anchor) a.anchor.delete();
            });
            tapAnchors = [];
            
            tapIndicator.classList.add('hidden');
            adjustmentControls.classList.remove('hidden');
            verticalSliderContainer.classList.remove('hidden');

            largeHeightSlider.value = calculatedHeight;
            largeHeightValue.innerText = `${(calculatedHeight * 100).toFixed(1)} cm`;
        }
    }
}

function onXRFrame(time, frame) {
    const session = frame.session;
    session.requestAnimationFrame(onXRFrame);

    const pose = frame.getViewerPose(referenceSpace);
    
    if (pose) {
        const view = pose.views[0];
        
        const viewport = session.renderState.baseLayer.getViewport(view);
        arRenderer.setSize(viewport.width, viewport.height, false);

        arCamera.matrix.fromArray(view.transform.matrix);
        arCamera.projectionMatrix.fromArray(view.projectionMatrix);
        arCamera.updateMatrixWorld(true);

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                latestHitTestResult = hitTestResults[0];
                const hitPose = latestHitTestResult.getPose(referenceSpace);
                
                if (isScanning) {
                    reticle.visible = true;
                    reticle.matrix.fromArray(hitPose.transform.matrix);
                } else {
                    if (scannedGroundY === null) {
                        scannedGroundY = hitPose.transform.position.y;
                    }
                    if (Math.abs(hitPose.transform.position.y - scannedGroundY) > 0.1) {
                        reticle.visible = false;
                        latestHitTestResult = null; 
                    } else {
                        reticle.visible = true;
                        reticle.matrix.fromArray(hitPose.transform.matrix);
                    }
                }
            } else {
                latestHitTestResult = null;
                reticle.visible = false;
            }
        }

        tapAnchors.forEach(a => {
            if (a.anchor) {
                const anchorPose = frame.getPose(a.anchor.anchorSpace, referenceSpace);
                if (anchorPose) {
                    const pos = anchorPose.transform.position;
                    tapPoints[a.index].set(pos.x, pos.y, pos.z);
                    if (tapMarkers[a.index]) {
                        tapMarkers[a.index].position.copy(pos);
                    }
                }
            }
        });

        if (currentMeasuringAnchor && currentMeasuringAnchorGroup) {
            const anchorPose = frame.getPose(currentMeasuringAnchor.anchorSpace, referenceSpace);
            if (anchorPose) {
                currentMeasuringAnchorGroup.position.copy(anchorPose.transform.position);
            }
        }

        arRenderer.render(arScene, arCamera);
    }
}

function resetUIForNextMeasurement() {
    tapPoints = [];
    tapMarkers.forEach(m => {
        if(arScene) arScene.remove(m);
    });
    tapMarkers = [];
    
    tempLines.forEach(l => {
        if(arScene) arScene.remove(l);
    });
    tempLines = [];

    tempSprites.forEach(s => {
        if(arScene) arScene.remove(s);
    });
    tempSprites = [];

    tapAnchors.forEach(a => {
        if(a.anchor) a.anchor.delete();
    });
    tapAnchors = [];
    
    if (currentMeasuringAnchor) {
        currentMeasuringAnchor.delete();
        currentMeasuringAnchor = null;
    }
    if (currentMeasuringAnchorGroup) {
        arScene.remove(currentMeasuringAnchorGroup);
        currentMeasuringAnchorGroup = null;
    }
    
    tapCounter.innerText = `Taps: 0 / 3`;
    adjustmentControls.classList.add('hidden');
    tapIndicator.classList.remove('hidden');
    arHeader.classList.remove('hidden');
    instructionText.classList.remove('hidden');
    savedItemsContainer.classList.remove('hidden');
    verticalSliderContainer.classList.add('hidden');
    
    nonRotationalCheck.checked = false;
    updateSavedItemList(); 
}

// --- Step 2 Event Listeners & Logic ---
nextStep2Button.addEventListener('click', () => {
    uiPanel.classList.add('hidden'); 
    step2Mode.classList.remove('hidden'); 
    populateStep2List();
});

backToARFromStep2.addEventListener('click', () => {
    step2Mode.classList.add('hidden'); 
    uiPanel.classList.remove('hidden'); 
});

// --- JSON Export Logic ---
exportJSONButton.addEventListener('click', async () => {
    const restaurantName = restaurantNameInput.value.trim() || 'Unknown_Restaurant';

    const exportData = {
        restaurant: restaurantName,
        totalItems: savedObjects.length,
        timestamp: serverTimestamp(), 
        items: savedObjects.map(obj => ({
            itemName: obj.name,
            weight_g: obj.weight,
            dimensions_cm: {
                width: parseFloat((obj.width * 100).toFixed(1)),
                height: parseFloat((obj.height * 100).toFixed(1)),
                depth: parseFloat((obj.depth * 100).toFixed(1))
            },
            isNonRotational: obj.nonRotational
        }))
    };

    try {
        exportJSONButton.innerText = "Syncing to Cloud...";
        const docRef = await addDoc(collection(db, "restaurants"), exportData);
        console.log("Document written with ID: ", docRef.id);
        exportJSONButton.innerText = "Synced Successfully!";
        
        setTimeout(() => {
            exportJSONButton.innerText = "Export JSON";
        }, 2000);
        
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("Failed to sync to cloud. Check console for details.");
        exportJSONButton.innerText = "Sync Failed";
    }
});

function populateStep2List() {
    step2ItemList.innerHTML = '';
    savedObjects.forEach((obj, index) => {
        const div = document.createElement('div');
        div.className = 'step2-list-item'; 
        
        const w = (obj.width * 100).toFixed(1);
        const h = (obj.height * 100).toFixed(1);
        const d = (obj.depth * 100).toFixed(1);
        const rotTag = obj.nonRotational ? 'Non-Rotational' : 'Rotational';
        
        div.innerHTML = `
            <label style="display:flex; align-items:center; cursor:pointer; width: 100%;">
                <input type="checkbox" class="step2-checkbox" data-index="${index}" checked>
                ${obj.name}: ${w} x ${h} x ${d} cm (${rotTag})
            </label>
        `;
        step2ItemList.appendChild(div);
    });
}

goToFittingButton.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.step2-checkbox');
    checkboxes.forEach(cb => {
        const index = parseInt(cb.getAttribute('data-index'));
        savedObjects[index].selectedForFitting = cb.checked;
    });

    containerLengthInput.value = parseFloat(pkgLength.value) / 100;
    containerWidthInput.value = parseFloat(pkgWidth.value) / 100;
    containerHeightInput.value = parseFloat(pkgDepth.value) / 100;

    step2Mode.classList.add('hidden');
    uiPanel.classList.add('hidden'); 
    fittingMode.classList.remove('hidden'); 
    initFittingScene();
});


// --- Fitting Functions ---
function initFittingScene() {
    if (arSession) arSession.end();

    const canvasContainer = document.getElementById('fitting-canvas-container');
    canvasContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvasContainer.appendChild(canvas);

    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    fittingScene = new THREE.Scene();
    fittingCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    
    fittingRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    fittingRenderer.setSize(width, height);
    fittingRenderer.setPixelRatio(window.devicePixelRatio);

    orbitControls = new OrbitControls(fittingCamera, fittingRenderer.domElement);

    fittingScene.add(new THREE.AmbientLight(0x404040));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    fittingScene.add(directionalLight);

    const gridHelper = new THREE.GridHelper(10, 10);
    fittingScene.add(gridHelper);

    updateContainerMesh();
    animateFitting();
}

function updateContainerMesh() {
    const len = parseFloat(containerLengthInput.value);
    const wid = parseFloat(containerWidthInput.value);
    const hei = parseFloat(containerHeightInput.value);

    if (containerMesh) {
        fittingScene.remove(containerMesh);
    }
    const geometry = new THREE.BoxGeometry(len, hei, wid);
    containerMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true }));
    containerMesh.position.y = hei / 2;
    fittingScene.add(containerMesh);

    runAutoPacking();

    const fovRad = THREE.MathUtils.degToRad(fittingCamera.fov);
    const visibleHeightNeeded = hei / 0.7; 
    const cameraZ = (visibleHeightNeeded / 2) / Math.tan(fovRad / 2);

    fittingCamera.position.set(0, hei / 2, cameraZ);
    orbitControls.target.set(0, hei / 2, 0);
    orbitControls.update();
}

function runAutoPacking() {
    const cLen = parseFloat(containerLengthInput.value); 
    const cWid = parseFloat(containerWidthInput.value);  
    const cHei = parseFloat(containerHeightInput.value); 

    savedObjects.forEach(item => {
        if (item.mesh) {
            fittingScene.remove(item.mesh);
            item.mesh = null;
        }
    });

    const itemsToPack = savedObjects.filter(o => o.selectedForFitting);
    
    itemsToPack.sort((a, b) => {
        const volA = a.width * a.height * a.depth;
        const volB = b.width * b.height * b.depth;
        return volB - volA;
    });

    const packedBoxes = [];
    let packedCount = 0;
    const step = 0.02; 

    itemsToPack.forEach((item, index) => {
        let placed = false;
        const orientations = [];

        if (item.nonRotational) {
            orientations.push({ w: item.width, h: item.height, d: item.depth }); 
        } else {
            orientations.push({ w: item.width, h: item.height, d: item.depth });
            orientations.push({ w: item.width, h: item.depth, d: item.height });
            orientations.push({ w: item.height, h: item.width, d: item.depth });
            orientations.push({ w: item.height, h: item.depth, d: item.width });
            orientations.push({ w: item.depth, h: item.width, d: item.height });
            orientations.push({ w: item.depth, h: item.height, d: item.width });
        }

        for (let o of orientations) {
            if (placed) break;
            
            if (o.w > cLen || o.h > cHei || o.d > cWid) continue;

            const minX = -cLen / 2 + o.w / 2;
            const maxX = cLen / 2 - o.w / 2;
            const minY = 0 + o.h / 2;
            const maxY = cHei - o.h / 2;
            const minZ = -cWid / 2 + o.d / 2;
            const maxZ = cWid / 2 - o.d / 2;

            for (let y = minY; y <= maxY + 0.001; y += step) {
                if (placed) break;
                for (let z = minZ; z <= maxZ + 0.001; z += step) {
                    if (placed) break;
                    for (let x = minX; x <= maxX + 0.001; x += step) {
                        
                        const testBox = new THREE.Box3().setFromCenterAndSize(
                            new THREE.Vector3(x, y, z),
                            new THREE.Vector3(o.w, o.h, o.d)
                        );

                        testBox.expandByScalar(-0.001);

                        let collision = false;
                        for (let pBox of packedBoxes) {
                            if (testBox.intersectsBox(pBox)) {
                                collision = true;
                                break;
                            }
                        }

                        if (!collision) {
                            placed = true;
                            testBox.expandByScalar(0.001);
                            packedBoxes.push(testBox);

                            const geo = new THREE.BoxGeometry(o.w, o.h, o.d);
                            const mesh = new THREE.Mesh(geo, defaultMaterial.clone());
                            const edges = new THREE.EdgesGeometry(geo);
                            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
                            mesh.add(line);

                            const nameSprite = createItemNameSprite(item.name);
                            nameSprite.position.set(0, 0, 0); 
                            mesh.add(nameSprite);

                            mesh.position.set(x, y, z);
                            fittingScene.add(mesh);
                            item.mesh = mesh;
                            packedCount++;
                            break; 
                        }
                    }
                }
            }
        }

        if (!placed) {
            const geo = new THREE.BoxGeometry(item.width, item.height, item.depth);
            const mesh = new THREE.Mesh(geo, collideMaterial.clone()); 
            const edges = new THREE.EdgesGeometry(geo);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
            mesh.add(line);

            const nameSprite = createItemNameSprite(item.name);
            nameSprite.position.set(0, 0, 0);
            mesh.add(nameSprite);

            mesh.position.set(cLen / 2 + item.width / 2 + 0.2 + (index * 0.2), item.height / 2, 0);
            fittingScene.add(mesh);
            item.mesh = mesh;
        }
    });

    const statusEl = document.getElementById('packing-status');
    if (statusEl) {
        if (packedCount === itemsToPack.length && itemsToPack.length > 0) {
            statusEl.innerHTML = `✅ Successfully packed ${packedCount} of ${itemsToPack.length} items!`;
            statusEl.className = 'status-success';
        } else if (itemsToPack.length === 0) {
            statusEl.innerHTML = `No items selected for packing.`;
            statusEl.className = '';
        } else {
            statusEl.innerHTML = `❌ Failed! Box too small. Packed ${packedCount} of ${itemsToPack.length}.`;
            statusEl.className = 'status-fail';
        }
    }
}

function animateFitting() {
    requestAnimationFrame(animateFitting);
    orbitControls.update();
    fittingRenderer.render(fittingScene, fittingCamera);
}

// --- UI Event Listeners ---
uiPanel.addEventListener('beforexrselect', (event) => {
    event.preventDefault();
});

startButton.addEventListener('click', () => {
    arMode.classList.remove('hidden');
    fittingMode.classList.add('hidden');
    step2Mode.classList.add('hidden');
    activateXR();
});

largeHeightSlider.addEventListener('input', (event) => {
    if (currentMeasuringObject) {
        const newHeight = parseFloat(event.target.value);
        currentMeasuringObject.scale.y = newHeight;
        largeHeightValue.innerText = `${(newHeight * 100).toFixed(1)} cm`;
    }
});

saveItemButton.addEventListener('click', () => {
    if (currentMeasuringObject) {
        let itemName = itemNameInput.value.trim() || `Item ${globalItemCounter}`;
        let itemWeight = itemWeightInput.value || 0;
        globalItemCounter++;

        savedObjects.push({
            name: itemName,
            weight: itemWeight, 
            photo: null, 
            width: currentMeasuringObject.scale.x,
            height: currentMeasuringObject.scale.y,
            depth: currentMeasuringObject.scale.z,
            nonRotational: nonRotationalCheck.checked,
            selectedForFitting: true,
            mesh: null
        });
        
        currentMeasuringObject = null;
        resetUIForNextMeasurement();
        
        itemNameInput.value = `Item ${globalItemCounter}`;
        itemWeightInput.value = '0';
    }
});

cancelItemButton.addEventListener('click', () => {
    currentMeasuringObject = null;
    resetUIForNextMeasurement();
});

clearSavedButton.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all saved items?")) {
        savedObjects.splice(0, savedObjects.length);
        updateSavedItemList();
        
        if (!fittingMode.classList.contains('hidden') && typeof initFittingScene === 'function') {
             initFittingScene();
        }
    }
});

updateContainerButton.addEventListener('click', updateContainerMesh);

backToARButton.addEventListener('click', () => {
    if (fittingRenderer) {
        fittingRenderer.dispose();
        document.getElementById('fitting-canvas-container').innerHTML = '';
    }
    fittingMode.classList.add('hidden');
    uiPanel.classList.remove('hidden'); 
    arMode.classList.remove('hidden');
    startButton.classList.remove('hidden');
    measurementControls.classList.add('hidden');
});

function updateSavedItemList() {
    savedItemList.innerHTML = '';
    
    if (savedObjects.length === 0) {
        savedItemList.innerHTML = '<li class="item-list-item" style="color: #aaa; font-size: 14px;">No items saved yet.</li>';
        nextStep2Button.classList.add('hidden');
        clearSavedButton.classList.add('hidden');
    } else {
        savedObjects.forEach((obj, index) => {
            const li = document.createElement('li');
            li.className = 'item-list-item';
            
            li.innerHTML = `
                ${obj.name}: ${(obj.width*100).toFixed(0)}x${(obj.height*100).toFixed(0)}x${(obj.depth*100).toFixed(0)}cm, ${obj.weight}g 
                <span class="delete-item" data-index="${index}" style="float: right; cursor: pointer; color: #e53935; font-weight: bold; padding: 0 5px;">X</span>
            `;
            savedItemList.appendChild(li);
        });
        
        if(tapPoints.length === 0 && !currentMeasuringObject) {
            nextStep2Button.classList.remove('hidden');
        }
        clearSavedButton.classList.remove('hidden');
        
        document.querySelectorAll('.delete-item').forEach(button => {
            button.addEventListener('click', (event) => {
                const indexToRemove = parseInt(event.target.getAttribute('data-index'));
                savedObjects.splice(indexToRemove, 1);
                updateSavedItemList();
            });
        });
    }
}

updateSavedItemList();