// scripts/main.js
let scene, camera, renderer;
let vrButton;
let controller1, controller2;
let room;
let playerRig;

let clock;
const movementSpeed = 1.5;
const smoothingFactor = 0.92;

const lensHorizontalOffset = -0.007; 
const lensVerticalOffset = 0.002;   

let currentVelocity = new THREE.Vector3(0, 0, 0);
let targetVelocity = new THREE.Vector3(0, 0, 0);
let rightStickController = null;
let leftStickController = null;

let leftStickGrip = null;

const snapTurnAngle = THREE.MathUtils.degToRad(45);
const snapTurnThreshold = 0.7;
const snapTurnCooldown = 0.25;
let lastSnapTurnTime = 0;
let leftStickWasCentered = true;

const playerRadius = 0.3;
const wallCollisionBuffer = 0.5;

let roomBoundaries = {};
let benchActualBounds = null;

let teleportArc;
let teleportMarker;
let activeTeleportController = null;
let floorMesh;

let lastWidth = 0;
let lastHeight = 0;

let gameTimerInterval = null;
const gameDuration = 5 * 60;
let timeRemaining = gameDuration;
let timerElement;
const revealStartTime = 60;
const clueLightMaxIntensity = 3.0;

let worldTimer = null;

let keyStates = {};
const mouseSensitivity = 0.002;
let tempPosition = new THREE.Vector3();
let tempQuaternion = new THREE.Quaternion();
let tempScale = new THREE.Vector3();

const desktopEyeHeight = 1.6;
const vrBaseHeight = 0.5;

let isGameRunning = false;

let vrSessionStarting = false;

let magnifyCamera;
let magnifyingGlass;

let lensMaterial; 
let highResLensTarget;
let lowResLensTarget; 

let isHintModeActive = false;
const hintActivationTime = 150;

let magnifyingGlassShimmer = null;
let shimmerEffectEndTime = null;

let particleSystem = null;
const particleCount = 200;
let particlesData = [];

let portraitTransitionEffect = null;


function checkXR() {
    const infoElement = document.getElementById('info');
    if ('xr' in navigator) {
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            if (supported) {
                document.getElementById('enterVR').innerText = "Starta Galleri";
                document.getElementById('enterVR').style.display = 'block';
                vrButton = document.getElementById('enterVR');
                vrButton.addEventListener('click', startVR);
            } else {
                infoElement.innerHTML = '<h1>VR stöds inte</h1><p>Din webbläsare stöder inte immersive-vr. Vänligen använd en kompatibel enhet och webbläsare.</p>';
            }
        });
    } else {
        infoElement.innerHTML = '<h1>WebXR stöds inte</h1><p>Din webbläsare saknar WebXR-funktioner. Vänligen använd en kompatibel webbläsare som stöder WebXR.</p>';
    }
}

function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    const textureLoader = new THREE.TextureLoader();
    const skyTexture = textureLoader.load('images/sky_dome_equirectangular.jpg', () => {
        skyTexture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = skyTexture;
        scene.environment = skyTexture;
    });
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    playerRig = new THREE.Group();
    playerRig.position.set(0, desktopEyeHeight, 0);
    playerRig.rotation.y = Math.PI;
    playerRig.add(camera);
    scene.add(playerRig);
    
    //Ändrad från false till true, kanske på bekostnad av spelprestanda.
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    lastWidth = window.innerWidth;
    lastHeight = window.innerHeight;
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const container = document.getElementById('container');
    container.appendChild(renderer.domElement);
    timerElement = document.getElementById('timer');
    room = new Room(scene);
    room.create();
    createTeleportSystem();
    if (room && room.roomSize) {
        roomBoundaries = {
            minX: -room.roomSize.width + wallCollisionBuffer,
            maxX: room.roomSize.width - wallCollisionBuffer,
            minZ: -room.roomSize.depth + wallCollisionBuffer,
            maxZ: room.roomSize.depth - wallCollisionBuffer,
        };
    }
    if (room.benchMesh && room.benchDimensions) {
        const benchPos = room.benchMesh.position;
        const benchDim = room.benchDimensions;
        benchActualBounds = {
            minX: benchPos.x - benchDim.length / 2, maxX: benchPos.x + benchDim.length / 2,
            minZ: benchPos.z - benchDim.depth / 2, maxZ: benchPos.z + benchDim.depth / 2,
        };
    }
    if (typeof createPaintings === 'function') {
        createPaintings(scene, room);
        if (room && typeof room.setupGalleryLighting === 'function') {
            room.setupGalleryLighting();
        }
    }
    if (typeof loadAndPlacePlants === 'function') {
        loadAndPlacePlants(scene, room.roomSize);
    }
    if (typeof getWorldTimerObject === 'function') {
        worldTimer = getWorldTimerObject();
    }
    setupControllers();
    setupDesktopControls(container);
    window.addEventListener('resize', onWindowResize, false);
    renderer.setAnimationLoop(animate);
}

