// scripts/room.js

class Room {
    constructor(scene) {
        this.scene = scene;
        this.roomSize = {
            width: 4, height: 4.0, depth: 4
        };
        this.textureLoader = new THREE.TextureLoader();
        this.paintings = [];
        this.pyramidHeight = 0;
        this.benchMesh = null;
        this.benchDimensions = null;
        this.spotlightFixtures = [];
    }

    addPaintingReference(paintingWrapper) {
        this.paintings.push(paintingWrapper);
    }

    loadRepeatingTexture(fileName, repeatsX, repeatsY, aniso) {
        const textureBasePath = 'images/textures/dark_wooden_planks/';
        const fullPath = textureBasePath + fileName;
        const texture = this.textureLoader.load(fullPath,
            () => { /* console.log(`Textur SUCCESSFULLT laddad: ${fullPath}`); */ },
            undefined,
            (err) => { console.error(`Kunde INTE ladda textur: ${fullPath}`, err); }
        );
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatsX, repeatsY);
        if (aniso && typeof renderer !== 'undefined' && renderer.capabilities) {
             texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    create() {
        this.createFloor();
        this.createCeiling();
        this.createWalls();
        this.createCenterBench();
    }

    createFloor() {
        const floorWidth = this.roomSize.width * 2;
        const floorDepth = this.roomSize.depth * 2;
        const floorGeometry = new THREE.PlaneGeometry(floorWidth, floorDepth);
        floorGeometry.setAttribute('uv2', new THREE.BufferAttribute(floorGeometry.attributes.uv.array, 2));
        const floorColorMap = this.loadRepeatingTexture('dark_wooden_planks_diff_1k.jpg', 4, 4);
        const floorRoughnessMap = this.loadRepeatingTexture('dark_wooden_planks_rough_1k.jpg', 4, 4);
        const floorNormalMap = this.loadRepeatingTexture('dark_wooden_planks_nor_gl_1k.jpg', 4, 4);
        const floorAoMap = this.loadRepeatingTexture('dark_wooden_planks_ao_1k.jpg', 4, 4);
        const floorMaterial = new THREE.MeshStandardMaterial({
            map: floorColorMap, roughnessMap: floorRoughnessMap, normalMap: floorNormalMap,
            aoMap: floorAoMap, aoMapIntensity: 0.8, normalScale: new THREE.Vector2(0.7, 0.7),
            metalness: 0.0, envMapIntensity: 0.4
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    createEdgeFrame(point1, point2, thickness, material) {
        const direction = new THREE.Vector3().subVectors(point2, point1);
        const length = direction.length();
        const frameGeom = new THREE.BoxGeometry(thickness, thickness, length);
        const frameMesh = new THREE.Mesh(frameGeom, material);
        frameMesh.castShadow = true;
        frameMesh.receiveShadow = true;
        frameMesh.position.copy(point1).add(direction.clone().multiplyScalar(0.5));
        frameMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
        this.scene.add(frameMesh);
        return frameMesh;
    }

    createCeiling() {
        const desiredBaseSideLength = this.roomSize.width * 2;
        const pyramidRadiusForCone = desiredBaseSideLength / Math.sqrt(2);
        this.pyramidHeight = this.roomSize.height * 0.6;
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            metalness: 0.1, roughness: 0.05, transmission: 0.95,
            transparent: true, ior: 1.5, side: THREE.DoubleSide, envMapIntensity: 1.0,
        });
        const pyramid = new THREE.Mesh(
            new THREE.ConeGeometry(pyramidRadiusForCone, this.pyramidHeight, 4, 1, false),
            glassMaterial
        );
        pyramid.position.set(0, this.roomSize.height + this.pyramidHeight / 2, 0);
        pyramid.rotation.y = Math.PI / 4;
        pyramid.castShadow = true;
        pyramid.receiveShadow = true;
        this.scene.add(pyramid);

        const frameThickness = 0.075;
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333, metalness: 0.9,
            roughness: 0.3, envMapIntensity: 0.6
        });
        const baseY = this.roomSize.height;
        const apexY = baseY + this.pyramidHeight;
        const apexPoint = new THREE.Vector3(0, apexY, 0);
        const halfBase = this.roomSize.width;
        const corners = [
            new THREE.Vector3( halfBase, baseY, -halfBase),
            new THREE.Vector3(-halfBase, baseY, -halfBase),
            new THREE.Vector3(-halfBase, baseY,  halfBase),
            new THREE.Vector3( halfBase, baseY,  halfBase)
        ];
        this.createEdgeFrame(corners[0], corners[1], frameThickness, frameMaterial);
        this.createEdgeFrame(corners[1], corners[2], frameThickness, frameMaterial);
        this.createEdgeFrame(corners[2], corners[3], frameThickness, frameMaterial);
        this.createEdgeFrame(corners[3], corners[0], frameThickness, frameMaterial);
        corners.forEach(corner => {
            this.createEdgeFrame(corner, apexPoint, frameThickness, frameMaterial);
        });
    }

