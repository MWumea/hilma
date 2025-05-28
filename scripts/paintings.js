// scripts/paintings.js

const paintingObjects = [];
let textureLoaderInstanceP;

let canvasNormalMap = null;
let canvasRoughnessMap = null;
let canvasAoMap = null;

// Global variabel för att hålla reda på vår 3D-timer
let worldTimerObject = null;

// Funktion för att skapa timern i 3D-världen
function createWorldTimer(scene, paintingMesh, paintingData) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const canvasWidth = 512;
    const canvasHeight = 128;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true
    });
    
    const planeWidth = 1.5; // Hur bred timern ska vara i meter
    const planeHeight = planeWidth * (canvasHeight / canvasWidth); // Behåll bildförhållandet
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    
    const timerMesh = new THREE.Mesh(geometry, material);
    
    // Positionera timern precis ovanför tavlan
    const paintingPos = paintingMesh.position;
    const paintingSize = paintingData.size;
    timerMesh.position.set(
        paintingPos.x,
        paintingPos.y + (paintingSize.height / 2) + 0.15, // Höjden är 15cm ovanför tavlans kant
        paintingPos.z + 0.03 // JUSTERAD: Flyttad 3cm framför tavlan
    );
    // Se till att timern också roterar med tavlan om tavlan skulle ha en annan Y-rotation
    // (Hilmas porträtt har rotationY: 0, så detta är mest för framtida robusthet)
    timerMesh.rotation.y = paintingMesh.rotation.y;
    
    scene.add(timerMesh);
    
    // Spara de delar vi behöver för att kunna uppdatera texten senare
    worldTimerObject = { context, texture, canvas, mesh: timerMesh }; // Lade till mesh här också
}