function onMouseMove(event) {
    if (renderer.xr.isPresenting || vrSessionStarting) return;

    if (document.pointerLockElement === renderer.domElement.parentElement) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        playerRig.rotation.y -= movementX * mouseSensitivity;
        camera.rotation.x -= movementY * mouseSensitivity;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
    }
}

function setupDesktopControls(elementToLock) {
    const infoElement = document.getElementById('info');
    elementToLock.addEventListener('click', () => {
        if (!renderer.xr.isPresenting && !document.pointerLockElement) {
            elementToLock.requestPointerLock().catch(err => { console.warn("Fel vid begäran om pointer lock:", err); });
        }
    });
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === elementToLock) {
            document.addEventListener('mousemove', onMouseMove, false);
            infoElement.style.display = 'none';
            playerRig.position.y = desktopEyeHeight;
            if (!isGameRunning) { startGame(); }
        } else {
            document.removeEventListener('mousemove', onMouseMove, false);
            if (!renderer.xr.isPresenting) { infoElement.style.display = 'block'; }
        }
    }, false);
    document.addEventListener('keydown', (event) => { if (!renderer.xr.isPresenting) { keyStates[event.code] = true; } });
    document.addEventListener('keyup', (event) => { if (!renderer.xr.isPresenting) { keyStates[event.code] = false; } });
}

function checkBenchCollision(targetPlayerX, targetPlayerZ, pRadius) { if (!benchActualBounds) return false; const playerMinX = targetPlayerX - pRadius; const playerMaxX = targetPlayerX + pRadius; const playerMinZ = targetPlayerZ - pRadius; const playerMaxZ = targetPlayerZ + pRadius; return ( playerMinX < benchActualBounds.maxX && playerMaxX > benchActualBounds.minX && playerMinZ < benchActualBounds.maxZ && playerMaxZ > benchActualBounds.minZ ); }
function createTeleportSystem() { floorMesh = scene.children.find(obj => obj.geometry && obj.geometry.type === "PlaneGeometry" && obj.rotation.x !== 0); if (!floorMesh) return; const arcMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 }); const arcGeometry = new THREE.BufferGeometry(); teleportArc = new THREE.Line(arcGeometry, arcMaterial); teleportArc.visible = false; scene.add(teleportArc); const markerGeometry = new THREE.RingGeometry(0.2, 0.3, 16); const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide }); teleportMarker = new THREE.Mesh(markerGeometry, markerMaterial); teleportMarker.rotation.x = -Math.PI / 2; teleportMarker.visible = false; scene.add(teleportMarker); }
function applySmoothMovement(deltaTime) { currentVelocity.lerp(targetVelocity, 1 - Math.pow(smoothingFactor, deltaTime * 60)); if (currentVelocity.length() > 0.001) { const currentX = playerRig.position.x; const currentZ = playerRig.position.z; let proposedDeltaX = currentVelocity.x * deltaTime; let proposedDeltaZ = currentVelocity.z * deltaTime; if (proposedDeltaX !== 0) { if (checkBenchCollision(currentX + proposedDeltaX, currentZ, playerRadius)) { if (proposedDeltaX > 0) { proposedDeltaX = Math.max(0, benchActualBounds.minX - playerRadius - currentX - 0.01); } else { proposedDeltaX = Math.min(0, benchActualBounds.maxX + playerRadius - currentX + 0.01); } } } let nextX = currentX + proposedDeltaX; if (proposedDeltaZ !== 0) { if (checkBenchCollision(nextX, currentZ + proposedDeltaZ, playerRadius)) { if (proposedDeltaZ > 0) { proposedDeltaZ = Math.max(0, benchActualBounds.minZ - playerRadius - currentZ - 0.01); } else { proposedDeltaZ = Math.min(0, benchActualBounds.maxZ + playerRadius - currentZ + 0.01); } } } let nextZ = currentZ + proposedDeltaZ; nextX = Math.max(roomBoundaries.minX, Math.min(roomBoundaries.maxX, nextX)); nextZ = Math.max(roomBoundaries.minZ, Math.min(roomBoundaries.maxZ, nextZ)); playerRig.position.set(nextX, playerRig.position.y, nextZ); } }
function calculateTeleportArc(controller) { const points = []; const initialVelocity = 8; const gravity = -9.8; const segments = 30; const timeStep = 0.025; const startPos = controller.getWorldPosition(new THREE.Vector3()); const startDir = controller.getWorldDirection(new THREE.Vector3()).negate().multiplyScalar(initialVelocity); let currentPos = startPos.clone(); let currentVel = startDir.clone(); const raycaster = new THREE.Raycaster(); for (let i = 0; i < segments; i++) { points.push(currentPos.clone()); const nextPos = currentPos.clone().add(currentVel.clone().multiplyScalar(timeStep)); nextPos.y += 0.5 * gravity * timeStep * timeStep; raycaster.set(currentPos, nextPos.clone().sub(currentPos).normalize()); const intersects = raycaster.intersectObject(floorMesh); if (intersects.length > 0 && intersects[0].distance < currentPos.distanceTo(nextPos)) { points.push(intersects[0].point); return { hit: true, point: intersects[0].point, arcPoints: points }; } currentPos.copy(nextPos); currentVel.y += gravity * timeStep; } return { hit: false, point: null, arcPoints: points }; }