    createWalls() {
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5f5f5, roughness: 0.9, metalness: 0.0,
            side: THREE.DoubleSide, envMapIntensity: 0.3
        });
        this.createWall(new THREE.Vector3(0, this.roomSize.height / 2, -this.roomSize.depth), new THREE.Euler(0, 0, 0), wallMaterial.clone(), 'front');
        this.createWall(new THREE.Vector3(0, this.roomSize.height / 2, this.roomSize.depth), new THREE.Euler(0, Math.PI, 0), wallMaterial.clone(), 'back');
        this.createWall(new THREE.Vector3(-this.roomSize.width, this.roomSize.height / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), wallMaterial.clone(), 'left');
        this.createWall(new THREE.Vector3(this.roomSize.width, this.roomSize.height / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), wallMaterial.clone(), 'right');
    }

    createWall(position, rotationEuler, material, wallId) {
        const wallHeight = this.roomSize.height;
        const wallPlaneWidth = this.roomSize.width * 2;
        const wallGeometry = new THREE.PlaneGeometry(wallPlaneWidth, wallHeight);
        const wall = new THREE.Mesh(wallGeometry, material);
        wall.position.copy(position);
        wall.rotation.copy(rotationEuler);
        wall.userData.wallId = wallId;
        wall.receiveShadow = true;
        this.scene.add(wall);
        return wall;
    }

    createCenterBench() {
        const benchLength = this.roomSize.width * 0.5;
        const benchDepth = 0.7;
        const benchHeight = 0.65;
        const distanceFromWall = 1.2;
        const newBenchZ = -this.roomSize.depth + distanceFromWall + (benchDepth / 2);
        this.benchDimensions = { length: benchLength, depth: benchDepth, height: benchHeight };
        const benchGeometry = new THREE.BoxGeometry(benchLength, benchHeight, benchDepth);
        const benchMaterial = new THREE.MeshStandardMaterial({
            color: 0xdadada, roughness: 0.7, metalness: 0.1, envMapIntensity: 0.5
        });
        const bench = new THREE.Mesh(benchGeometry, benchMaterial);
        bench.position.set(0, benchHeight / 2, newBenchZ);
        bench.castShadow = true;
        bench.receiveShadow = true;
        this.scene.add(bench);
        this.benchMesh = bench;
    }

    createSpotlightFixture(scene) {
        const fixtureGroup = new THREE.Group();
        const fixtureMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.7,
            roughness: 0.6
        });

        const lampHeadRadius = 0.04;
        const lampHeadLength = 0.12;
        const lampHeadGeom = new THREE.CylinderGeometry(lampHeadRadius, lampHeadRadius * 0.75, lampHeadLength, 12);
        const lampHeadMesh = new THREE.Mesh(lampHeadGeom, fixtureMaterial);
        lampHeadMesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        lampHeadMesh.castShadow = false;
        fixtureGroup.add(lampHeadMesh);

        const spotlight = new THREE.SpotLight(
            0xfff5e0,
            2.0,
            15,
            Math.PI / 15,
            0.25,
            2.0
        );
        spotlight.castShadow = false;
        spotlight.position.set(0, 0, -lampHeadLength / 2 - 0.01);

        const lightTarget = new THREE.Object3D();
        lightTarget.position.set(0,0,-1);
        fixtureGroup.add(lightTarget);
        spotlight.target = lightTarget;

        fixtureGroup.add(spotlight);
        scene.add(fixtureGroup);
        this.spotlightFixtures.push(fixtureGroup);
        return { fixture: fixtureGroup, light: spotlight };
    }

    setupGalleryLighting() {
        // ===== START PÅ BELYSNINGSJUSTERINGAR =====

        // Öka ambient light för att lyfta skuggor
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.55); 
        this.scene.add(ambientLight);

        // Förstärk hemisphere light för mjukare, jämnare belysning
        const hemisphereLight = new THREE.HemisphereLight(0xccccff, 0x888866, 0.75); // Justerat groundColor lite för mindre intensivt gult
        hemisphereLight.position.y = this.roomSize.height;
        this.scene.add(hemisphereLight);

        // Huvudsakligt solljus (DirectionalLight)
        const sunLight = new THREE.DirectionalLight(0xfff0e5, 0.9); 
        sunLight.position.set(this.roomSize.width * 0.5, this.roomSize.height + this.pyramidHeight + 3, this.roomSize.depth * 0.5);
        sunLight.target.position.set(0, this.roomSize.height / 2, 0);
        this.scene.add(sunLight.target);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 1024;
        sunLight.shadow.mapSize.height = 1024;
        const shadowCamSize = this.roomSize.width * 1.75;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = this.roomSize.height + this.pyramidHeight + 10;
        sunLight.shadow.camera.left = -shadowCamSize;
        sunLight.shadow.camera.right = shadowCamSize;
        sunLight.shadow.camera.top = shadowCamSize;
        sunLight.shadow.camera.bottom = -shadowCamSize;
        sunLight.shadow.bias = -0.001; // Behåller befintlig bias, bra för att motverka shadow acne
        this.scene.add(sunLight);

        // Lägg till en svag fyllbelysning (fill light) från motsatt håll
        const fillLight = new THREE.DirectionalLight(0xfff0e5, 0.2); // Svag intensitet
        fillLight.position.set(-this.roomSize.width * 0.5, this.roomSize.height * 0.75, -this.roomSize.depth * 0.5); // Motsatt och något lägre
        fillLight.target.position.set(0, this.roomSize.height / 2, 0);
        this.scene.add(fillLight.target);
        fillLight.castShadow = false; // Fyllbelysning bör sällan kasta skuggor
        this.scene.add(fillLight);

        // ===== SLUT PÅ BELYSNINGSJUSTERINGAR =====

        // Belysning för tavlor (spotlights)
        const fixtureYPosition = this.roomSize.height - 0.05;
        const fixtureHorizontalInset = 0.1;

        this.paintings.forEach((paintingWrapper) => {
            if (!paintingWrapper || !paintingWrapper.mesh || !paintingWrapper.data) return;
            const paintingMesh = paintingWrapper.mesh;
            const paintingData = paintingWrapper.data;

            const { fixture, light } = this.createSpotlightFixture(this.scene);

            const paintingWorldPos = new THREE.Vector3();
            paintingMesh.getWorldPosition(paintingWorldPos);

            let lx, lz;
            const W = this.roomSize.width;
            const D = this.roomSize.depth;
            
            // Korsvis belysning för tavlorna
            if (Math.abs(paintingData.rotationY) < 0.1) {
                lx = paintingWorldPos.x;
                lz = D - fixtureHorizontalInset;
            } else if (Math.abs(paintingData.rotationY - Math.PI) < 0.1) {
                lx = paintingWorldPos.x;
                lz = -D + fixtureHorizontalInset;
            } else if (Math.abs(paintingData.rotationY - Math.PI / 2) < 0.1) {
                lx = W - fixtureHorizontalInset;
                lz = paintingWorldPos.z;
            } else {
                lx = -W + fixtureHorizontalInset;
                lz = paintingWorldPos.z;
            }

            fixture.position.set(lx, fixtureYPosition, lz);
            fixture.lookAt(paintingWorldPos);
            light.target = paintingMesh;

            light.castShadow = false;
        });
    }
}