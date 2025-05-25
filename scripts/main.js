// scripts/main.js
let scene, camera, renderer;
let vrButton;
let controller1, controller2;
let room;
let playerRig; 

let clock;
const movementSpeed = 1.5;
const smoothingFactor = 0.85;

let currentVelocity = new THREE.Vector3(0, 0, 0);
let targetVelocity = new THREE.Vector3(0, 0, 0);
let rightStickController = null;
let leftStickController = null;

const snapTurnAngle = THREE.MathUtils.degToRad(45);
const snapTurnThreshold = 0.7;
const snapTurnCooldown = 0.25;
let lastSnapTurnTime = 0;
let leftStickWasCentered = true;

const playerRadius = 0.3; 
// ===== NYTT: En större säkerhetsbuffert för ytterväggarna =====
const wallCollisionBuffer = 0.5; // Stoppar spelaren 50cm från väggen

let roomBoundaries = {};
let benchActualBounds = null; 

let teleportArc;
let teleportMarker;
let isTeleporting = false;
let floorMesh;

let lastWidth = 0;
let lastHeight = 0;

let gameTimerInterval = null;
const gameDuration = 7 * 60;
let timeRemaining = gameDuration;
let timerElement;
const revealStartTime = 60;
const clueLightMaxIntensity = 3.0;

let worldTimer = null;

function checkXR() {
    if ('xr' in navigator) {
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            if (supported) {
                document.getElementById('enterVR').innerText = "Starta Galleri";
                document.getElementById('enterVR').style.display = 'block';
                vrButton = document.getElementById('enterVR');
                vrButton.addEventListener('click', startVR);
            } else {
                document.getElementById('info').innerHTML = '<h1>VR stöds inte</h1><p>Din webbläsare stöder inte immersive-vr.</p>';
            }
        });
    } else {
        document.getElementById('info').innerHTML = '<h1>WebXR stöds inte</h1><p>Din webbläsare saknar WebXR-funktioner.</p>';
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
    playerRig.position.set(0, 0.5, 0); 
    playerRig.rotation.y = Math.PI;    
    playerRig.add(camera);             
    scene.add(playerRig);            

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); 
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    lastWidth = window.innerWidth;
    lastHeight = window.innerHeight;
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    renderer.outputColorSpace = THREE.SRGBColorSpace; 
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1; 

    document.getElementById('container').appendChild(renderer.domElement);
    
    timerElement = document.getElementById('timer');

    room = new Room(scene); 
    room.create();

    createTeleportSystem();

    if (room && room.roomSize) {
        // ===== JUSTERAD: Använder den nya, större bufferten för väggarna =====
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
    window.addEventListener('resize', onWindowResize, false);
    renderer.setAnimationLoop(animate);
}

function checkBenchCollision(targetPlayerX, targetPlayerZ, pRadius) {
    if (!benchActualBounds) return false; 
    const playerMinX = targetPlayerX - pRadius;
    const playerMaxX = targetPlayerX + pRadius;
    const playerMinZ = targetPlayerZ - pRadius;
    const playerMaxZ = targetPlayerZ + pRadius;
    return (
        playerMinX < benchActualBounds.maxX && playerMaxX > benchActualBounds.minX &&
        playerMinZ < benchActualBounds.maxZ && playerMaxZ > benchActualBounds.minZ
    );
}