function handleTeleportation() {
    if (activeTeleportController) {
        processTeleportAction(activeTeleportController);
        return;
    }
    const controllersToCheck = [controller1, controller2].filter(c => c && c.inputSource);
    for (const controller of controllersToCheck) {
        const gamepad = controller.inputSource.gamepad;
        if (gamepad && gamepad.buttons) {
            const trigger = gamepad.buttons[0];
            if (trigger && trigger.pressed) {
                activeTeleportController = controller;
                processTeleportAction(controller);
                break;
            }
        }
    }
}

function processTeleportAction(controller) {
    if (!controller || !controller.inputSource || !floorMesh) return;
    const gamepad = controller.inputSource.gamepad;
    if (!gamepad || !gamepad.buttons) return;
    const trigger = gamepad.buttons[0];
    const triggerPressed = trigger && trigger.pressed;
    if (triggerPressed) {
        const { hit, point, arcPoints } = calculateTeleportArc(controller);
        teleportArc.geometry.setFromPoints(arcPoints);
        teleportArc.geometry.computeBoundingSphere();
        teleportArc.visible = true;
        if (hit && point.x >= roomBoundaries.minX && point.x <= roomBoundaries.maxX && point.z >= roomBoundaries.minZ && point.z <= roomBoundaries.maxZ) {
            if (checkBenchCollision(point.x, point.z, playerRadius)) {
                teleportMarker.visible = false;
            } else {
                teleportMarker.position.copy(point).add(new THREE.Vector3(0, 0.01, 0));
                teleportMarker.visible = true;
            }
        } else {
            teleportMarker.visible = false;
        }
    } else {
        if (teleportMarker.visible) {
            playerRig.position.x = teleportMarker.position.x;
            playerRig.position.z = teleportMarker.position.z;
        }
        teleportArc.visible = false;
        teleportMarker.visible = false;
        activeTeleportController = null;
    }
}

function startGame() { if (isGameRunning) return; isGameRunning = true; timeRemaining = gameDuration; if (gameTimerInterval) clearInterval(gameTimerInterval); timerElement.style.display = 'block'; gameTimerInterval = setInterval(updateTimer, 1000); updateTimer(); }
function updateWorldTimerDisplay(minutes, seconds) { if (!worldTimer || !worldTimer.context) return; const { context, texture, canvas } = worldTimer; const text = `${minutes}:${seconds}`; context.clearRect(0, 0, canvas.width, canvas.height); context.font = 'bold 90px Arial'; context.fillStyle = 'red'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, canvas.width / 2, canvas.height / 2); texture.needsUpdate = true; }

