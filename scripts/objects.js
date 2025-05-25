// scripts/objects.js

function loadAndPlacePlants(scene, roomSize) {
    const loader = new THREE.GLTFLoader();
    const cornerOffset = 0.5; // 50 cm från väggen
    
    // Sökvägen till din nya 3D-modell
    const plantPath = 'models/free_pothos_potted_plant_money_plant.glb';

    // Ladda modellen en gång
    loader.load(
        plantPath,
        function (gltf) {
            const plantModel = gltf.scene;
            
            // Se till att växten kan kasta skuggor
            plantModel.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });

            // Definiera alla fyra hörnpositioner
            const positions = [
                new THREE.Vector3(roomSize.width - cornerOffset, 0, roomSize.depth - cornerOffset),   // Bakre högra
                new THREE.Vector3(-roomSize.width + cornerOffset, 0, roomSize.depth - cornerOffset),  // Bakre vänstra
                new THREE.Vector3(roomSize.width - cornerOffset, 0, -roomSize.depth + cornerOffset),  // Främre högra
                new THREE.Vector3(-roomSize.width + cornerOffset, 0, -roomSize.depth + cornerOffset)  // Främre vänstra
            ];

            // Skapa en klon av modellen för varje position
            positions.forEach(pos => {
                const plant = plantModel.clone();
                plant.position.copy(pos);

                // **JUSTERA HÄR:** Starta med skala 1 och justera vid behov.
                // Om växten är för stor eller för liten, ändra dessa värden.
                plant.scale.set(1.0, 1.0, 1.0); 

                scene.add(plant);
            });
            
            console.log(`Alla växter av typen ${plantPath} har laddats och placerats ut.`);
        },
        undefined, 
        function (error) {
            console.error(`Ett fel uppstod vid laddning av modellen ${plantPath}:`, error);
        }
    );
}