function createTeleportSystem() {
    floorMesh = scene.children.find(obj => obj.geometry && obj.geometry.type === "PlaneGeometry" && obj.rotation.x !== 0);
    if (!floorMesh) return;

    const arcMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
    const arcGeometry = new THREE.BufferGeometry();
    teleportArc = new THREE.Line(arcGeometry, arcMaterial);
    teleportArc.visible = false;
    scene.add(teleportArc);

    const markerGeometry = new THREE.RingGeometry(0.2, 0.3, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    teleportMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    teleportMarker.rotation.x = -Math.PI / 2;
    teleportMarker.visible = false;
    scene.add(teleportMarker);
}

function applySmoothMovement(deltaTime) {
    currentVelocity.lerp(targetVelocity, 1 - Math.pow(smoothingFactor, deltaTime * 60));
    if (currentVelocity.length() > 0.001) {
        const currentX = playerRig.position.x;
        const currentZ = playerRig.position.z;
        let proposedDeltaX = currentVelocity.x * deltaTime;
        let proposedDeltaZ = currentVelocity.z * deltaTime;

        if (proposedDeltaX !== 0) {
            if (checkBenchCollision(currentX + proposedDeltaX, currentZ, playerRadius)) {
                if (proposedDeltaX > 0) { 
                    proposedDeltaX = Math.max(0, benchActualBounds.minX - playerRadius - currentX - 0.01);
                } else { 
                    proposedDeltaX = Math.min(0, benchActualBounds.maxX + playerRadius - currentX + 0.01);
                }
            }
        }
        let nextX = currentX + proposedDeltaX;

        if (proposedDeltaZ !== 0) {
            if (checkBenchCollision(nextX, currentZ + proposedDeltaZ, playerRadius)) {
                if (proposedDeltaZ > 0) { 
                    proposedDeltaZ = Math.max(0, benchActualBounds.minZ - playerRadius - currentZ - 0.01);
                } else { 
                    proposedDeltaZ = Math.min(0, benchActualBounds.maxZ + playerRadius - currentZ + 0.01);
                }
            }
        }
        let nextZ = currentZ + proposedDeltaZ;

        nextX = Math.max(roomBoundaries.minX, Math.min(roomBoundaries.maxX, nextX));
        nextZ = Math.max(roomBoundaries.minZ, Math.min(roomBoundaries.maxZ, nextZ));
        playerRig.position.set(nextX, playerRig.position.y, nextZ);
    }
}

function calculateTeleportArc(controller) {
    const points = [];
    const initialVelocity = 8; const gravity = -9.8;
    const segments = 30; const timeStep = 0.025;
    const startPos = controller.getWorldPosition(new THREE.Vector3());
    const startDir = controller.getWorldDirection(new THREE.Vector3()).negate().multiplyScalar(initialVelocity);
    let currentPos = startPos.clone(); let currentVel = startDir.clone();
    const raycaster = new THREE.Raycaster();
    for (let i = 0; i < segments; i++) {
        points.push(currentPos.clone());
        const nextPos = currentPos.clone().add(currentVel.clone().multiplyScalar(timeStep));
        nextPos.y += 0.5 * gravity * timeStep * timeStep;
        raycaster.set(currentPos, nextPos.clone().sub(currentPos).normalize());
        const intersects = raycaster.intersectObject(floorMesh);
        if (intersects.length > 0 && intersects[0].distance < currentPos.distanceTo(nextPos)) {
            points.push(intersects[0].point);
            return { hit: true, point: intersects[0].point, arcPoints: points };
        }
        currentPos.copy(nextPos); currentVel.y += gravity * timeStep;
    }
    return { hit: false, point: null, arcPoints: points };
}

function handleTeleport(controller) {
    if (!controller || !controller.inputSource || !floorMesh) return;
    const gamepad = controller.inputSource.gamepad;
    if (!gamepad || !gamepad.buttons) return;
    const trigger = gamepad.buttons[0];
    const triggerPressed = trigger && trigger.pressed;
    const triggerJustReleased = !triggerPressed && isTeleporting;

    if (triggerPressed) {
        isTeleporting = true;
        const { hit, point, arcPoints } = calculateTeleportArc(controller);
        teleportArc.geometry.setFromPoints(arcPoints);
        teleportArc.geometry.computeBoundingSphere();
        teleportArc.visible = true;
        if (hit && 
            point.x >= roomBoundaries.minX && point.x <= roomBoundaries.maxX &&
            point.z >= roomBoundaries.minZ && point.z <= roomBoundaries.maxZ) {
            if (checkBenchCollision(point.x, point.z, playerRadius)) {
                teleportMarker.visible = false;
            } else {
                teleportMarker.position.copy(point).add(new THREE.Vector3(0, 0.01, 0));
                teleportMarker.visible = true;
            }
        } else {
            teleportMarker.visible = false;
        }
    } else if (triggerJustReleased) {
        if (teleportMarker.visible) {
            playerRig.position.x = teleportMarker.position.x;
            playerRig.position.z = teleportMarker.position.z;
        }
        teleportArc.visible = false;
        teleportMarker.visible = false;
        isTeleporting = false;
    }
}

function startGame() {
    timeRemaining = gameDuration;
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    
    timerElement.style.display = 'block';
    gameTimerInterval = setInterval(updateTimer, 1000);
    updateTimer();
}

function updateWorldTimerDisplay(minutes, seconds) {
    if (!worldTimer || !worldTimer.context) return;

    const { context, texture, canvas } = worldTimer;
    const text = `${minutes}:${seconds}`;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = 'bold 90px Arial';
    context.fillStyle = 'red';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
}

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
}