function updateTimer() {
    if (timeRemaining > 0) {
        timeRemaining--;
    } else {
        clearInterval(gameTimerInterval);
    }
    const minutes = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const seconds = (timeRemaining % 60).toString().padStart(2, '0');
    timerElement.innerText = `${minutes}:${seconds}`;
    updateWorldTimerDisplay(minutes, seconds);
    updateClueLights();

    if (!isHintModeActive && isGameRunning && (gameDuration - timeRemaining) >= hintActivationTime) {
        isHintModeActive = true;
        console.log(`HINT MODE AKTIVERAT efter ${hintActivationTime} sekunder.`);

        if (!portraitTransitionEffect || !portraitTransitionEffect.active) {
            const allPaintings = getAllPaintingObjects();
            const textures = getPaintingTextures();

            const portraitMesh = allPaintings.find(p => p.userData.id === 'painting_front_center');
            const swapTexture = textures.swaps['painting_front_center'];

            if (portraitMesh && swapTexture) {
                const shimmerPlaneGeo = new THREE.PlaneGeometry(portraitMesh.geometry.parameters.width, portraitMesh.geometry.parameters.height);
                const shimmerPlaneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
                const shimmerPlane = new THREE.Mesh(shimmerPlaneGeo, shimmerPlaneMat);

                shimmerPlane.position.copy(portraitMesh.position).add(new THREE.Vector3(0, 0, 0.01));
                shimmerPlane.rotation.copy(portraitMesh.rotation);
                scene.add(shimmerPlane);

                portraitTransitionEffect = {
                    active: true,
                    startTime: clock.getElapsedTime(),
                    duration: 1.5,
                    mesh: shimmerPlane,
                    targetMesh: portraitMesh,
                    swapped: false
                };
            }
        }

        if (clock) {
            shimmerEffectEndTime = clock.getElapsedTime() + 10.0;
            spawnParticles();
        }
    }
}

function updateClueLights() { let intensity = 0; if (timeRemaining <= revealStartTime) { const progress = 1.0 - (timeRemaining / revealStartTime); intensity = clueLightMaxIntensity * progress; } const paintings = getAllPaintingObjects(); paintings.forEach(painting => { if (painting.userData.clueLights) { painting.userData.clueLights.forEach(light => { light.intensity = intensity; }); } }); }

function spawnParticles() {
    if (!room || !room.roomSize) return;
    const spawnRadius = room.roomSize.width * 1.5; 
    const centerPoint = new THREE.Vector3(0, room.roomSize.height / 2, 0);
    for (let i = 0; i < particleCount; i++) {
        const pData = particlesData[i];
        pData.life = 8.0 + Math.random() * 2.0; 
        pData.maxLife = pData.life;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = centerPoint.x + spawnRadius * Math.sin(phi) * Math.cos(theta);
        const y = centerPoint.y + spawnRadius * Math.sin(phi) * Math.sin(theta);
        const z = centerPoint.z + spawnRadius * Math.cos(phi);
        pData.position.set(x, y, z);
        const angle = Math.random() * Math.PI * 2;
        const shimmerRadius = 0.06 * 1.15;
        const targetOffset = new THREE.Vector3(
            Math.cos(angle) * shimmerRadius,
            Math.sin(angle) * shimmerRadius,
            0
        );
        pData.target = targetOffset;
    }
}

function startVR() {
    vrSessionStarting = true;
    const infoElement = document.getElementById('info');
    infoElement.style.display = 'none';
    document.getElementById('enterVR').style.display = 'none';
    if (document.pointerLockElement) { document.exitPointerLock(); }
    window.removeEventListener('resize', onWindowResize);
    navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }).then(async (session) => {
        playerRig.position.y = vrBaseHeight;
        await renderer.xr.setSession(session);
        if (XRWebGLLayer.getNativeFramebufferScaleFactor) {
            const gl = renderer.getContext();
            const nativeScaleFactor = XRWebGLLayer.getNativeFramebufferScaleFactor(session);
            console.log(`Native (Quest 3) Framebuffer Scale Factor: ${nativeScaleFactor}`);
            await session.updateRenderState({
                baseLayer: new XRWebGLLayer(session, gl, {
                    framebufferScaleFactor: nativeScaleFactor
                })
            });
            console.log("VR-sessionen har uppdaterats för att rendera i native-upplösning.");
        } else {
            console.warn("Funktionen för att hämta native upplösning (getNativeFramebufferScaleFactor) stöds inte. Använder standardinställningar.");
        }
        session.addEventListener('end', onSessionEnded);
        startGame();
    }).catch(err => {
        console.warn("VR session request failed or was cancelled:", err);
        vrSessionStarting = false;
        infoElement.style.display = 'block';
        document.getElementById('enterVR').style.display = 'block';
        playerRig.position.y = desktopEyeHeight;
        window.addEventListener('resize', onWindowResize, false);
    });
}