function createPaintings(scene, roomInstance) {
    if (!textureLoaderInstanceP) {
        textureLoaderInstanceP = new THREE.TextureLoader();
    }

    const canvasTexturePath = 'images/textures/book_canvas/';

    if (!canvasNormalMap && typeof renderer !== 'undefined' && renderer.capabilities) {
        const aniso = renderer.capabilities.getMaxAnisotropy();
        const repeats = 60; 

        canvasNormalMap = textureLoaderInstanceP.load(canvasTexturePath + 'book_pattern_nor_gl_1k.jpg', (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(repeats, repeats);
            texture.anisotropy = aniso;
        });

        canvasRoughnessMap = textureLoaderInstanceP.load(canvasTexturePath + 'book_pattern_rough_1k.jpg', (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(repeats, repeats);
            texture.anisotropy = aniso;
        });

        canvasAoMap = textureLoaderInstanceP.load(canvasTexturePath + 'book_pattern_ao_1k.jpg', (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(repeats, repeats);
            texture.anisotropy = aniso;
        });
    }

    const W_half = roomInstance.roomSize.width;
    const H_gallery = roomInstance.roomSize.height;
    const D_half = roomInstance.roomSize.depth;
    
    const paintingCenterY = H_gallery * 0.55;
    const wallOffsetToCenter = 0.04; 
    const paintingDepth = 0.04; 

    const sideMaterial = new THREE.MeshStandardMaterial({
        color: 0xE0D8C0, roughness: 0.8, metalness: 0.0,
    });

    const paintingHeight = H_gallery * 0.7;
    const paintingWidth = paintingHeight / 1.5;

    const paintingData = [
        {
            id: "painting_front_center", imagePath: "images/Hilma_portrait.jpg",
            position: new THREE.Vector3(0, paintingCenterY, -D_half + wallOffsetToCenter),
            rotationY: 0, size: { width: paintingWidth, height: paintingHeight }, 
            isFlat: true
        },
        {
            id: "painting_left_1", imagePath: "images/tavla1.jpg",
            position: new THREE.Vector3(-W_half + wallOffsetToCenter, paintingCenterY, -D_half * 0.4),
            rotationY: Math.PI / 2, size: { width: paintingWidth, height: paintingHeight },
            clues: [ { uv: new THREE.Vector2(0.75, 0.80) }, { uv: new THREE.Vector2(0.25, 0.30) } ]
        },
        {
            id: "painting_left_2", imagePath: "images/tavla2.jpg",
            position: new THREE.Vector3(-W_half + wallOffsetToCenter, paintingCenterY, D_half * 0.4),
            rotationY: Math.PI / 2, size: { width: paintingWidth, height: paintingHeight }
        },
        {
            id: "painting_back_center", imagePath: "images/tavla3.jpg",
            position: new THREE.Vector3(0, paintingCenterY, D_half - wallOffsetToCenter),
            rotationY: Math.PI, size: { width: paintingWidth * 1.8, height: paintingHeight * 0.9 }
        },
        {
            id: "painting_right_1", imagePath: "images/tavla4.jpg",
            position: new THREE.Vector3(W_half - wallOffsetToCenter, paintingCenterY, -D_half * 0.4),
            rotationY: -Math.PI / 2, size: { width: paintingWidth, height: paintingHeight },
            clues: [ { uv: new THREE.Vector2(0.5, 0.5) } ]
        },
        {
            id: "painting_right_2", imagePath: "images/tavla5.jpg",
            position: new THREE.Vector3(W_half - wallOffsetToCenter, paintingCenterY, D_half * 0.4),
            rotationY: -Math.PI / 2, size: { width: paintingWidth, height: paintingHeight }
        }
    ];

    paintingData.forEach(data => {
        const anisoVal = (typeof renderer !== 'undefined' && renderer.capabilities) ? renderer.capabilities.getMaxAnisotropy() : 1;
        const paintingTexture = textureLoaderInstanceP.load(data.imagePath, (texture) => {texture.anisotropy = anisoVal;});
        
        const frontMaterialProperties = { map: paintingTexture, metalness: 0.0, };

        if (!data.isFlat) {
            frontMaterialProperties.normalMap = canvasNormalMap;
            frontMaterialProperties.normalScale = new THREE.Vector2(0.4, 0.4);
            frontMaterialProperties.roughnessMap = canvasRoughnessMap;
            frontMaterialProperties.aoMap = canvasAoMap;
            frontMaterialProperties.aoMapIntensity = 0.6;
        } else {
            frontMaterialProperties.roughness = 0.8;
        }
        
        const frontMaterial = new THREE.MeshStandardMaterial(frontMaterialProperties);
        let paintingGeometry;
        let materialsForMesh;

        if (data.isFlat) { 
            paintingGeometry = new THREE.PlaneGeometry(data.size.width, data.size.height);
            materialsForMesh = frontMaterial; 
        } else { 
            paintingGeometry = new THREE.BoxGeometry(data.size.width, data.size.height, paintingDepth);
            materialsForMesh = [ sideMaterial, sideMaterial, sideMaterial, sideMaterial, frontMaterial, sideMaterial ];
            paintingGeometry.setAttribute('uv2', new THREE.BufferAttribute(paintingGeometry.attributes.uv.array, 2));
        }
        
        const paintingMesh = new THREE.Mesh(paintingGeometry, materialsForMesh);
        paintingMesh.position.copy(data.position);
        paintingMesh.rotation.y = data.rotationY;
        paintingMesh.castShadow = false; 
        paintingMesh.receiveShadow = true;
        paintingMesh.userData = { id: data.id, isPainting: true, isFlat: !!data.isFlat };
        scene.add(paintingMesh);
        paintingObjects.push(paintingMesh);
        
        if (roomInstance && typeof roomInstance.addPaintingReference === 'function') {
            roomInstance.addPaintingReference({mesh: paintingMesh, data: data });
        }

        if (data.clues && data.clues.length > 0) {
            paintingMesh.userData.clueLights = [];
            data.clues.forEach(clue => {
                const clueLight = new THREE.SpotLight(0xff0000, 0, 2, Math.PI / 16, 0.8, 2);
                clueLight.castShadow = false;
                const localCluePos = new THREE.Vector3( (clue.uv.x - 0.5) * data.size.width, (clue.uv.y - 0.5) * data.size.height, (paintingDepth / 2) + 0.01 );
                const worldCluePos = paintingMesh.localToWorld(localCluePos.clone());
                clueLight.target.position.copy(worldCluePos);
                const normal = new THREE.Vector3();
                paintingMesh.getWorldDirection(normal);
                clueLight.position.copy(worldCluePos.clone().add(normal.clone().multiplyScalar(-0.4)));
                scene.add(clueLight);
                scene.add(clueLight.target);
                paintingMesh.userData.clueLights.push(clueLight);
            });
        }
    });

    const hilmaPaintingMesh = paintingObjects.find(p => p.userData.id === 'painting_front_center');
    const hilmaPaintingData = paintingData.find(d => d.id === 'painting_front_center');
    if (hilmaPaintingMesh && hilmaPaintingData) {
        createWorldTimer(scene, hilmaPaintingMesh, hilmaPaintingData);
    }
}

function getAllPaintingObjects() {
    return paintingObjects;
}

function getWorldTimerObject() {
    return worldTimerObject;
}