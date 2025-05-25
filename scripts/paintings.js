// scripts/paintings.js

const paintingObjects = [];
let textureLoaderInstanceP;

let canvasNormalMap = null;
let canvasRoughnessMap = null;
let canvasAoMap = null;

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
            // EXEMPEL: Definiera ledtrådar för denna tavla.
            // Byt ut dessa koordinater mot dina egna.
            clues: [
                { uv: new THREE.Vector2(0.75, 0.80) }, // En ledtråd i övre högra kvadranten
                { uv: new THREE.Vector2(0.25, 0.30) }  // En annan ledtråd i nedre vänstra
            ]
        },
        {
            id: "painting_left_2", imagePath: "images/tavla2.jpg",
            position: new THREE.Vector3(-W_half + wallOffsetToCenter, paintingCenterY, D_half * 0.4),
            rotationY: Math.PI / 2, size: { width: paintingWidth, height: paintingHeight }
            // Inga ledtrådar på denna tavla
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
            // EXEMPEL: Definiera en ledtråd för denna tavla
            clues: [
                { uv: new THREE.Vector2(0.5, 0.5) } // En ledtråd precis i mitten
            ]
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

        // ===== NYTT: SKAPA LEDTRÅDSBELYSNING =====
        if (data.clues && data.clues.length > 0) {
            paintingMesh.userData.clueLights = []; // Skapa en array för tavlans ledtrådsljus

            data.clues.forEach(clue => {
                // Skapa en röd spotlight, initialt avstängd (intensitet 0)
                const clueLight = new THREE.SpotLight(0xff0000, 0, 2, Math.PI / 16, 0.8, 2);
                clueLight.castShadow = false;

                // Beräkna ledtrådens 3D-position på tavlans yta
                const localCluePos = new THREE.Vector3(
                    (clue.uv.x - 0.5) * data.size.width,
                    (clue.uv.y - 0.5) * data.size.height,
                    (paintingDepth / 2) + 0.01 // Lätt framför ytan
                );
                const worldCluePos = paintingMesh.localToWorld(localCluePos.clone());
                clueLight.target.position.copy(worldCluePos);
                
                // Positionera själva ljuskällan en bit framför tavlan
                const normal = new THREE.Vector3();
                paintingMesh.getWorldDirection(normal); // Rikningen tavlan pekar mot
                clueLight.position.copy(worldCluePos.clone().add(normal.clone().multiplyScalar(-0.4)));

                scene.add(clueLight);
                scene.add(clueLight.target);
                paintingMesh.userData.clueLights.push(clueLight);
            });
        }
        // ===== SLUT PÅ NY KOD =====
    });
}

function getAllPaintingObjects() {
    return paintingObjects;
}