function onSessionEnded() {
    vrSessionStarting = false;
    document.getElementById('info').style.display = 'block';
    document.getElementById('enterVR').style.display = 'block';
    rightStickController = null; leftStickController = null;
    activeTeleportController = null;
    if (teleportArc) teleportArc.visible = false;
    if (teleportMarker) teleportMarker.visible = false;
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    timerElement.style.display = 'none';
    playerRig.position.y = desktopEyeHeight;
    isGameRunning = false;
    timeRemaining = gameDuration;
    updateClueLights();
    updateWorldTimerDisplay('00', '00');
    window.addEventListener('resize', onWindowResize, false);
}

function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

function setupControllers() {
    const gltfLoader = new THREE.GLTFLoader();
    magnifyingGlass = new THREE.Group();
    magnifyingGlass.position.set(0, 0, -0.08);
    magnifyingGlass.rotation.x = THREE.MathUtils.degToRad(-92.5);
    magnifyingGlass.rotation.z = 0;
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.1 });
    const frameShape = new THREE.Shape();
    const frameWidth = 0.015;
    const frameHeight = 0.01;
    frameShape.moveTo(-frameWidth / 2, -frameHeight / 2);
    frameShape.lineTo(frameWidth / 2, -frameHeight / 2);
    frameShape.lineTo(frameWidth / 2, frameHeight / 2);
    frameShape.lineTo(-frameWidth / 2, frameHeight / 2);
    frameShape.lineTo(-frameWidth / 2, -frameHeight / 2);
    const points = [];
    const radius = 0.06;
    const divisions = 64;
    for (let i = 0; i < divisions; i++) {
        const angle = (i / divisions) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    const extrude_path = new THREE.CatmullRomCurve3(points);
    extrude_path.closed = true;
    const extrudeSettings = {
        steps: 128,
        bevelEnabled: false,
        extrudePath: extrude_path
    };
    const ringGeometry = new THREE.ExtrudeGeometry(frameShape, extrudeSettings);
    const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    ringMesh.rotation.x = Math.PI / 2;
    magnifyingGlass.add(ringMesh);
    const renderTargetOptions = {
        type: THREE.HalfFloatType,
        colorSpace: THREE.SRGBColorSpace
    };
    highResLensTarget = new THREE.WebGLRenderTarget(1024, 1024, renderTargetOptions);
    lowResLensTarget = new THREE.WebGLRenderTarget(64, 64, renderTargetOptions);
    lensMaterial = new THREE.MeshBasicMaterial({ map: highResLensTarget.texture });
    const lensRadius = 0.055;
    const lensGeometry = new THREE.CircleGeometry(lensRadius, 64);
    const lensMesh = new THREE.Mesh(lensGeometry, lensMaterial);
    lensMesh.name = "lens";
    lensMesh.rotation.y = Math.PI; 
    magnifyingGlass.add(lensMesh);
    const handleGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8);
    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2d21, roughness: 0.7, metalness: 0.0 });
    const handleMesh = new THREE.Mesh(handleGeometry, handleMaterial);
    handleMesh.position.y = -0.12;
    magnifyingGlass.add(handleMesh);
    const shimmerShape = new THREE.Shape();
    const shimmerWidth = 0.025;
    const shimmerHeight = 0.01;
    shimmerShape.moveTo(-shimmerWidth / 2, -shimmerHeight / 2);
    shimmerShape.lineTo(shimmerWidth / 2, -shimmerHeight / 2);
    shimmerShape.lineTo(shimmerWidth / 2, shimmerHeight / 2);
    shimmerShape.lineTo(-shimmerWidth / 2, shimmerHeight / 2);
    shimmerShape.lineTo(-shimmerWidth / 2, -shimmerHeight / 2);
    const shimmerPoints = [];
    const shimmerRadius = radius * 1.15;
    for (let i = 0; i <= divisions; i++) {
        const angle = (i / divisions) * Math.PI * 2;
        shimmerPoints.push(new THREE.Vector3(Math.cos(angle) * shimmerRadius, 0, Math.sin(angle) * shimmerRadius));
    }
    const shimmerPath = new THREE.CatmullRomCurve3(shimmerPoints);
    const shimmerExtrudeSettings = { steps: 128, bevelEnabled: false, extrudePath: shimmerPath };
    const shimmerGeometry = new THREE.ExtrudeGeometry(shimmerShape, shimmerExtrudeSettings);
    const shimmerMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
    });
    magnifyingGlassShimmer = new THREE.Mesh(shimmerGeometry, shimmerMaterial);
    magnifyingGlassShimmer.rotation.x = Math.PI / 2;
    magnifyingGlass.add(magnifyingGlassShimmer);
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = 10000;
        positions[i * 3 + 1] = 10000;
        positions[i * 3 + 2] = 10000;
        particlesData.push({
            position: new THREE.Vector3(10000, 10000, 10000),
            target: new THREE.Vector3(),
            life: 0,
            maxLife: 0
        });
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
        map: createParticleTexture(),
        size: 0.025,
        color: 0x00ffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0
    });
    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);
    magnifyCamera = new THREE.PerspectiveCamera(7, 1, 0.01, 100);
    scene.add(magnifyCamera);
    function onControllerConnected(event) {
        const controller = this;
        const grip = (controller === controller1) ? renderer.xr.getControllerGrip(0) : renderer.xr.getControllerGrip(1);
        const xrInputSource = event.data;
        if (!xrInputSource) return;
        while(grip.children.length > 0) grip.remove(grip.children[0]);
        while(controller.children.length > 0) controller.remove(controller[0]);
        controller.inputSource = xrInputSource;
        if (xrInputSource.handedness === 'right') {
            rightStickController = controller;
            gltfLoader.load('models/quest3_controller_right.glb',
                function (gltf) {
                    const sceneRoot = gltf.scene;
                    const modelToOrient = sceneRoot.getObjectByName('Object_2');
                    if (modelToOrient) {
                        modelToOrient.rotation.x = Math.PI - THREE.MathUtils.degToRad(45);
                        modelToOrient.rotation.z = Math.PI;
                    } else {
                        sceneRoot.rotation.x = Math.PI - THREE.MathUtils.degToRad(45);
                        sceneRoot.rotation.z = Math.PI;
                    }
                    grip.add(sceneRoot);
                },
                undefined,
                function (error) {
                    console.error('Ett fel uppstod vid laddning av Quest 3-kontrollermodellen', error);
                }
            );
        } else if (xrInputSource.handedness === 'left') {
            leftStickController = controller;
            leftStickGrip = grip;
            grip.add(magnifyingGlass);
        }
    }
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('connected', onControllerConnected);
    playerRig.add(controller1);
    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('connected', onControllerConnected);
    playerRig.add(controller2);
    const controllerGrip1 = renderer.xr.getControllerGrip(0);
    playerRig.add(controllerGrip1);
    const controllerGrip2 = renderer.xr.getControllerGrip(1);
    playerRig.add(controllerGrip2);
}