function updateClueLights() {
    let intensity = 0;
    if (timeRemaining <= revealStartTime) {
        const progress = 1.0 - (timeRemaining / revealStartTime);
        intensity = clueLightMaxIntensity * progress;
    }

    const paintings = getAllPaintingObjects();
    paintings.forEach(painting => {
        if (painting.userData.clueLights) {
            painting.userData.clueLights.forEach(light => {
                light.intensity = intensity;
            });
        }
    });
}

function startVR() {
    document.getElementById('info').style.display = 'none';
    document.getElementById('enterVR').style.display = 'none';
    navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    }).then(session => {
        renderer.xr.setSession(session);
        session.addEventListener('end', onSessionEnded);
        startGame();
    });
}

function onSessionEnded() {
    document.getElementById('info').style.display = 'block';
    document.getElementById('enterVR').style.display = 'block';
    rightStickController = null; leftStickController = null;
    isTeleporting = false;
    if (teleportArc) teleportArc.visible = false;
    if (teleportMarker) teleportMarker.visible = false;

    if (gameTimerInterval) clearInterval(gameTimerInterval);
    timerElement.style.display = 'none';
    timeRemaining = gameDuration;
    updateClueLights();
}

function setupControllers() {
    function onControllerConnected(event) {
        const controller = this;
        const xrInputSource = event.data;
        if (!xrInputSource) return;
        controller.inputSource = xrInputSource;
        if (xrInputSource.handedness === 'right') rightStickController = controller;
        else if (xrInputSource.handedness === 'left') leftStickController = controller;
    }
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('connected', onControllerConnected);
    playerRig.add(controller1);
    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('connected', onControllerConnected);
    playerRig.add(controller2);
    const pointerGeometry = new THREE.BoxGeometry(0.005, 0.005, 0.2);
    const pointerMaterial = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 });
    [controller1, controller2].forEach(c => {
        const pointer = new THREE.Mesh(pointerGeometry, pointerMaterial.clone());
        pointer.position.set(0, 0, -0.1); c.add(pointer);
    });
    const controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(createControllerModel()); playerRig.add(controllerGrip1);
    const controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(createControllerModel()); playerRig.add(controllerGrip2);
}

function createControllerModel() {
    const geometry = new THREE.CylinderGeometry(0.02, 0.025, 0.18, 12);
    const material = new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.3, metalness: 0.4 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2; return mesh;
}

function onSelectStart(event) {}

function onWindowResize() {
    if (camera && renderer) {
        const currentWidth = window.innerWidth;
        const currentHeight = window.innerHeight;

        if (currentWidth !== lastWidth || currentHeight !== lastHeight) {
            camera.aspect = currentWidth / currentHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentWidth, currentHeight);
            lastWidth = currentWidth;
            lastHeight = currentHeight;
        }
    }
}

function animate() {
    const deltaTime = Math.min(clock.getDelta(), 0.1);
    const now = clock.getElapsedTime();
    targetVelocity.set(0, 0, 0);

    if (rightStickController && rightStickController.inputSource && rightStickController.inputSource.gamepad && !isTeleporting) {
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
                const strafeDirection = new THREE.Vector3().setFromMatrixColumn(playerRig.matrix, 0);
                strafeDirection.y = 0; strafeDirection.normalize();
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
                let didTurn = false;
                if (turnValueSnap > snapTurnThreshold) {
                    playerRig.rotation.y -= snapTurnAngle; didTurn = true;
                } else if (turnValueSnap < -snapTurnThreshold) {
                    playerRig.rotation.y += snapTurnAngle; didTurn = true;
                }
                if (didTurn) {
                    lastSnapTurnTime = now; leftStickWasCentered = false;
                }
            }
        }
    }
    
    if (rightStickController) handleTeleport(rightStickController);
    applySmoothMovement(deltaTime);
    renderer.render(scene, camera);
}

window.onload = function() {
    checkXR();
    init();
};