function onSelectStart(event) {}
function onWindowResize() { if (camera && renderer) { const currentWidth = window.innerWidth; const currentHeight = window.innerHeight; if (currentWidth !== lastWidth || currentHeight !== lastHeight) { camera.aspect = currentWidth / currentHeight; camera.updateProjectionMatrix(); renderer.setSize(currentWidth, currentHeight); lastWidth = currentWidth; lastHeight = currentHeight; } } }

function animate() {
    if (!renderer) return;
    const deltaTime = Math.min(clock.getDelta(), 0.1);
    const now = clock.getElapsedTime();
    targetVelocity.set(0, 0, 0);

    // --- START: NY KOD FÖR ATT HANTERA SKIMMER-EFFEKTEN ---
    if (portraitTransitionEffect && portraitTransitionEffect.active) {
        const elapsedTime = now - portraitTransitionEffect.startTime;
        const progress = Math.min(elapsedTime / portraitTransitionEffect.duration, 1.0);

        // Använd en sinusvåg för att tona in och ut (0 -> 1 -> 0)
        const opacity = Math.sin(progress * Math.PI);
        portraitTransitionEffect.mesh.material.opacity = opacity;

        // Byt ut bilden när skimret är som starkast (halvvägs)
        if (progress > 0.5 && !portraitTransitionEffect.swapped) {
            const textures = getPaintingTextures();
            const swapTexture = textures.swaps['painting_front_center'];
            if (swapTexture) {
                portraitTransitionEffect.targetMesh.material.map = swapTexture;
                portraitTransitionEffect.targetMesh.material.needsUpdate = true;
            }
            portraitTransitionEffect.swapped = true;
        }

        // När effekten är klar, städa upp
        if (progress >= 1.0) {
            scene.remove(portraitTransitionEffect.mesh);
            portraitTransitionEffect.mesh.geometry.dispose();
            portraitTransitionEffect.mesh.material.dispose();
            portraitTransitionEffect.active = false;
        }
    }
    // --- SLUT: NY KOD ---

    if (shimmerEffectEndTime && magnifyingGlassShimmer) {
        if (now < shimmerEffectEndTime) {
            const timeSinceStart = now - (shimmerEffectEndTime - 10.0);
            const pulse = (Math.sin(timeSinceStart * Math.PI * 2) + 1) / 2;
            magnifyingGlassShimmer.material.opacity = pulse * 0.7;
        } else {
            magnifyingGlassShimmer.material.opacity = 0;
            shimmerEffectEndTime = null;
        }
    }
    if (particleSystem && shimmerEffectEndTime && now < shimmerEffectEndTime) {
        const positions = particleSystem.geometry.attributes.position.array;
        let activeParticles = 0;
        for (let i = 0; i < particleCount; i++) {
            const pData = particlesData[i];
            if (pData.life > 0) {
                activeParticles++;
                pData.life -= deltaTime;
                const localTarget = pData.target.clone();
                const worldTarget = magnifyingGlass.localToWorld(localTarget);
                pData.position.lerp(worldTarget, deltaTime * 0.8);
                positions[i * 3] = pData.position.x;
                positions[i * 3 + 1] = pData.position.y;
                positions[i * 3 + 2] = pData.position.z;
            } else {
                 positions[i * 3 + 1] = -10000;
            }
        }
        particleSystem.visible = activeParticles > 0;
        if (particleSystem.visible) {
             const timeSinceStart = now - (shimmerEffectEndTime - 10.0);
             particleSystem.material.opacity = Math.sin(timeSinceStart * (Math.PI / 10));
             particleSystem.geometry.attributes.position.needsUpdate = true;
        }
    } else if (particleSystem) {
        particleSystem.visible = false;
    }
    if (!renderer.xr.isPresenting) {
        const forwardDirection = new THREE.Vector3();
        camera.getWorldDirection(forwardDirection);
        forwardDirection.y = 0;
        forwardDirection.normalize();
        const rightDirection = new THREE.Vector3();
        playerRig.matrixWorld.decompose(tempPosition, tempQuaternion, tempScale);
        rightDirection.set(1, 0, 0).applyQuaternion(tempQuaternion);
        if (keyStates['KeyW'] || keyStates['ArrowUp']) { targetVelocity.add(forwardDirection.clone().multiplyScalar(movementSpeed)); }
        if (keyStates['KeyS'] || keyStates['ArrowDown']) { targetVelocity.add(forwardDirection.clone().multiplyScalar(-movementSpeed)); }
        if (keyStates['KeyA'] || keyStates['ArrowLeft']) { targetVelocity.add(rightDirection.clone().multiplyScalar(-movementSpeed)); }
        if (keyStates['KeyD'] || keyStates['ArrowRight']) { targetVelocity.add(rightDirection.clone().multiplyScalar(movementSpeed)); }
    } else {
        if (!activeTeleportController && rightStickController && rightStickController.inputSource && rightStickController.inputSource.gamepad) {
            const gamepad = rightStickController.inputSource.gamepad;
            const axes = gamepad.axes;
            if (axes && axes.length >= 4) {
                const deadZoneMove = 0.15;
                const strafeValue = axes[2] || 0;
                const moveValue = axes[3] || 0;
                if (Math.abs(moveValue) > deadZoneMove) {
                    const moveDirection = camera.getWorldDirection(new THREE.Vector3());
                    moveDirection.y = 0; moveDirection.normalize();
                    const smoothMoveValue = Math.sign(moveValue) * Math.pow(Math.abs(moveValue), 1.5);
                    targetVelocity.add(moveDirection.multiplyScalar(-smoothMoveValue * movementSpeed));
                }
                if (Math.abs(strafeValue) > deadZoneMove) {
                    const strafeDirection = new THREE.Vector3();
                    playerRig.matrixWorld.decompose(tempPosition, tempQuaternion, tempScale);
                    strafeDirection.set(1,0,0).applyQuaternion(tempQuaternion).normalize();
                    const smoothStrafeValue = Math.sign(strafeValue) * Math.pow(Math.abs(strafeValue), 1.5);
                    targetVelocity.add(strafeDirection.multiplyScalar(smoothStrafeValue * movementSpeed));
                }
            }
        }
        if (leftStickController && leftStickController.inputSource && leftStickController.inputSource.gamepad) {
            const gamepad = leftStickController.inputSource.gamepad;
            const axes = gamepad.axes;
            if (axes && axes.length >= 3) {
                const deadZoneSnapStick = 0.3;
                const turnValueSnap = axes[2] || 0;
                if (Math.abs(turnValueSnap) < deadZoneSnapStick) leftStickWasCentered = true;
                if (leftStickWasCentered && (now > lastSnapTurnTime + snapTurnCooldown)) {
                    let rotationApplied = false;
                    let angleToApply = 0;
                    if (turnValueSnap > snapTurnThreshold) { angleToApply = -snapTurnAngle; rotationApplied = true; }
                    else if (turnValueSnap < -snapTurnThreshold) { angleToApply = snapTurnAngle; rotationApplied = true; }
                    if (rotationApplied) {
                        const cameraWorldPosOld = new THREE.Vector3();
                        camera.getWorldPosition(cameraWorldPosOld);
                        playerRig.rotation.y += angleToApply;
                        playerRig.updateMatrixWorld(true);
                        const cameraWorldPosNew = new THREE.Vector3();
                        camera.getWorldPosition(cameraWorldPosNew);
                        const deltaX = cameraWorldPosNew.x - cameraWorldPosOld.x;
                        const deltaZ = cameraWorldPosNew.z - cameraWorldPosOld.z;
                        playerRig.position.x -= deltaX;
                        playerRig.position.z -= deltaZ;
                        lastSnapTurnTime = now;
                        leftStickWasCentered = false;
                    }
                }
            }
        }
        handleTeleportation();
    }
    applySmoothMovement(deltaTime);
    if (renderer.xr.isPresenting && leftStickGrip && magnifyCamera && highResLensTarget) {
        const originalToneMapping = renderer.toneMapping;
        renderer.toneMapping = THREE.NoToneMapping;
        magnifyingGlass.visible = false;
        const xrEnabled = renderer.xr.enabled;
        renderer.xr.enabled = false;
        if (isHintModeActive) {
            const paintings = getAllPaintingObjects();
            const textures = getPaintingTextures();
            paintings.forEach(p => {
                if (textures.hints[p.userData.id]) {
                    const material = p.userData.isFlat ? p.material : p.material[4];
                    if (material) {
                        material.map = textures.hints[p.userData.id];
                        material.needsUpdate = true;
                    }
                }
            });
        }
        const playerEyePosition = new THREE.Vector3();
        camera.getWorldPosition(playerEyePosition);
        const lensCenterPosition = new THREE.Vector3();
        magnifyingGlass.getWorldPosition(lensCenterPosition);
        const rightVec = new THREE.Vector3();
        const upVec = new THREE.Vector3();
        const forwardVec = new THREE.Vector3();
        magnifyingGlass.matrixWorld.extractBasis(rightVec, upVec, forwardVec);
        const adjustedTarget = new THREE.Vector3();
        adjustedTarget.copy(lensCenterPosition);
        adjustedTarget.addScaledVector(rightVec, lensHorizontalOffset);
        adjustedTarget.addScaledVector(upVec, lensVerticalOffset);
        magnifyCamera.position.copy(playerEyePosition);
        const mainCameraUp = new THREE.Vector3(0, 1, 0);
        const worldQuaternion = new THREE.Quaternion();
        camera.getWorldQuaternion(worldQuaternion);
        mainCameraUp.applyQuaternion(worldQuaternion);
        magnifyCamera.up.copy(mainCameraUp);
        magnifyCamera.lookAt(adjustedTarget);
        if (targetVelocity.length() > 0) {
            renderer.setRenderTarget(lowResLensTarget);
            renderer.render(scene, magnifyCamera);
            lensMaterial.map = lowResLensTarget.texture;
        } else {
            renderer.setRenderTarget(highResLensTarget);
            renderer.render(scene, magnifyCamera);
            lensMaterial.map = highResLensTarget.texture;
        }
        lensMaterial.needsUpdate = true;
        renderer.setRenderTarget(null);
        renderer.toneMapping = originalToneMapping;
        renderer.xr.enabled = xrEnabled;
        magnifyingGlass.visible = true;
        if (isHintModeActive) {
            const paintings = getAllPaintingObjects();
            const textures = getPaintingTextures();
            paintings.forEach(p => {
                if (textures.hints[p.userData.id]) {
                    const material = p.userData.isFlat ? p.material : p.material[4];
                    if (material) {
                        material.map = textures.originals[p.userData.id];
                        material.needsUpdate = true;
                    }
                }
            });
        }
        const lensMesh = magnifyingGlass.getObjectByName('lens');
        if (lensMesh) {
            lensMesh.up.copy(mainCameraUp);
            lensMesh.lookAt(playerEyePosition);
        }
    }
    renderer.render(scene, camera);
}

init();
checkXR();
