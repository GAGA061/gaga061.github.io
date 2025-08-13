let canvas = document.getElementById('renderCanvas');
let engine = new BABYLON.Engine(canvas, true);
let scene, camera, wall, holds = [], selectedShape = 'crimp', selectedHold = null;
let isDragging = false;
let originalMaterials = {};
let isCameraMoveMode = false;
let isWallEditMode = false;
let walls = [];

// LISTE CENTRALISÉE DES FORMES DE PRISES (FICHIERS OBJ)
const HOLD_SHAPES = {
    crimp: {
        name: 'Crimp',
        objFile: 'crimp.obj',
        scale: 1.2 // Facteur d'échelle pour ajuster la taille
    },
    jug: {
        name: 'Jug', 
        objFile: 'round11.obj',
        scale: 1
    },
    sloper: {
        name: 'Sloper',
        objFile: 'bowl.obj',
        scale: 1
    },
    pinch: {
        name: 'Pinch',
        objFile: 'pinch.obj',
        scale: 1
    },
    pocket: {
        name: 'Pocket',
        objFile: 'volcano.obj',
        scale: 1
    },
    volume: {
        name: 'Volume',
        objFile: 'volume.obj',
        scale: 1
    },
    volumetr: {
        name: 'Volumetr',
        objFile: 'volumetr.obj',
        scale: 1
    },
    volumetr2: {
        name: 'Volumetr2',
        objFile: 'volumetr2.obj',
        scale: 1
    },
    volumetr3: {
        name: 'Volumetr3',
        objFile: 'volumetr3.obj',
        scale: 1
    },
    volumetr4: {
        name: 'Volumetr4',
        objFile: 'volumetr4.obj',
        scale: 1
    },
    volumetr5: {
        name: 'Volumetr5',
        objFile: 'volumetr5.obj',
        scale: 1
    },
    poignet: {
        name: 'Poignet',
        objFile: 'poignet.obj',
        scale: 1
    },
    ruler: {
        name: 'Ruler',
        objFile: 'rule.obj',
        scale: 0.63
    },
    back: {
        name: 'Back',
        objFile: 'back.obj',
        scale: 1
    },
    newpinch: {
        name: 'Newpinch',
        objFile: 'newpinch.obj',
        scale: 1
    },
    bihold: {
        name: 'Bihold',
        objFile: 'bihold.obj',
        scale: 1
    }
    // Ajoutez facilement d'autres prises en ajoutant leurs fichiers OBJ ici
};

// Cache pour stocker les meshes chargés et éviter de recharger les mêmes OBJ
const loadedMeshCache = {};

// Fonction utilitaire pour créer une forme à partir d'un fichier OBJ
async function createHoldShape(shapeType, scene) {
    const shapeConfig = HOLD_SHAPES[shapeType];
    if (!shapeConfig) {
        console.warn(`Shape type '${shapeType}' not found, using default crimp`);
        return createHoldShape('crimp', scene);
    }

    // Vérifier si le mesh est déjà en cache
    if (loadedMeshCache[shapeType]) {
        try {
            // CORRECTION: Vérifier que le mesh en cache n'est pas disposé
            if (loadedMeshCache[shapeType].isDisposed) {
                console.warn(`Mesh en cache ${shapeType} est disposé, rechargement...`);
                delete loadedMeshCache[shapeType];
                // Forcer le rechargement
                return createHoldShape(shapeType, scene);
            }
            
            // Cloner le mesh existant - CORRECTION: Clone profond
            const clonedMesh = loadedMeshCache[shapeType].clone(`${shapeType}_${Date.now()}`, null, true);
            
            // NOUVEAU: Vérifier que le clone a réussi
            if (!clonedMesh) {
                console.error(`Échec du clonage pour ${shapeType}, rechargement...`);
                delete loadedMeshCache[shapeType];
                return createHoldShape(shapeType, scene);
            }
            
            console.log(`✅ Mesh ${shapeType} cloné depuis le cache`);
            return clonedMesh;
            
        } catch (error) {
            console.error(`Erreur lors du clonage de ${shapeType}:`, error);
            // Nettoyer le cache corrompu et recharger
            delete loadedMeshCache[shapeType];
            return createHoldShape(shapeType, scene);
        }
    }

    // Charger le fichier OBJ
    try {
        return new Promise((resolve, reject) => {
            BABYLON.SceneLoader.ImportMesh("", "./holds/", shapeConfig.objFile, scene, 
                function (meshes) {
                    if (meshes.length === 0) {
                        console.error(`No meshes found in ${shapeConfig.objFile}`);
                        reject(new Error(`No meshes found in ${shapeConfig.objFile}`));
                        return;
                    }

                    let holdMesh;
                    
                    // Si plusieurs meshes, les combiner en un seul
                    if (meshes.length > 1) {
                        // Créer un parent vide
                        holdMesh = new BABYLON.TransformNode(`${shapeType}_parent`, scene);
                        meshes.forEach(mesh => {
                            mesh.parent = holdMesh;
                        });
                    } else {
                        holdMesh = meshes[0];
                    }

                    // Appliquer l'échelle
                    holdMesh.scaling = new BABYLON.Vector3(shapeConfig.scale, shapeConfig.scale, shapeConfig.scale);
                    
                    // CORRECTION: Rendre le mesh original invisible et le mettre en cache
                    holdMesh.setEnabled(false); // Cache le mesh original
                    loadedMeshCache[shapeType] = holdMesh;
                    
                    // Retourner une copie visible pour utilisation
                    const meshToUse = holdMesh.clone(`${shapeType}_${Date.now()}`, null, true);
                    meshToUse.setEnabled(true); // S'assurer que la copie est visible
                    
                    console.log(`✅ Mesh ${shapeType} chargé et mis en cache`);
                    resolve(meshToUse);
                },
                null, // onProgress
                function (scene, message, exception) {
                    console.error(`Error loading ${shapeConfig.objFile}:`, message, exception);
                    reject(new Error(`Failed to load ${shapeConfig.objFile}: ${message}`));
                }
            );
        });
    } catch (error) {
        console.error(`Error creating hold shape ${shapeType}:`, error);
        // Fallback vers une forme basique
        return BABYLON.MeshBuilder.CreateSphere(`${shapeType}_fallback`, { diameter: 0.4 }, scene);
    }
}

// Lors de la création de chaque mur, tu l'ajoutes à la liste
function createWall(position = new BABYLON.Vector3(0, 1.5, 0), width = 4, height = 3, depth = 0.1) {
    const wallIndex = walls.length;
    const wall = BABYLON.MeshBuilder.CreateBox(`wall_${wallIndex}`, { width, height, depth }, scene);
    
    wall.position = position;
    
    // Matériau
    const wallMaterial = new BABYLON.StandardMaterial(`wallMaterial_${wallIndex}`, scene);
    wallMaterial.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.6);
    wall.material = wallMaterial;
    
    // Marquer comme mur
    wall.isWall = true;
    wall.wallIndex = wallIndex;
    
    walls.push(wall);
    console.log("🏗️ Nouveau mur créé:", wall.name);
    
    return wall;
}

createScene();
toggleMode();

function createScene() {
    scene = new BABYLON.Scene(engine);

    highlightLayer = new BABYLON.HighlightLayer("highlightLayer", scene);
    // Camera setup
    camera = new BABYLON.ArcRotateCamera("camera", Math.PI, Math.PI / 2, 10, new BABYLON.Vector3(0, 0, 0), scene);
    camera.setPosition(new BABYLON.Vector3(0, 5, 10));
    camera.attachControl(canvas, true);

    let light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(1, 1, 0), scene);
    light.intensity = 0.7;

    // Event listeners
    document.getElementById('saveWall').addEventListener('click', saveWall);
    document.getElementById('loadWall').addEventListener('click', loadWall);
    document.getElementById('shapeSearch').addEventListener('input', filterShapes);
    document.getElementById('shapeColor').addEventListener('input', updateShapeColor);
    document.getElementById('toggleMode').addEventListener('click', toggleMode);
    document.querySelectorAll('.shapeItem').forEach(item => {
        item.addEventListener('click', selectShape);
    });

    canvas.addEventListener("contextmenu", onRightClick);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);

    engine.runRenderLoop(() => {
        scene.render();
    });

    window.addEventListener("resize", () => {
        engine.resize();
    });
}
///si bug sup//////////////////////////////////////////////////////////////////


// Garder la fonction toggleMode ORIGINALE intacte (elle fonctionne bien) :
function toggleMode() {
    isCameraMoveMode = !isCameraMoveMode;
    document.getElementById('toggleMode').textContent = isCameraMoveMode ? "Camera" : "Edit";
    
    if (isCameraMoveMode && !isWallEditMode) {
        camera.attachControl(canvas, true);
        scene.defaultCursor = "grab";
        document.getElementById('currentMode').textContent = 'Mode Camera';
        document.getElementById('toggleWallEdit').style.display = 'none';
        document.getElementById('modeIndicator').className='status-indicator status-camera';

    } else if(!isCameraMoveMode && !isWallEditMode){
        camera.detachControl(canvas);
        scene.defaultCursor = "crosshair";
        document.getElementById('currentMode').textContent = 'Mode Edit';
        document.getElementById('toggleWallEdit').style.display = 'block';
        document.getElementById('modeIndicator').className='status-indicator status-create';
        
    } else if(isCameraMoveMode && isWallEditMode){
        camera.attachControl(canvas, true);
        scene.defaultCursor = "grab";
        document.getElementById('currentMode').textContent = 'Mode Wall Camera';
        document.getElementById('toggleWallEdit').style.display = 'block';
        document.getElementById('modeIndicator').className='status-indicator status-edit';

    } else if(!isCameraMoveMode && isWallEditMode){
        camera.detachControl(canvas);
        scene.defaultCursor = "crosshair";
        document.getElementById('currentMode').textContent = 'Mode Wall edit';
        document.getElementById('toggleWallEdit').style.display = 'block';
        document.getElementById('modeIndicator').className='status-indicator status-edit';
    }
}

function onRightClick(evt) {
    if (!canCreateHold()) return; 
    if (isCameraMoveMode) return; // Ne pas placer de prises en mode caméra
    
    evt.preventDefault();
    let pickResult = scene.pick(scene.pointerX, scene.pointerY);

    console.log("🎯 Clic droit détecté");
    console.log("Hit:", pickResult.hit);
    console.log("Picked mesh:", pickResult.pickedMesh?.name);
    console.log("Murs disponibles:", walls.length);

    if (pickResult.hit && pickResult.pickedMesh) {
        // VÉRIFICATION EXPLICITE: Est-ce que c'est un mur ?
        let targetWall = null;
        
        // Méthode 1: Vérifier avec le tag isWall
        if (pickResult.pickedMesh.isWall) {
            targetWall = pickResult.pickedMesh;
        } 
        // Méthode 2: Vérifier si le mesh est dans le tableau walls
        else if (walls.includes(pickResult.pickedMesh)) {
            targetWall = pickResult.pickedMesh;
        }
        // Méthode 3: Vérifier par le nom (pour les panels)
        else if (pickResult.pickedMesh.name && pickResult.pickedMesh.name.startsWith('wall')) {
            // Vérifier que c'est bien dans walls ou wallPanels
            if (walls.includes(pickResult.pickedMesh) || wallPanels.some(p => p.mesh === pickResult.pickedMesh)) {
                targetWall = pickResult.pickedMesh;
            }
        }

        if (targetWall) {
            console.log("✅ Mur valide détecté:", targetWall.name);
            console.log("Position de la prise:", pickResult.pickedPoint);
            
            addHoldAtPosition(pickResult.pickedPoint, targetWall).catch(error => {
                console.error("❌ Erreur lors de l'ajout de la prise:", error);
            });
        } else {
            console.log("❌ Objet cliqué n'est pas un mur valide");
            console.log("Type d'objet:", pickResult.pickedMesh.constructor.name);
            console.log("isWall:", pickResult.pickedMesh.isWall);
            console.log("isHold:", pickResult.pickedMesh.isHold);
        }
    } else {
        console.log("❌ Aucun objet détecté par le raycast");
    }
}

/*function onPointerDown(evt) {
    if (isCameraMoveMode) return;
    
    let pickResult = scene.pick(scene.pointerX, scene.pointerY);
    if (pickResult.hit && evt.button === 0) { // Clic gauche
        console.log(pickResult);
        // Vérifier si c'est une prise (pas un mur)
        if (pickResult.pickedMesh && !pickResult.pickedMesh.isWall) {
            // Vérifier si c'est bien une prise dans notre tableau holds
            const holdData = holds.find(h => h.mesh === pickResult.pickedMesh);
            if (holdData) {
                highlightHold(pickResult.pickedMesh);
                selectedHold = pickResult.pickedMesh;
                isDragging = true;
                console.log("🎯 Prise sélectionnée:", pickResult.pickedMesh.name);
            }
        }
    }
}*/

/*function onPointerMove(evt) {
    if (isDragging && selectedHold) {
        let pickResult = scene.pick(scene.pointerX, scene.pointerY);
        if (pickResult.hit && pickResult.pickedMesh && pickResult.pickedMesh.isWall) {
            // Récupérer le mur sur lequel on déplace la prise
            const targetWall = pickResult.pickedMesh;
            
            // Calculer la normale du mur en tenant compte de sa rotation
            const rotationMatrix = BABYLON.Matrix.RotationYawPitchRoll(
                targetWall.rotation.y, 
                targetWall.rotation.x, 
                targetWall.rotation.z
            );
            
            // Normale de base du mur (face avant)
            const baseNormal = new BABYLON.Vector3(0, 0, 1);
            
            // Appliquer la rotation à la normale
            const transformedNormal = BABYLON.Vector3.TransformNormal(baseNormal, rotationMatrix);
            
            // Décalage pour que la prise ne soit pas dans le mur
            const offset = 0.2;
            
            // Position finale = point d'impact + normale transformée * offset
            const finalPosition = pickResult.pickedPoint.add(transformedNormal.scale(offset));
            
            // Appliquer la position à la prise
            selectedHold.position.copyFrom(finalPosition);
            
            // Optionnel : faire tourner la prise selon l'orientation du mur
            selectedHold.rotation.copyFrom(targetWall.rotation);
            
            console.log("🎯 Prise déplacée sur mur incliné:", {
                wallRotation: targetWall.rotation,
                holdPosition: finalPosition,
                normal: transformedNormal
            });
        }
    }
}*/
function calculateSurfaceNormalAtPoint(mesh, worldPoint, pickInfo = null) {
    if (!mesh || !worldPoint) return new BABYLON.Vector3(0, 0, 1);
    
    try {
        // Si on a les informations de pick (recommandé)
        if (pickInfo && pickInfo.getNormal) {
            const normal = pickInfo.getNormal(true); // true = dans l'espace monde
            if (normal) {
                console.log("🧭 Normale obtenue via pickInfo:", normal);
                return normal.normalize();
            }
        }
        
        // Méthode alternative : calculer à partir des faces les plus proches
        const vertices = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const indices = mesh.getIndices();
        const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
        
        if (!vertices || !indices || !normals) {
            console.warn("⚠️ Données de mesh incomplètes, utilisation normale par défaut");
            return getDefaultNormalForMesh(mesh);
        }
        
        // Convertir le point monde en coordonnées locales du mesh
        const worldMatrix = mesh.getWorldMatrix();
        const invertedMatrix = worldMatrix.clone().invert();
        const localPoint = BABYLON.Vector3.TransformCoordinates(worldPoint, invertedMatrix);
        
        // Trouver le triangle le plus proche
        let closestDistance = Infinity;
        let closestNormal = null;
        
        for (let i = 0; i < indices.length; i += 3) {
            const i1 = indices[i] * 3;
            const i2 = indices[i + 1] * 3;
            const i3 = indices[i + 2] * 3;
            
            // Positions des vertices du triangle
            const v1 = new BABYLON.Vector3(vertices[i1], vertices[i1 + 1], vertices[i1 + 2]);
            const v2 = new BABYLON.Vector3(vertices[i2], vertices[i2 + 1], vertices[i2 + 2]);
            const v3 = new BABYLON.Vector3(vertices[i3], vertices[i3 + 1], vertices[i3 + 2]);
            
            // Centre du triangle
            const center = v1.add(v2).add(v3).scale(1/3);
            const distance = BABYLON.Vector3.Distance(localPoint, center);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                
                // Normale du triangle (moyenne des normales des vertices)
                const n1 = new BABYLON.Vector3(normals[i1], normals[i1 + 1], normals[i1 + 2]);
                const n2 = new BABYLON.Vector3(normals[i2], normals[i2 + 1], normals[i2 + 2]);
                const n3 = new BABYLON.Vector3(normals[i3], normals[i3 + 1], normals[i3 + 2]);
                
                closestNormal = n1.add(n2).add(n3).scale(1/3).normalize();
            }
        }
        
        if (closestNormal) {
            // Transformer la normale en coordonnées monde
            const worldNormal = BABYLON.Vector3.TransformNormal(closestNormal, worldMatrix);
            console.log("🧭 Normale calculée géométriquement:", worldNormal);
            return worldNormal.normalize();
        }
        
    } catch (error) {
        console.error("❌ Erreur calcul normale:", error);
    }
    
    // Fallback : normale par défaut basée sur l'orientation du mesh
    return getDefaultNormalForMesh(mesh);
}

// 2. FONCTION POUR OBTENIR UNE NORMALE PAR DÉFAUT BASÉE SUR L'ORIENTATION
function getDefaultNormalForMesh(mesh) {
    const rotationMatrix = BABYLON.Matrix.RotationYawPitchRoll(
        mesh.rotation.y, 
        mesh.rotation.x, 
        mesh.rotation.z
    );
    const baseNormal = new BABYLON.Vector3(0, 0, 1);
    return BABYLON.Vector3.TransformNormal(baseNormal, rotationMatrix).normalize();
}

// 3. FONCTION POUR CALCULER L'OFFSET BASÉ SUR LA COURBURE LOCALE

function calculateAdaptiveOffset(holdMesh, targetMesh, surfacePoint, surfaceNormal) {
    // Taille de base des objets
    const holdBounds = holdMesh.getBoundingInfo().boundingBox;
    const targetBounds = targetMesh.getBoundingInfo().boundingBox;
    
    const holdSize = holdBounds.maximum.subtract(holdBounds.minimum);
    const targetSize = targetBounds.maximum.subtract(targetBounds.minimum);
    
    // UTILISATION DU SURFACE POINT : calculer la distance du surfacePoint au centre du targetMesh
    const targetCenter = targetMesh.position;
    const distanceFromCenter = BABYLON.Vector3.Distance(surfacePoint, targetCenter);
    const targetRadius = Math.max(targetSize.x, targetSize.y, targetSize.z) / 2;
    
    console.log("🎯 Analyse du point de surface:", {
        surfacePoint: surfacePoint,
        targetCenter: targetCenter,
        distanceFromCenter: distanceFromCenter,
        targetRadius: targetRadius
    });
    
    // CALCUL BASÉ SUR LA POSITION SUR LA SURFACE
    // Si le point est près du centre, c'est une surface plate
    // Si le point est près du bord, c'est une surface courbée
    const normalizedDistance = distanceFromCenter / targetRadius;
    const curvatureFactor = Math.min(normalizedDistance, 1.0);
    
    // Rayon du holdMesh projeté dans la direction de la normale
    const holdRadius = Math.max(holdSize.x, holdSize.y, holdSize.z) / 2;
    
    // Base offset : rayon du hold + marge de sécurité
    let baseOffset = holdRadius * 0.5; // Réduit pour coller plus près
    
    // Adaptation selon la courbure ET la position du surfacePoint
    const verticalityFactor = Math.abs(surfaceNormal.y);
    const curvatureOffset = holdRadius * 0.2 * curvatureFactor * (1 - verticalityFactor);
    
    // BONUS : ajustement selon la proximité du bord
    const edgeProximity = Math.max(0, normalizedDistance - 0.7); // Au-delà de 70% du rayon
    const edgeOffset = holdRadius * 0.1 * edgeProximity;
    
    const finalOffset = baseOffset + curvatureOffset + edgeOffset;
    
    console.log("📏 Offset adaptatif avec surfacePoint:", {
        baseOffset,
        curvatureOffset,
        edgeOffset,
        finalOffset,
        verticality: verticalityFactor,
        curvatureFactor: curvatureFactor,
        edgeProximity: edgeProximity
    });
    
    return Math.max(finalOffset, 0.01); // Minimum plus petit pour coller davantage
}

// 4. FONCTION POUR CONTRAINDRE LE MOUVEMENT SUR LA SURFACE COMPLEXE
function constrainToComplexSurface(pickPoint, targetMesh, rayResult = null) {
    // Utiliser le raycasting pour "coller" à la surface
    const rayOrigin = pickPoint.add(new BABYLON.Vector3(0, 0, 5)); // Point au-dessus
    const rayDirection = new BABYLON.Vector3(0, 0, -1); // Vers le bas
    
    const ray = new BABYLON.Ray(rayOrigin, rayDirection);
    const hit = scene.pickWithRay(ray, (mesh) => mesh === targetMesh);
    
    if (hit && hit.hit) {
        console.log("🎯 Surface contrainte par raycast:", hit.pickedPoint);
        return {
            constrainedPoint: hit.pickedPoint,
            surfaceNormal: hit.getNormal ? hit.getNormal(true) : null,
            hit: hit
        };
    }
    
    // Fallback : projection approximative sur la surface
    const bounds = targetMesh.getBoundingInfo().boundingBox;
    const center = targetMesh.position;
    const size = bounds.maximum.subtract(bounds.minimum);
    
    // Contraindre dans les limites approximatives
    let constrainedPoint = pickPoint.clone();
    const relativePoint = constrainedPoint.subtract(center);
    
    // Appliquer les contraintes selon la forme
    const margin = 0.02;
    relativePoint.x = Math.max(-(size.x/2 - margin), Math.min(size.x/2 - margin, relativePoint.x));
    relativePoint.y = Math.max(-(size.y/2 - margin), Math.min(size.y/2 - margin, relativePoint.y));
    
    constrainedPoint = center.add(relativePoint);
    
    return {
        constrainedPoint: constrainedPoint,
        surfaceNormal: getDefaultNormalForMesh(targetMesh),
        hit: null
    };
}
/*function constrainToComplexSurfaceFixed(pickPoint, targetMesh, rayResult = null) {
    // D'abord, vérifier si le point de pick est déjà sur la surface
    if (rayResult && rayResult.hit && rayResult.pickedMesh === targetMesh) {
        console.log("🎯 Point de pick déjà sur la surface, pas de modification");
        return {
            constrainedPoint: pickPoint, // Garder le point original
            surfaceNormal: rayResult.getNormal ? rayResult.getNormal(true) : null,
            hit: rayResult
        };
    }
    
    // Seulement faire un raycast si nécessaire
    const rayOrigin = pickPoint.add(new BABYLON.Vector3(0, 1, 0)); // Point au-dessus
    const rayDirection = new BABYLON.Vector3(0, -1, 0); // Vers le bas
    
    const ray = new BABYLON.Ray(rayOrigin, rayDirection);
    const hit = scene.pickWithRay(ray, (mesh) => mesh === targetMesh);
    
    if (hit && hit.hit) {
        console.log("🎯 Surface contrainte par raycast:", hit.pickedPoint);
        return {
            constrainedPoint: hit.pickedPoint,
            surfaceNormal: hit.getNormal ? hit.getNormal(true) : null,
            hit: hit
        };
    }
    
    // Fallback : garder le point original
    console.log("⚠️ Pas de contrainte nécessaire, point original conservé");
    return {
        constrainedPoint: pickPoint, // Point original
        surfaceNormal: calculateSurfaceNormalAtPoint(targetMesh, pickPoint, rayResult),
        hit: rayResult
    };
}
*/
/*
function analyzeSurfaceGeometry(targetMesh, surfacePoint, pickInfo) {
    console.log("🔍 Analyse géométrique du point de contact...");
    
    // Obtenir la normale exacte au point de contact
    let surfaceNormal;
    if (pickInfo && pickInfo.getNormal) {
        surfaceNormal = pickInfo.getNormal(true).normalize();
    } else {
        surfaceNormal = calculateSurfaceNormalAtPoint(targetMesh, surfacePoint, pickInfo);
    }
    
    // Calculer l'inclinaison de la surface
    const upVector = new BABYLON.Vector3(0, 1, 0);
    const inclinationAngle = Math.acos(BABYLON.Vector3.Dot(surfaceNormal, upVector));
    const inclinationDegrees = inclinationAngle * 180 / Math.PI;
    
    // Déterminer le type de surface selon l'inclinaison
    let surfaceType;
    if (inclinationDegrees < 15) {
        surfaceType = "HORIZONTALE";
    } else if (inclinationDegrees > 75) {
        surfaceType = "VERTICALE";
    } else {
        surfaceType = "INCLINÉE";
    }
    
    // Analyser la courbure locale (approximation)
    const curvatureAnalysis = analyzeSurfaceCurvature(targetMesh, surfacePoint, surfaceNormal);
    
    console.log("📐 Analyse de surface:", {
        surfacePoint: surfacePoint,
        surfaceNormal: surfaceNormal,
        inclinationAngle: inclinationDegrees.toFixed(1) + "°",
        surfaceType: surfaceType,
        curvature: curvatureAnalysis
    });
    
    return {
        point: surfacePoint,
        normal: surfaceNormal,
        inclination: inclinationDegrees,
        type: surfaceType,
        curvature: curvatureAnalysis
    };
}

// 2. ANALYSER LA COURBURE LOCALE DE LA SURFACE
function analyzeSurfaceCurvature(mesh, point, normal) {
    // Échantillonner des points autour du point de contact
    const sampleDistance = 0.01; // 1cm autour du point
    const sampleDirections = [
        new BABYLON.Vector3(1, 0, 0),
        new BABYLON.Vector3(-1, 0, 0),
        new BABYLON.Vector3(0, 1, 0),
        new BABYLON.Vector3(0, -1, 0),
        new BABYLON.Vector3(0, 0, 1),
        new BABYLON.Vector3(0, 0, -1)
    ];
    
    let curvatureSum = 0;
    let validSamples = 0;
    
    for (const direction of sampleDirections) {
        const samplePoint = point.add(direction.scale(sampleDistance));
        
        // Faire un raycast vers ce point d'échantillonnage
        const rayOrigin = samplePoint.add(normal.scale(0.1));
        const ray = new BABYLON.Ray(rayOrigin, normal.scale(-1));
        const hit = scene.pickWithRay(ray, (m) => m === mesh);
        
        if (hit && hit.hit) {
            const sampleNormal = hit.getNormal ? hit.getNormal(true) : normal;
            const angleDifference = Math.acos(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(normal, sampleNormal))));
            curvatureSum += angleDifference;
            validSamples++;
        }
    }
    
    const averageCurvature = validSamples > 0 ? curvatureSum / validSamples : 0;
    const curvatureType = averageCurvature < 0.1 ? "PLATE" : averageCurvature < 0.3 ? "COURBÉE" : "TRÈS_COURBÉE";
    
    return {
        value: averageCurvature,
        type: curvatureType,
        samples: validSamples
    };
}

// 3. DÉTERMINER LE POINT CENTRAL DE CONTACT DU MESH À DÉPLACER
function findMeshContactCenter(movingMesh, surfacePoint, surfaceNormal) {
    console.log("🎯 Calcul du point central de contact...");
    
    // Obtenir la bounding box du mesh dans l'espace monde
    const worldMatrix = movingMesh.getWorldMatrix();
    const boundingBox = movingMesh.getBoundingInfo().boundingBox;
    
    // Transformer les coins de la bounding box en espace monde
    const corners = [
        BABYLON.Vector3.TransformCoordinates(boundingBox.minimum, worldMatrix),
        BABYLON.Vector3.TransformCoordinates(boundingBox.maximum, worldMatrix),
        BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(boundingBox.minimum.x, boundingBox.minimum.y, boundingBox.maximum.z), worldMatrix),
        BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(boundingBox.minimum.x, boundingBox.maximum.y, boundingBox.minimum.z), worldMatrix),
        BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(boundingBox.maximum.x, boundingBox.minimum.y, boundingBox.minimum.z), worldMatrix),
        BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(boundingBox.minimum.x, boundingBox.maximum.y, boundingBox.maximum.z), worldMatrix),
        BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(boundingBox.maximum.x, boundingBox.minimum.y, boundingBox.maximum.z), worldMatrix),
        BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(boundingBox.maximum.x, boundingBox.maximum.y, boundingBox.minimum.z), worldMatrix)
    ];
    
    // Projeter tous les coins sur le plan défini par la normale de surface
    // Le plan passe par surfacePoint avec la normale surfaceNormal
    let minProjection = Infinity;
    let contactPoints = [];
    
    for (const corner of corners) {
        // Distance signée du coin au plan de surface
        const vectorToCorner = corner.subtract(surfacePoint);
        const distanceToPlane = BABYLON.Vector3.Dot(vectorToCorner, surfaceNormal);
        
        if (distanceToPlane < minProjection + 0.001) { // Tolérance de 1mm
            if (distanceToPlane < minProjection - 0.001) {
                contactPoints = []; // Nouveau minimum trouvé
                minProjection = distanceToPlane;
            }
            contactPoints.push(corner);
        }
    }
    
    // Calculer le centre des points de contact
    let contactCenter = new BABYLON.Vector3(0, 0, 0);
    for (const point of contactPoints) {
        contactCenter = contactCenter.add(point);
    }
    contactCenter = contactCenter.scale(1 / contactPoints.length);
    
    console.log("📍 Analyse du contact:", {
        totalCorners: corners.length,
        contactPoints: contactPoints.length,
        contactCenter: contactCenter,
        minProjection: minProjection
    });
    
    return {
        contactCenter: contactCenter,
        contactPoints: contactPoints,
        distanceToSurface: Math.abs(minProjection)
    };
}

// 4. CALCULER LA POSITION PRÉCISE DE COLLAGE
function calculatePreciseAttachmentPosition(movingMesh, targetMesh, surfacePoint, pickInfo) {
    console.log("🔬 Calcul précis de la position d'attachement...");
    
    // 1. Analyser la géométrie de la surface
    const surfaceAnalysis = analyzeSurfaceGeometry(targetMesh, surfacePoint, pickInfo);
    
    // 2. Trouver le point central de contact du mesh mobile
    const contactAnalysis = findMeshContactCenter(movingMesh, surfacePoint, surfaceAnalysis.normal);
    
    // 3. Calculer l'offset nécessaire pour que les surfaces se touchent
    const necessaryOffset = contactAnalysis.distanceToSurface;
    
    // 4. Ajuster selon le type de surface et la courbure
    let finalOffset = necessaryOffset;
    
    // Ajustement selon l'inclinaison
    if (surfaceAnalysis.type === "VERTICALE") {
        finalOffset *= 1.1; // 10% de plus pour les surfaces verticales
    } else if (surfaceAnalysis.type === "INCLINÉE") {
        finalOffset *= 1.05; // 5% de plus pour les surfaces inclinées
    }
    
    // Ajustement selon la courbure
    if (surfaceAnalysis.curvature.type === "TRÈS_COURBÉE") {
        finalOffset *= 1.2; // 20% de plus pour les surfaces très courbées
    } else if (surfaceAnalysis.curvature.type === "COURBÉE") {
        finalOffset *= 1.1; // 10% de plus pour les surfaces courbées
    }
    
    // 5. Ajouter une marge de sécurité minimale
    const safetyMargin = 0.002; // 2mm
    finalOffset += safetyMargin;
    
    // 6. Calculer la position finale
    const finalPosition = surfacePoint.add(surfaceAnalysis.normal.scale(finalOffset));
    
    console.log("✅ Position précise calculée:", {
        surfaceType: surfaceAnalysis.type,
        curvatureType: surfaceAnalysis.curvature.type,
        necessaryOffset: necessaryOffset,
        finalOffset: finalOffset,
        finalPosition: finalPosition
    });
    
    return {
        position: finalPosition,
        rotation: calculateOptimalRotation(surfaceAnalysis.normal, surfaceAnalysis.type),
        analysis: {
            surface: surfaceAnalysis,
            contact: contactAnalysis,
            offset: finalOffset
        }
    };
}

// 5. CALCULER LA ROTATION OPTIMALE
function calculateOptimalRotation(surfaceNormal, surfaceType) {
    // Créer une rotation qui aligne l'objet avec la surface
    const forward = surfaceNormal.clone();
    let up = new BABYLON.Vector3(0, 1, 0);
    
    // Si la normale est trop proche de la verticale, changer l'up vector
    if (Math.abs(BABYLON.Vector3.Dot(forward, up)) > 0.9) {
        up = new BABYLON.Vector3(1, 0, 0);
    }
    
    const right = BABYLON.Vector3.Cross(up, forward).normalize();
    const correctedUp = BABYLON.Vector3.Cross(forward, right).normalize();
    
    // Créer la matrice de rotation
    const rotationMatrix = new BABYLON.Matrix();
    BABYLON.Matrix.FromValuesToRef(
        right.x, right.y, right.z, 0,
        correctedUp.x, correctedUp.y, correctedUp.z, 0,
        forward.x, forward.y, forward.z, 0,
        0, 0, 0, 1,
        rotationMatrix
    );
    
    const quaternion = new BABYLON.Quaternion();
    quaternion.fromRotationMatrix(rotationMatrix);
    return quaternion.toEulerAngles();
}

// 6. FONCTION PRINCIPALE À UTILISER
function onPointerMove(evt) {
    if (isDragging && selectedHold) {
        let pickResult = scene.pick(scene.pointerX, scene.pointerY);
        
        if (pickResult.hit && pickResult.pickedMesh) {
            const targetMesh = pickResult.pickedMesh;
            
            // Vérifier que c'est une surface valide et différente
            if (targetMesh !== selectedHold && isValidAttachmentSurface(targetMesh)) {
                // ANALYSE GÉOMÉTRIQUE COMPLÈTE
                const attachmentResult = calculatePreciseAttachmentPosition(
                    selectedHold,
                    targetMesh,
                    pickResult.pickedPoint,
                    pickResult
                );
                
                // Appliquer la position et rotation calculées
                selectedHold.position.copyFrom(attachmentResult.position);
                selectedHold.rotation.copyFrom(attachmentResult.rotation);
                
                // Mettre à jour les données
                const holdData = holds.find(h => h.mesh === selectedHold);
                if (holdData) {
                    holdData.position = selectedHold.position.asArray();
                }
                
                console.log("🎯 Attachement géométrique réussi:", attachmentResult.analysis);
            }
        }
    }
}

// 7. FONCTION HELPER POUR VALIDER LES SURFACES
function isValidAttachmentSurface(mesh) {
    return mesh.isWall || 
           mesh.isCrimp || 
           (mesh.name && (mesh.name.includes('wall') || mesh.name.includes('crimp'))) ||
           holds.find(h => h.mesh === mesh);
}
*/
// 5. FONCTION onPointerMove COMPLÈTEMENT RÉÉCRITE POUR SURFACES COMPLEXES
/*
function onPointerMoveComplexSurface(evt) {
    if (isDragging && selectedHold) {
        let pickResult = scene.pick(scene.pointerX, scene.pointerY);
        
        if (pickResult.hit && pickResult.pickedMesh) {
            let targetSurface = null;
            let isWall = false;
            let isHold = false;

            // Identifier le type de surface
            if (pickResult.pickedMesh.isWall) {
                targetSurface = pickResult.pickedMesh;
                isWall = true;
            } else {
                const holdData = holds.find(h => h.mesh === pickResult.pickedMesh);
                if (holdData && holdData.mesh !== selectedHold) {
                    targetSurface = pickResult.pickedMesh;
                    isHold = true;
                }
            }

            if (targetSurface) {
                let finalPosition;
                let rotation;

                if (isWall) {
                    // === LOGIQUE STANDARD POUR MURS ===
                    const rotationMatrix = BABYLON.Matrix.RotationYawPitchRoll(
                        targetSurface.rotation.y, 
                        targetSurface.rotation.x, 
                        targetSurface.rotation.z
                    );
                    
                    const baseNormal = new BABYLON.Vector3(0, 0, 1);
                    const transformedNormal = BABYLON.Vector3.TransformNormal(baseNormal, rotationMatrix);
                    
                    const offset = 0.2;
                    finalPosition = pickResult.pickedPoint.add(transformedNormal.scale(offset));
                    rotation = targetSurface.rotation.clone();
                    
                } else if (isHold) {
                    // === LOGIQUE AVANCÉE POUR SURFACES COMPLEXES ===
                    console.log("🔄 Navigation sur surface complexe:", targetSurface.name);
                    
                    // 1. Contraindre le point sur la surface réelle
                    const surfaceResult = constrainToComplexSurface(pickResult.pickedPoint, targetSurface, pickResult);
                    const surfacePoint = surfaceResult.constrainedPoint;
                    
                    // 2. Calculer la normale réelle de la surface à ce point
                    const surfaceNormal = calculateSurfaceNormalAtPoint(
                        targetSurface, 
                        surfacePoint, 
                        surfaceResult.hit || pickResult
                    );
                    
                    // 3. Calculer l'offset adaptatif selon la courbure
                    const offset = calculateAdaptiveOffset(
                        selectedHold, 
                        targetSurface, 
                        surfacePoint, 
                        surfaceNormal
                    );
                    
                    // 4. Position finale = point surface + normale * offset
                    finalPosition = surfacePoint.add(surfaceNormal.scale(0.25));
                    
                    // 5. Orientation : aligner avec la surface ou garder l'orientation cible
                    if (surfaceNormal.y > 0.7) {
                        // Surface plutôt horizontale : garder orientation de la prise cible
                        rotation = targetSurface.rotation.clone();
                    } else {
                        // Surface inclinée : créer une rotation basée sur la normale
                        const forward = surfaceNormal.clone();
                        const up = new BABYLON.Vector3(0, 1, 0);
                        const right = BABYLON.Vector3.Cross(up, forward).normalize();
                        const correctedUp = BABYLON.Vector3.Cross(forward, right).normalize();
                        
                        // Créer une matrice de rotation à partir de ces vecteurs
const rotationMatrix = new BABYLON.Matrix();
BABYLON.Matrix.FromValuesToRef(
    right.x, right.y, right.z, 0,
    correctedUp.x, correctedUp.y, correctedUp.z, 0,
    forward.x, forward.y, forward.z, 0,
    0, 0, 0, 1,
    rotationMatrix
);

// Convertir en quaternion puis en angles d'Euler
const quaternion = new BABYLON.Quaternion();
quaternion.fromRotationMatrix(rotationMatrix);
rotation = quaternion.toEulerAngles();
                    }
                    
                    console.log("🎯 Position finale sur surface complexe:", {
                        surfacePoint: surfacePoint,
                        surfaceNormal: surfaceNormal,
                        offset: offset,
                        finalPosition: finalPosition,
                        rotation: rotation
                    });
                }

                // Appliquer la transformation avec validation
                if (finalPosition && !isNaN(finalPosition.x) && !isNaN(finalPosition.y) && !isNaN(finalPosition.z)) {
                    selectedHold.position.copyFrom(finalPosition);
                    
                    if (rotation && !isNaN(rotation.x) && !isNaN(rotation.y) && !isNaN(rotation.z)) {
                        selectedHold.rotation.copyFrom(rotation);
                    }
                    
                    // Mettre à jour les données
                    const holdData = holds.find(h => h.mesh === selectedHold);
                    if (holdData) {
                        holdData.position = selectedHold.position.asArray();
                    }
                } else {
                    console.warn("⚠️ Position invalide calculée, ignorée");
                }
            }
        }
    }
}
*/
// ===== SYSTÈME DE DRAG & DROP AMÉLIORÉ POUR COLLAGE DE PRISES =====

// Variables globales

// ===== SYSTÈME DE DRAG & DROP AMÉLIORÉ POUR COLLAGE DE PRISES =====

// Variables globales
// ===== VERSION SIMPLIFIÉE ET CORRIGÉE =====

let dragStartInfo = null;
let targetSurfaceCache = new Map();

// ===== FONCTIONS PRINCIPALES (INCHANGÉES) =====

function onPointerDown(evt, pickInfo) {
    if (pickInfo && pickInfo.hit && pickInfo.pickedMesh) {
        const holdData = holds.find(h => h.mesh === pickInfo.pickedMesh);
        if (holdData && holdData.mesh !== selectedHold) {
            selectedHold = holdData.mesh;
            isDragging = true;
            
            dragStartInfo = {
                startPosition: selectedHold.position.clone(),
                startRotation: selectedHold.rotation.clone(),
                originalSurface: null
            };
            
            highlightHold(selectedHold);
            console.log("🖱️ Début du drag:", selectedHold.name);
        }
    }
}

function onPointerMove(evt) {
    if (!isDragging || !selectedHold) return;
    
    const pickResult = scene.pick(scene.pointerX, scene.pointerY);
    
    if (pickResult.hit && pickResult.pickedMesh) {
        const targetMesh = pickResult.pickedMesh;
        let surfaceInfo = null;
        
        if (targetMesh.isWall) {
            surfaceInfo = handleWallSurface(pickResult, targetMesh);
        } else {
            const targetHoldData = holds.find(h => h.mesh === targetMesh);
            if (targetHoldData && targetMesh !== selectedHold) {
                surfaceInfo = handleHoldSurfaceSimplified(pickResult, targetMesh);
            }
        }
        
        if (surfaceInfo && surfaceInfo.position && surfaceInfo.rotation) {
            applyTransformationSimplified(selectedHold, surfaceInfo);
        }
    }
}

function onPointerUp(evt) {
    if (isDragging && selectedHold) {
        console.log("🖱️ Fin du drag:", selectedHold.name);
        
        const isValidPosition = validateFinalPosition(selectedHold);
        
        if (!isValidPosition) {
            console.warn("⚠️ Position invalide, restauration");
            selectedHold.position.copyFrom(dragStartInfo.startPosition);
            selectedHold.rotation.copyFrom(dragStartInfo.startRotation);
        } else {
            selectedHold.computeWorldMatrix(true);
            selectedHold.refreshBoundingInfo();
        }
        
        setTimeout(() => {
            clearCollisionIndicators();
        }, 3000);
        
        isDragging = false;
        unhighlightHold(selectedHold);
        selectedHold = null;
        dragStartInfo = null;
        targetSurfaceCache.clear();
    }
}

function highlightHold(holdMesh) {
    if (holdMesh.material) {
        holdMesh.material.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0);
        
        const halo = BABYLON.MeshBuilder.CreateSphere("selectHalo", {diameter: 0.2}, scene);
        halo.position.copyFrom(holdMesh.position);
        halo.material = createIndicatorMaterial("selection", new BABYLON.Color3(1, 1, 0));
        halo.material.alpha = 0.2;
        
        holdMesh._selectionHalo = halo;
    }
}

function unhighlightHold(holdMesh) {
    if (holdMesh.material) {
        holdMesh.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
        
        if (holdMesh._selectionHalo) {
            holdMesh._selectionHalo.dispose();
            holdMesh._selectionHalo = null;
        }
    }
}

// ===== GESTION SIMPLIFIÉE DES SURFACES =====

function handleWallSurface(pickResult, wallMesh) {
    console.log("🧱 Surface mur détectée:", wallMesh.name);
    
    const rotationMatrix = BABYLON.Matrix.RotationYawPitchRoll(
        wallMesh.rotation.y, 
        wallMesh.rotation.x, 
        wallMesh.rotation.z
    );
    
    const baseNormal = new BABYLON.Vector3(0, 0, 1);
    const transformedNormal = BABYLON.Vector3.TransformNormal(baseNormal, rotationMatrix);
    const offset = 0.19; // Distance réduite pour les murs (10cm au lieu de 15cm)
    
    const finalPosition = pickResult.pickedPoint.add(transformedNormal.scale(offset));
    
    return {
        position: finalPosition,
        rotation: wallMesh.rotation.clone(),
        surfaceType: 'wall',
        surfaceNormal: transformedNormal
    };
}

function handleHoldSurfaceSimplified(pickResult, holdMesh) {
    console.log("🎯 Surface prise détectée:", holdMesh.name);
    
    // 1. Point de contact sur la surface
    const surfacePoint = pickResult.pickedPoint;
    
    // 2. Calculer la normale simple
    const surfaceNormal = calculateSimpleNormal(holdMesh, surfacePoint, pickResult);
    
    // 3. Distance fixe simple selon la taille
    const offset = calculateSimpleOffset(selectedHold, holdMesh);
    
    // 4. Position finale
    const finalPosition = surfacePoint.add(surfaceNormal.scale(offset));
    
    // 5. Rotation corrigée
    const rotation = calculateFixedRotation(surfaceNormal, holdMesh);
    
    console.log("🔄 Surface prise traitée (simplifié):", {
        surfacePoint: surfacePoint,
        surfaceNormal: surfaceNormal,
        offset: offset.toFixed(3),
        finalPosition: finalPosition,
        rotation: rotation
    });
    
    return {
        position: finalPosition,
        rotation: rotation,
        surfaceType: 'hold',
        surfaceNormal: surfaceNormal
    };
}

// ===== CALCULS SIMPLIFIÉS =====

function calculateSimpleNormal(holdMesh, worldPoint, pickInfo) {
    // Priorité au pickInfo si disponible
    if (pickInfo && pickInfo.getNormal) {
        const normal = pickInfo.getNormal(true, true);
        if (normal && normal.length() > 0.001) {
            return normal.normalize();
        }
    }
    
    // Fallback simple : du centre vers le point
    const center = holdMesh.getBoundingInfo().boundingBox.center;
    const worldMatrix = holdMesh.getWorldMatrix();
    const worldCenter = BABYLON.Vector3.TransformCoordinates(center, worldMatrix);
    
    return worldPoint.subtract(worldCenter).normalize();
}

function calculateSimpleOffset(movingHold, targetHold) {
    // Distance basée uniquement sur les tailles, très simple
    const movingSize = movingHold.getBoundingInfo().boundingBox.extendSize.length();
    const targetSize = targetHold.getBoundingInfo().boundingBox.extendSize.length();
    
    // Distance fixe RÉDUITE basée sur la taille moyenne
    const averageSize = (movingSize + targetSize) * 0.5;
    const offset = Math.min(averageSize * 0.19, 0.5); // RÉDUIT : Max 3cm au lieu de 5cm
    
    console.log("📏 Offset simple (réduit):", {
        movingSize: movingSize.toFixed(3),
        targetSize: targetSize.toFixed(3),
        offset: offset.toFixed(3)
    });
    
    return offset;
}

function calculateFixedRotation(surfaceNormal, targetMesh) {
    const normal = surfaceNormal.normalize();
    
    // CORRECTION PRINCIPALE : Direction vers la surface (pas opposée)
    // Pour que la face de collage soit orientée vers la surface cible
    const forward = normal.clone(); // CHANGÉ : on prend la normale directement, pas son opposé
    
    // Utiliser l'up du monde comme référence principale
    let up = new BABYLON.Vector3(0, 1, 0);
    
    // Si la normale est trop verticale, changer de référence
    if (Math.abs(normal.y) > 0.8) {
        up = new BABYLON.Vector3(0, 0, 1);
    }
    
    // Calcul des axes
    const right = BABYLON.Vector3.Cross(up, forward).normalize();
    
    // Sécurité : si right est invalide, utiliser l'orientation du mesh cible avec correction
    if (right.length() < 0.001) {
        console.log("⚠️ Utilisation orientation mesh cible avec correction");
        const targetRotation = targetMesh.rotation.clone();
        // Ajouter 180° sur Y pour faire face à la surface
        targetRotation.y += Math.PI;
        return targetRotation;
    }
    
    const correctedUp = BABYLON.Vector3.Cross(forward, right).normalize();
    
    // Créer la matrice de rotation
    const rotationMatrix = new BABYLON.Matrix();
    BABYLON.Matrix.FromValuesToRef(
        right.x, right.y, right.z, 0,
        correctedUp.x, correctedUp.y, correctedUp.z, 0,
        forward.x, forward.y, forward.z, 0,
        0, 0, 0, 1,
        rotationMatrix
    );
    
    const quaternion = new BABYLON.Quaternion();
    quaternion.fromRotationMatrix(rotationMatrix);
    
    const eulerAngles = quaternion.toEulerAngles();
    
    // NOUVELLE LOGIQUE : Vérifier que la prise "regarde" bien vers la surface
    const testForward = BABYLON.Vector3.TransformNormal(
        new BABYLON.Vector3(0, 0, 1), 
        BABYLON.Matrix.RotationYawPitchRoll(eulerAngles.y, eulerAngles.x, eulerAngles.z)
    );
    
    // L'alignement doit être POSITIF (même direction que la normale)
    const alignment = BABYLON.Vector3.Dot(testForward, normal);
    
    if (alignment < 0) {
        console.log("🔄 Correction orientation pour faire face à la surface");
        // Rotation 180° sur Y pour que la prise regarde vers la surface
        eulerAngles.y += Math.PI;
    }
    
    console.log("🧭 Rotation calculée (corrigée):", {
        normal: normal,
        forward: forward,
        eulerAngles: eulerAngles,
        alignment: alignment.toFixed(3),
        corrected: alignment < 0
    });
    
    return eulerAngles;
}

// ===== APPLICATION SIMPLIFIÉE =====

function applyTransformationSimplified(holdMesh, surfaceInfo) {
    if (!surfaceInfo.position || !surfaceInfo.rotation) return;
    
    if (isValidVector3(surfaceInfo.position) && isValidVector3(surfaceInfo.rotation)) {
        // Position
        holdMesh.position.copyFrom(surfaceInfo.position);
        
        // Rotation directe
        holdMesh.rotation.copyFrom(surfaceInfo.rotation);
        
        // Mise à jour forcée
        holdMesh.computeWorldMatrix(true);
        holdMesh.refreshBoundingInfo();
        
        // Indicateur visuel simple
        showSimpleIndicator(holdMesh, surfaceInfo);
        
        // Mettre à jour les données
        updateHoldData(holdMesh);
        
        console.log("✅ Transformation simplifiée appliquée:", {
            position: holdMesh.position,
            rotation: holdMesh.rotation,
            surfaceType: surfaceInfo.surfaceType
        });
    }
}

// ===== INDICATEURS VISUELS SIMPLIFIÉS =====

let collisionIndicators = [];

function showSimpleIndicator(holdMesh, surfaceInfo) {
    clearCollisionIndicators();
    
    if (surfaceInfo.surfaceType === 'hold') {
        // Point de contact simple
        const contactSphere = BABYLON.MeshBuilder.CreateSphere("contactIndicator", {diameter: 0.03}, scene);
        contactSphere.position.copyFrom(holdMesh.position);
        contactSphere.material = createIndicatorMaterial("contact", new BABYLON.Color3(0, 1, 0));
        collisionIndicators.push(contactSphere);
        
        console.log("🎯 Indicateur simple activé");
    }
}

function createIndicatorMaterial(type, color) {
    const material = new BABYLON.StandardMaterial(`indicator_${type}`, scene);
    material.diffuseColor = color;
    material.emissiveColor = color.scale(0.3);
    material.disableLighting = true;
    return material;
}

function clearCollisionIndicators() {
    collisionIndicators.forEach(indicator => {
        if (indicator && !indicator.isDisposed()) {
            indicator.dispose();
        }
    });
    collisionIndicators = [];
}

// ===== FONCTIONS UTILITAIRES (INCHANGÉES) =====

function isValidVector3(vector) {
    return vector && 
           !isNaN(vector.x) && !isNaN(vector.y) && !isNaN(vector.z) &&
           Math.abs(vector.x) < 1000 && Math.abs(vector.y) < 1000 && Math.abs(vector.z) < 1000;
}

function validateFinalPosition(holdMesh) {
    const position = holdMesh.position;
    const rotation = holdMesh.rotation;
    
    return isValidVector3(position) && isValidVector3(rotation);
}

function updateHoldData(holdMesh) {
    const holdData = holds.find(h => h.mesh === holdMesh);
    if (holdData) {
        holdData.position = holdMesh.position.asArray();
        holdData.rotation = holdMesh.rotation.asArray();
    }
}

// ===== EXPORT DES FONCTIONS =====

window.holdDragSystem = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    clearAllIndicators: clearCollisionIndicators,
    // Fonctions de test simplifiées
    testSimpleRotation: (holdMesh, targetMesh) => {
        if (!targetMesh) return;
        
        const center = targetMesh.getBoundingInfo().boundingBox.center;
        const worldMatrix = targetMesh.getWorldMatrix();
        const worldCenter = BABYLON.Vector3.TransformCoordinates(center, worldMatrix);
        
        const direction = holdMesh.position.subtract(worldCenter).normalize();
        const rotation = calculateFixedRotation(direction, targetMesh);
        
        holdMesh.rotation.copyFrom(rotation);
        holdMesh.computeWorldMatrix(true);
        
        console.log("🧪 Test rotation simple appliqué:", rotation);
    },
    getDebugInfo: () => {
        return {
            isDragging,
            selectedHold: selectedHold?.name,
            indicatorsCount: collisionIndicators.length,
            dragStartInfo: dragStartInfo
        };
    }
};



/*async function addHoldAtPosition(position, wall) {
    const color = document.getElementById('shapeColor').value;
    const holdMaterial = new BABYLON.StandardMaterial("holdMaterial", scene);
    holdMaterial.diffuseColor = BABYLON.Color3.FromHexString(color);

    try {
        // UTILISATION DE LA FONCTION CENTRALISÉE ASYNCHRONE
        let hold = await createHoldShape(selectedShape, scene);
        
        // Appliquer le matériau à tous les meshes enfants si c'est un parent
        if (hold.getChildMeshes) {
            hold.getChildMeshes().forEach(childMesh => {
                if (childMesh.material) {
                    childMesh.material = holdMaterial;
                }
            });
        } else {
            hold.material = holdMaterial;
        }
        hold.material = holdMaterial;
        // Appliquer la rotation du mur sur la prise
        hold.rotation = wall.rotation.clone();

        // Positionner la prise par rapport à la position du mur et la rotation
        let relativePosition = position.subtract(wall.position);
        relativePosition = BABYLON.Vector3.TransformCoordinates(relativePosition, BABYLON.Matrix.RotationYawPitchRoll(wall.rotation.y, wall.rotation.x, wall.rotation.z));

        const rotationMatrix = BABYLON.Matrix.RotationYawPitchRoll(wall.rotation.y, wall.rotation.x, wall.rotation.z);
        const normal = new BABYLON.Vector3(0, 0, 1).normalize();

        const transformedNormal = BABYLON.Vector3.TransformNormal(normal, rotationMatrix);
        const offset = 0.2;

        hold.position = position.add(transformedNormal.scale(offset));

        holds.push({
            mesh: hold,
            position: hold.position.asArray(),
            shape: selectedShape,
            color: color,
            attachedWall: wall
        });

        return hold;
    } catch (error) {
        console.error("Error adding hold:", error);
        // Fallback vers une forme basique
        let fallbackHold = BABYLON.MeshBuilder.CreateSphere("fallback", { diameter: 0.4 }, scene);
        fallbackHold.material = holdMaterial;
        fallbackHold.position = position.add(new BABYLON.Vector3(0, 0, 0.2));
        
        holds.push({
            mesh: fallbackHold,
            position: fallbackHold.position.asArray(),
            shape: 'fallback',
            color: color,
            attachedWall: wall
        });
        
        return fallbackHold;
    }
}*/

function highlightHold(hold) {
    document.getElementById('selectedHoldInfo').textContent = hold.toString().split('_')[1].split(',')[0];////////////////////////////////////////////////
    if (selectedHold && selectedHold !== hold) {
        unhighlightHold(selectedHold);
    }
    selectedHold = hold;
    highlightLayer.addMesh(hold, BABYLON.Color3.Yellow());
}

function unhighlightHold(hold) {
    document.getElementById('selectedHoldInfo').textContent = "aucune";///////////////////////////////////////////////
    highlightLayer.removeMesh(hold);
    if (selectedHold === hold) {
        selectedHold = null;
    }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Écouter l'appui sur la touche "Delete"
// SYSTÈME D'UNDO AMÉLIORÉ
const undoStack = [];
const redoStack = [];
const MAX_UNDO_STEPS = 50;

// Fonction pour sauvegarder l'état avant une action
function saveStateForUndo(actionType, data) {
    // Nettoyer le redo stack quand une nouvelle action est faite
    redoStack.length = 0;
    
    const state = {
        type: actionType,
        data: data,
        timestamp: Date.now()
    };
    
    undoStack.push(state);
    
    // Limiter la taille du stack
    if (undoStack.length > MAX_UNDO_STEPS) {
        undoStack.shift();
    }
    
    console.log(`📝 État sauvegardé: ${actionType}`, state);
}

// Fonction d'undo sécurisée
// FONCTIONS D'UNDO CORRIGÉES
function undoAddHold(data) {
    const holdToRemove = holds.find(h => h.mesh.name === data.holdName);
    if (holdToRemove) {
        console.log(`🗑️ Suppression de la prise: ${data.holdName}`);
        
        // MÉTHODE SÉCURISÉE POUR SUPPRIMER LE MESH
        try {
            // 1. D'abord retirer de la highlight layer si présent
            if (highlightLayer) {
                highlightLayer.removeMesh(holdToRemove.mesh);
            }
            
            // 2. Désélectionner si c'est la prise sélectionnée
            if (selectedHold === holdToRemove.mesh) {
                selectedHold = null;
                isDragging = false;
            }
            
            // 3. Retirer du cache si c'est un mesh loadé
            const meshName = holdToRemove.mesh.name;
            if (loadedMeshCache[holdToRemove.shape]) {
                // Ne pas supprimer du cache, juste déréférencer
                console.log(`🔄 Mesh en cache préservé: ${holdToRemove.shape}`);
            }
            
            // 4. Supprimer les matériaux proprement
            if (holdToRemove.mesh.material && holdToRemove.mesh.material.dispose) {
                holdToRemove.mesh.material.dispose();
            }
            
            // 5. Supprimer les enfants si c'est un parent
            if (holdToRemove.mesh.getChildMeshes) {
                holdToRemove.mesh.getChildMeshes().forEach(child => {
                    if (child.material && child.material.dispose) {
                        child.material.dispose();
                    }
                });
            }
            
            // 6. Finalement disposer le mesh
            holdToRemove.mesh.dispose();
            
            // 7. Supprimer du tableau holds
            const index = holds.indexOf(holdToRemove);
            if (index !== -1) {
                holds.splice(index, 1);
            }
            
            console.log(`✅ Prise supprimée avec succès: ${meshName}`);
            console.log(`📊 Prises restantes: ${holds.length}`);
            
        } catch (error) {
            console.error(`❌ Erreur lors de la suppression de la prise ${data.holdName}:`, error);
            
            // En cas d'erreur, au moins retirer du tableau
            const index = holds.indexOf(holdToRemove);
            if (index !== -1) {
                holds.splice(index, 1);
            }
        }
    } else {
        console.warn(`⚠️ Prise non trouvée: ${data.holdName}`);
    }
}

function undoMoveHold(data) {
    const holdToMove = holds.find(h => h.mesh.name === data.holdName);
    if (holdToMove) {
        try {
            holdToMove.mesh.position.copyFrom(BABYLON.Vector3.FromArray(data.originalPosition));
            
            // Mettre à jour les données dans le tableau holds
            holdToMove.position = data.originalPosition;
            
            console.log(`🔄 Prise déplacée: ${data.holdName}`);
        } catch (error) {
            console.error(`❌ Erreur lors du déplacement de la prise ${data.holdName}:`, error);
        }
    } else {
        console.warn(`⚠️ Prise à déplacer non trouvée: ${data.holdName}`);
    }
}

function undoAddPanel(data) {
    const panelToRemove = wallPanels.find(p => p.mesh.name === data.panelName);
    if (panelToRemove) {
        try {
            // Même logique sécurisée pour les panels
            if (selectedPanel === panelToRemove.mesh) {
                selectedPanel = null;
                isPanelDragging = false;
            }
            
            if (panelToRemove.mesh.material && panelToRemove.mesh.material.dispose) {
                panelToRemove.mesh.material.dispose();
            }
            
            panelToRemove.mesh.dispose();
            
            // Supprimer du tableau wallPanels
            const panelIndex = wallPanels.indexOf(panelToRemove);
            if (panelIndex !== -1) {
                wallPanels.splice(panelIndex, 1);
            }
            
            // Supprimer aussi du tableau walls
            const wallIndex = walls.indexOf(panelToRemove.mesh);
            if (wallIndex !== -1) {
                walls.splice(wallIndex, 1);
            }
            
            console.log(`✅ Panneau supprimé: ${data.panelName}`);
            
        } catch (error) {
            console.error(`❌ Erreur lors de la suppression du panneau ${data.panelName}:`, error);
        }
    } else {
        console.warn(`⚠️ Panneau non trouvé: ${data.panelName}`);
    }
}

// FONCTION DE DEBUG POUR VÉRIFIER L'ÉTAT APRÈS UNDO
function debugSceneState() {
    console.log("🔍 ÉTAT DE LA SCÈNE APRÈS UNDO:");
    console.log(`- Prises dans holds: ${holds.length}`);
    console.log(`- Murs dans walls: ${walls.length}`);
    console.log(`- Panels dans wallPanels: ${wallPanels.length}`);
    console.log(`- Meshes dans la scène: ${scene.meshes.length}`);
    console.log(`- Cache de meshes: ${Object.keys(loadedMeshCache).length}`);
    console.log(`- selectedHold:`, selectedHold?.name || "null");
    console.log(`- isDragging:`, isDragging);
    console.log(`- isCameraMoveMode:`, isCameraMoveMode);
    console.log(`- isWallEditMode:`, isWallEditMode);
}

function debugHoldCreation() {
    console.log("🔍 DEBUG CRÉATION DE PRISES:");
    console.log(`- selectedShape: ${selectedShape}`);
    console.log(`- HOLD_SHAPES disponibles:`, Object.keys(HOLD_SHAPES));
    console.log(`- Nombre de murs: ${walls.length}`);
    console.log(`- Nombre de prises: ${holds.length}`);
    console.log(`- isCameraMoveMode: ${isCameraMoveMode}`);
    console.log(`- Canvas focus:`, document.activeElement === canvas);
    
    // Lister les prises actuelles
    holds.forEach((hold, index) => {
        console.log(`  ${index}: ${hold.mesh.name} (${hold.shape})`);
    });
}

// FONCTION D'UNDO AMÉLIORÉE AVEC DEBUG
function performUndo() {
    if (undoStack.length === 0) {
        console.log("❌ Aucune action à annuler");
        return false;
    }
    
    const lastState = undoStack.pop();
    console.log(`↩️ Annulation: ${lastState.type}`, lastState);
    
    try {
        switch (lastState.type) {
            case 'ADD_HOLD':
                undoAddHold(lastState.data);
                break;
            case 'MOVE_HOLD':
                undoMoveHold(lastState.data);
                break;
            case 'DELETE_HOLD':
                undoDeleteHold(lastState.data);
                break;
            case 'ADD_PANEL':
                undoAddPanel(lastState.data);
                break;
            default:
                console.warn(`Type d'action inconnue: ${lastState.type}`);
                return false;
        }
        
        // Sauvegarder dans le redo stack
        redoStack.push(lastState);
        
        // Debug après l'undo
        debugSceneState();
        
        return true;
        
    } catch (error) {
        console.error("❌ Erreur lors de l'undo:", error);
        // Remettre l'état dans le stack en cas d'erreur
        undoStack.push(lastState);
        
        // Debug en cas d'erreur
        debugSceneState();
        
        return false;
    }
}

// VÉRIFICATION SUPPLÉMENTAIRE AVANT CRÉATION DE PRISE
function canCreateHold() {
    // Vérifications de base
    if (!scene) {
        console.error("❌ Scène non disponible");
        return false;
    }
    
    if (!selectedShape || !HOLD_SHAPES[selectedShape]) {
        console.error("❌ Forme sélectionnée invalide:", selectedShape);
        return false;
    }
    
    if (walls.length === 0) {
        console.error("❌ Aucun mur disponible");
        return false;
    }
    
    if (isCameraMoveMode) {
        console.log("⚠️ Mode caméra actif, création de prise désactivée");
        return false;
    }
    
    // Vérification supplémentaire des éléments DOM
    const colorElement = document.getElementById('shapeColor');
    if (!colorElement) {
        console.error("❌ Élément de couleur non trouvé");
        return false;
    }
    
    console.log("✅ Création de prise autorisée");
    return true;
}


// MODIFIER LA FONCTION onRightClick POUR AJOUTER LA VÉRIFICATION
function onRightClickWithCheck(evt) {
    if (!canCreateHold()) {
        return;
    }
    
    // Votre code onRightClick existant...
    evt.preventDefault();
    let pickResult = scene.pick(scene.pointerX, scene.pointerY);
    
    // ... reste de votre code existant
}

console.log("✅ Système d'undo avec gestion dispose() amélioré chargé");

async function undoDeleteHold(data) {
    console.log("🔄 Tentative de restauration de la prise:", data.holdName);
    
    try {
        const holdData = data.holdData;
        
        // Vérifier que toutes les données nécessaires sont présentes
        if (!holdData.shape || !holdData.color || !holdData.attachedWall) {
            console.error("❌ Données incomplètes pour restaurer la prise:", holdData);
            return;
        }
        
        // Créer le matériau
        const holdMaterial = new BABYLON.StandardMaterial("restoredHoldMaterial", scene);
        holdMaterial.diffuseColor = BABYLON.Color3.FromHexString(holdData.color);
        
        // Recréer la prise avec la forme originale
        let restoredHold = await createHoldShape(holdData.shape, scene);
        
        // Restaurer les propriétés
        restoredHold.name = holdData.name;
        restoredHold.isHold = true;
        restoredHold.position = BABYLON.Vector3.FromArray(holdData.position);
        restoredHold.rotation = BABYLON.Vector3.FromArray(holdData.rotation);
        
        if (holdData.scale) {
            restoredHold.scaling = BABYLON.Vector3.FromArray(holdData.scale);
        }
        
        // Appliquer le matériau
        if (restoredHold.getChildMeshes && restoredHold.getChildMeshes().length > 0) {
            restoredHold.getChildMeshes().forEach(childMesh => {
                if (childMesh.material) {
                    childMesh.material = holdMaterial;
                }
            });
        } else {
            restoredHold.material = holdMaterial;
        }
        
        // Recréer l'objet holdData complet
        const newHoldData = {
            mesh: restoredHold,
            position: holdData.position,
            shape: holdData.shape,
            color: holdData.color,
            attachedWall: holdData.attachedWall
        };
        
        // Ajouter à la liste des prises
        holds.push(newHoldData);
        
        console.log(`✅ Prise restaurée avec succès: ${holdData.name}`);
        console.log(`📊 Nombre total de prises: ${holds.length}`);
        
    } catch (error) {
        console.error("❌ Erreur lors de la restauration de la prise:", error);
    }
}


// MODIFICATION DE LA FONCTION addHoldAtPosition
async function addHoldAtPosition(position, wall) {
    console.log("🎯 Tentative d'ajout de prise à la position:", position);
    
    if (!canCreateHold()) {
        console.error("❌ Création de prise bloquée par canCreateHold()");
        return null;
    }
    
    const color = document.getElementById('shapeColor').value;
    const holdMaterial = new BABYLON.StandardMaterial("holdMaterial", scene);
    holdMaterial.diffuseColor = BABYLON.Color3.FromHexString(color);

    try {
        let hold = await createHoldShape(selectedShape, scene);
        
        // Générer un nom unique
        const holdName = `hold_${selectedShape}_${Date.now()}`;
        hold.name = holdName;
        hold.isHold = true;
        
        // Appliquer le matériau
        if (hold.getChildMeshes && hold.getChildMeshes().length > 0) {
            hold.getChildMeshes().forEach(childMesh => {
                if (childMesh.material) {
                    childMesh.material = holdMaterial;
                }
            });
        } else {
            hold.material = holdMaterial;
        }
        
        // Positionner la prise
        hold.rotation = wall.rotation.clone();
        let relativePosition = position.subtract(wall.position);
        relativePosition = BABYLON.Vector3.TransformCoordinates(relativePosition, BABYLON.Matrix.RotationYawPitchRoll(wall.rotation.y, wall.rotation.x, wall.rotation.z));

        const rotationMatrix = BABYLON.Matrix.RotationYawPitchRoll(wall.rotation.y, wall.rotation.x, wall.rotation.z);
        const normal = new BABYLON.Vector3(0, 0, 1).normalize();
        const transformedNormal = BABYLON.Vector3.TransformNormal(normal, rotationMatrix);
        const offset = 0.2;
        hold.position = position.add(transformedNormal.scale(offset));

        const holdData = {
            mesh: hold,
            position: hold.position.asArray(),
            shape: selectedShape,
            color: color,
            attachedWall: wall
        };
        
        holds.push(holdData);
        
        // 📝 SAUVEGARDER POUR UNDO - VERSION CORRIGÉE
        saveStateForUndo('ADD_HOLD', {
            holdName: holdName,
            // Ne sauvegarder que les données sérialisables
            holdData: {
                name: holdName,
                position: hold.position.asArray(),
                rotation: hold.rotation.asArray(),
                shape: selectedShape,
                color: color,
                attachedWall: wall, // Garder la référence complète pour l'instant
                scale: hold.scaling.asArray()
            }
        });

        console.log(`✅ Prise ajoutée avec succès: ${selectedShape} (${holdName})`);
        console.log(`📊 Total prises: ${holds.length}`);
        return hold;
        
    } catch (error) {
        console.error("❌ Erreur lors de l'ajout de prise:", error);
        // Fallback vers une forme basique
        let fallbackHold = BABYLON.MeshBuilder.CreateSphere("fallback", { diameter: 0.4 }, scene);
        fallbackHold.material = holdMaterial;
        fallbackHold.position = position.add(new BABYLON.Vector3(0, 0, 0.2));
        
        const fallbackData = {
            mesh: fallbackHold,
            position: fallbackHold.position.asArray(),
            shape: 'fallback',
            color: color,
            attachedWall: wall
        };
        
        holds.push(fallbackData);
        return fallbackHold;
    }
}

window.addEventListener('keydown', (event) => {
    if (event.key === 'F12') { // Touche F12 pour debug
        debugHoldCreation();
    }
});
// MODIFICATION DU GESTIONNAIRE onPointerDown pour le drag
/*function onPointerDown(evt) {
    if (isCameraMoveMode) return;
    
    let pickResult = scene.pick(scene.pointerX, scene.pointerY);
    if (pickResult.hit && evt.button === 0) {
        if (pickResult.pickedMesh && !pickResult.pickedMesh.isWall) {
            const holdData = holds.find(h => h.mesh === pickResult.pickedMesh);
            if (holdData) {
                highlightHold(pickResult.pickedMesh);
                selectedHold = pickResult.pickedMesh;
                isDragging = true;
                
                // 📝 SAUVEGARDER POSITION POUR UNDO
                saveStateForUndo('MOVE_HOLD', {
                    holdName: selectedHold.name,
                    originalPosition: selectedHold.position.asArray()
                });
                
                console.log("🎯 Prise sélectionnée:", pickResult.pickedMesh.name);
            }
        }
    }
}*/
function onPointerDown(evt) {
    if (isCameraMoveMode) return;
    
    let pickResult = scene.pick(scene.pointerX, scene.pointerY);
    if (pickResult.hit && evt.button === 0) { // Clic gauche
        console.log(pickResult);
        // Vérifier si c'est une prise (pas un mur)
        if (pickResult.pickedMesh && !pickResult.pickedMesh.isWall) {
            // Vérifier si c'est bien une prise dans notre tableau holds
            const holdData = holds.find(h => h.mesh === pickResult.pickedMesh);
            if (holdData) {
                highlightHold(pickResult.pickedMesh);
                selectedHold = pickResult.pickedMesh;
                isDragging = true;
                
                // 📝 SAUVEGARDER POSITION POUR UNDO
                saveStateForUndo('MOVE_HOLD', {
                    holdName: selectedHold.name,
                    originalPosition: selectedHold.position.asArray()
                });
                
                console.log("🎯 Prise sélectionnée:", pickResult.pickedMesh.name);
            }
        }
    }
}

// MODIFICATION DU GESTIONNAIRE DE SUPPRESSION
window.addEventListener('keydown', (event) => {
if (event.key === 'Backspace' && selectedHold) {
        // 📝 SAUVEGARDER POUR UNDO AVANT SUPPRESSION
        const holdData = holds.find(h => h.mesh === selectedHold);
        if (holdData) {
            // Sauvegarder TOUTES les données nécessaires
            const cleanHoldData = {
                name: selectedHold.name,
                position: holdData.position, // Déjà un array
                rotation: selectedHold.rotation.asArray(),
                shape: holdData.shape, // ✅ CRUCIAL : forme de la prise
                color: holdData.color, // ✅ CRUCIAL : couleur
                attachedWall: holdData.attachedWall, // ✅ CRUCIAL : référence au mur
                // Ajouter d'autres propriétés si nécessaire
                scale: selectedHold.scaling ? selectedHold.scaling.asArray() : [1, 1, 1]
            };
            
            saveStateForUndo('DELETE_HOLD', {
                holdName: selectedHold.name,
                holdData: cleanHoldData
            });
        }
        
        // Stocker la référence avant suppression
        const holdToDelete = selectedHold;
        
        // Nettoyer l'état d'abord
        selectedHold = null;
        
        // Ensuite supprimer le mesh
        holdToDelete.dispose();
        
        // Filtrer le tableau
        holds = holds.filter(item => item.mesh !== holdToDelete);
    }


    
    if (event.key === 'Backspace' && selectedPanel) {
        // 📝 SAUVEGARDER POUR UNDO AVANT SUPPRESSION
        saveStateForUndo('ADD_PANEL', {
            panelName: selectedPanel.name
        });
        
        selectedPanel.dispose();
        wallPanels = wallPanels.filter(item => item.mesh !== selectedPanel);
        walls = walls.filter(item => item !== selectedPanel);
        selectedPanel = null;
    }
    
    if (event.ctrlKey || event.metaKey) {
        switch(event.key.toLowerCase()) {
            case 'd':
                event.preventDefault();
                duplicateSelected();
                break;
            case 'z':
                event.preventDefault();
                if (event.shiftKey) {
                    performRedo(); // Ctrl+Shift+Z pour redo
                } else {
                    performUndo(); // Ctrl+Z pour undo
                }
                break;
        }
    }
});

// Fonction de redo (bonus)
function performRedo() {
    if (redoStack.length === 0) {
        console.log("❌ Aucune action à refaire");
        return false;
    }
    
    const stateToRedo = redoStack.pop();
    console.log(`↪️ Refaire: ${stateToRedo.type}`);
    
    // Remettre dans l'undo stack et exécuter l'action inverse
    undoStack.push(stateToRedo);
    
    // Ici vous pourriez implémenter la logique inverse si nécessaire
    return true;
}

// Fonction utilitaire pour recréer une prise à partir des données
async function createHoldFromData(holdData) {
    try {
        const hold = await createHoldShape(holdData.shape, scene);
        hold.name = holdData.mesh?.name || `restored_hold_${Date.now()}`;
        hold.position = BABYLON.Vector3.FromArray(holdData.position);
        
        const material = new BABYLON.StandardMaterial("restoredMat", scene);
        material.diffuseColor = BABYLON.Color3.FromHexString(holdData.color);
        hold.material = material;
        
        return hold;
    } catch (error) {
        console.error("Erreur lors de la recréation de la prise:", error);
        throw error;
    }
}

console.log("✅ Système d'undo amélioré chargé");
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Désactive le zoom de la page uniquement quand la molette est sur le canvas
window.addEventListener("wheel", function (e) {
    if (document.activeElement === canvas || canvas.matches(':hover')) {
        if (e.ctrlKey) {
            // Empêche zoom global de la page (Ctrl + molette)
            e.preventDefault();
        }
    }
}, { passive: false });
///
function saveWall() {
    console.log("💾 Début de la sauvegarde...");
    
    const wallData = walls.map((wall, index) => {
        const box = wall.getBoundingInfo().boundingBox.extendSize.scale(2);
        console.log(`Sauvegarde mur ${index}:`, wall.name);
        return {
            width: box.x,
            height: box.y,
            depth: box.z,
            position: wall.position.asArray(),
            rotation: wall.rotation.asArray(),
            // Sauvegarder aussi le quaternion si présent
            rotationQuaternion: wall.rotationQuaternion ? wall.rotationQuaternion.asArray() : null
        };
    });

    const holdData = holds.map((h, index) => {
        // Trouver l'index du mur attaché
        let attachedWallIndex = null;
        if (h.attachedWall) {
            attachedWallIndex = walls.indexOf(h.attachedWall);
        }
        
        console.log(`Sauvegarde prise ${index}:`, h.mesh.name);
        return {
            shape: h.shape,
            color: h.color,
            position: h.mesh.position.asArray(),
            rotation: h.mesh.rotation.asArray(),
            // ✅ CORRECTION: Sauvegarder le quaternion s'il existe
            rotationQuaternion: h.mesh.rotationQuaternion ? h.mesh.rotationQuaternion.asArray() : null,
            attachedWallIndex: attachedWallIndex
        };
    });

    const data = {
        walls: wallData,
        holds: holdData
    };

    console.log("💾 Données à sauvegarder:", data);

    const jsonData = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'climbing_wall.json';
    a.click();
    
    console.log("✅ Sauvegarde terminée");
    exportSceneAsOBJ();
}

function loadWall() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                console.log("📁 Données chargées:", data);

                // ÉTAPE 1: NETTOYER COMPLÈTEMENT LA SCÈNE
                deleteall();
                
                // ÉTAPE 2: CHARGER LES MURS EN PREMIER
                if (data.walls && Array.isArray(data.walls)) {
                    console.log(`🏗️ Chargement de ${data.walls.length} mur(s)...`);
                    
                    data.walls.forEach((wallData, index) => {
                        const wall = BABYLON.MeshBuilder.CreateBox(`wall_${index}`, { 
                            width: wallData.width || 4, 
                            height: wallData.height || 3, 
                            depth: wallData.depth || 0.1 
                        }, scene);
                        
                        // Position
                        if (wallData.position) {
                            wall.position = BABYLON.Vector3.FromArray(wallData.position);
                        }
                        
                        // ✅ CORRECTION: Restaurer quaternion en priorité
                        if (wallData.rotationQuaternion) {
                            wall.rotationQuaternion = BABYLON.Quaternion.FromArray(wallData.rotationQuaternion);
                        } else if (wallData.rotation) {
                            wall.rotation = BABYLON.Vector3.FromArray(wallData.rotation);
                        }

                        // Matériau du mur
                        const wallMaterial = new BABYLON.StandardMaterial(`wallMat_${index}`, scene);
                        wallMaterial.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.6);
                        wall.material = wallMaterial;

                        // Marquer comme mur avec un tag
                        wall.isWall = true;
                        wall.wallIndex = index;
                        
                        wallPanels.push({mesh: wall});
                        walls.push(wall);
                        console.log(`✅ Mur ${index} créé:`, wall.name);
                    });
                }

                // ÉTAPE 3: CHARGER LES PRISES APRÈS LES MURS
                if (data.holds && Array.isArray(data.holds)) {
                    console.log(`🧗 Chargement de ${data.holds.length} prise(s)...`);
                    
                    const holdPromises = data.holds.map(async (holdData, index) => {
                        try {
                            // Créer le matériau
                            const material = new BABYLON.StandardMaterial(`holdMat_${index}`, scene);
                            material.diffuseColor = BABYLON.Color3.FromHexString(holdData.color || "#ff0000");

                            // Créer la prise avec la forme
                            let hold = await createHoldShape(holdData.shape || 'crimp', scene);
                            hold.name = `hold_${holdData.shape}`;///${index}
                            hold.isHold = true;
                            
                            // Appliquer le matériau
                            if (hold.getChildMeshes && hold.getChildMeshes().length > 0) {
                                hold.getChildMeshes().forEach(childMesh => {
                                    childMesh.material = material;
                                });
                            } else {
                                hold.material = material;
                            }
                            
                            // Position
                            if (holdData.position) {
                                hold.position = BABYLON.Vector3.FromArray(holdData.position);
                            }
                            
                            // ✅ CORRECTION: Restaurer quaternion en priorité
                            if (holdData.rotationQuaternion) {
                                hold.rotationQuaternion = BABYLON.Quaternion.FromArray(holdData.rotationQuaternion);
                                console.log(`🔄 Quaternion restauré pour prise ${index}`);
                            } else if (holdData.rotation) {
                                hold.rotation = BABYLON.Vector3.FromArray(holdData.rotation);
                                console.log(`🔄 Rotation Euler restaurée pour prise ${index}`);
                            }

                            // Trouver le mur attaché
                            let attachedWall = null;
                            if (holdData.attachedWallIndex !== undefined && walls[holdData.attachedWallIndex]) {
                                attachedWall = walls[holdData.attachedWallIndex];
                            }

                            holds.push({ 
                                mesh: hold, 
                                shape: holdData.shape || 'crimp', 
                                color: holdData.color || "#ff0000",
                                position: holdData.position, // Ajouter position dans les données
                                attachedWall: attachedWall
                            });
                            
                            console.log(`✅ Prise ${index} créée:`, hold.name);
                        } catch (error) {
                            console.error(`❌ Erreur lors du chargement de la prise ${index}:`, error);
                        }
                    });

                    await Promise.all(holdPromises);
                }
                
                console.log(`🎉 Chargement terminé: ${walls.length} mur(s), ${holds.length} prise(s)`);
                
            } catch (error) {
                console.error("❌ Erreur lors du parsing JSON:", error);
                alert("Erreur lors du chargement du fichier");
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function exportSceneAsOBJ() {
    BABYLON.GLTF2Export.GLBAsync(scene, "scene").then((glb) => {
        glb.downloadFiles();
    }).catch((error) => {
        console.error("Erreur lors de l'exportation du GLB:", error);
    });
}

// FONCTION OBSOLÈTE REMPLACÉE PAR createHoldShape()
// function createHoldShape(shape, scene) {
//     switch (shape) {
//         case 'sphere':
//             return BABYLON.MeshBuilder.CreateSphere("sphere", { diameter: 0.4 }, scene);
//         case 'box':
//             return BABYLON.MeshBuilder.CreateBox("box", { size: 0.4 }, scene);
//         case 'cylinder':
//             return BABYLON.MeshBuilder.CreateCylinder("cylinder", { height: 0.4, diameter: 0.4 }, scene);
//         default:
//             return BABYLON.MeshBuilder.CreateSphere("sphere", { diameter: 0.4 }, scene);
//     }
// }

function filterShapes(event) {
    const query = event.target.value.toLowerCase();
    document.querySelectorAll('.shapeItem').forEach(item => {
        const shapeName = item.textContent.toLowerCase();
        item.style.display = shapeName.includes(query) ? 'block' : 'none';
    });
}

function updateShapeColor(event) {
    // const color = event.target.value;
    // holds.forEach(holdData => {
    //     if (holdData.mesh) {
    //         holdData.mesh.material.diffuseColor = BABYLON.Color3.FromHexString(color);
    //     }
    // });
}

function selectShape(event) {
    document.querySelectorAll('.shapeItem').forEach(item => {
        item.classList.remove('selected');
    });

    const selectedItem = event.currentTarget;
    selectedItem.classList.add('selected');
    selectedShape = selectedItem.getAttribute('data-shape');
}

// Variables pour le mode modification du mur
let wallPanels = [];
let selectedPanel = null;
let isPanelDragging = false;

canvas.addEventListener("pointerdown", onPanelPointerDown);
canvas.addEventListener("pointermove", onPanelPointerMove);
canvas.addEventListener("pointerup", onPanelPointerUp);

// Boutons et éléments du DOM
const toggleWallEditBtn = document.getElementById('toggleWallEdit');
const wallEditPanel = document.getElementById('wallEditPanel');
const addPanelBtn = document.getElementById('addPanel');
const prise = document.getElementById('selectionPrise');

// Activer/Désactiver le mode Modification du mur
toggleWallEditBtn.addEventListener('click', () => {
    isWallEditMode = !isWallEditMode;
    toggleWallEditBtn.textContent = isWallEditMode ? "leave edit wall" : "Edit wall";
    wallEditPanel.style.display = isWallEditMode ? 'block' : 'none';
    prise.style.display = isWallEditMode ? 'none' : 'block';
    
    // Mettre à jour l'affichage du mode sans toucher aux contrôles caméra
    if (isWallEditMode) {
        document.getElementById('currentMode').textContent = 'Mode Wall Edit';
        document.getElementById('modeIndicator').className = 'status-indicator status-edit';
    } else {
        // Revenir au mode précédent
        document.getElementById('currentMode').textContent = isCameraMoveMode ? 'Mode Camera' : 'Mode Edit';
        document.getElementById('modeIndicator').className = isCameraMoveMode ? 'status-indicator status-camera' : 'status-indicator status-create';
    }
});

// Ajouter un panneau


function onPanelPointerDown(evt) {
    if (!isCameraMoveMode && isWallEditMode) {
        let pickResult = scene.pick(scene.pointerX, scene.pointerY);
        if (pickResult.hit) {
            if (wallPanels.some(p => p.mesh === pickResult.pickedMesh)) {
                selectedPanel = pickResult.pickedMesh;
                isPanelDragging = true;
                camera.detachControl(canvas);
            }
        }
    }
}

function onPanelPointerMove(evt) {
    if (isWallEditMode && selectedPanel) {
        const pickInfo = scene.pick(scene.pointerX, scene.pointerY);
        if (pickInfo.hit) {
            const newPos = pickInfo.pickedPoint;
            if (newPos) {
                selectedPanel.position.x = newPos.x;
                selectedPanel.position.y = newPos.y;
                selectedPanel.position.z = 0;
                snapToNearestPanel(selectedPanel);
            }
        }
    }
}

function onPanelPointerUp(evt) {
    if (isPanelDragging && selectedPanel) {
        snapToNearestPanel(selectedPanel);
        selectedPanel = null;
        isPanelDragging = false;
        if (isCameraMoveMode) {
            camera.attachControl(canvas, true);
        }
    }
}
//////////////
function snapToNearestPanel(panel) {
    const SNAP_THRESHOLD = 0.3;
    const ANGLE_TOLERANCE = 0.1; // Tolérance pour considérer les angles identiques

    wallPanels.forEach(other => {
        const otherMesh = other.mesh || other;
    
        if (otherMesh !== panel) {
            const panelSize = panel.getBoundingInfo().boundingBox.extendSize.scale(2);
            const otherSize = otherMesh.getBoundingInfo().boundingBox.extendSize.scale(2);
            
            // Calculer les positions des arêtes avec rotation correcte
            const panelEdges = calculatePanelEdges(panel, panelSize);
            const otherEdges = calculatePanelEdges(otherMesh, otherSize);

            // Vérifier si les inclinaisons sont identiques (même orientation dans l'espace)
            const sameInclinationX = Math.abs(panel.rotation.x - otherMesh.rotation.x) < ANGLE_TOLERANCE;
            const sameInclinationY = Math.abs(panel.rotation.y - otherMesh.rotation.y) < ANGLE_TOLERANCE;
            const sameInclination = sameInclinationX && sameInclinationY;

            if (sameInclination) {
                // Même inclinaison = snap possible sur les 4 faces
                trySnapAllEdges(panel, otherMesh, panelEdges, otherEdges, panelSize, otherSize, SNAP_THRESHOLD);
                console.log("test");
            } else {
                // Inclinaisons différentes = snap selon la logique d'orientation
                trySnapByOrientation(panel, otherMesh, panelEdges, otherEdges, panelSize, otherSize, SNAP_THRESHOLD, ANGLE_TOLERANCE);
            }
        }
    });
}

function calculatePanelEdges(panel, size) {
    const pos = panel.position;
    const rotY = panel.rotation.y;
    const rotX = panel.rotation.x;
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    
    const halfWidth = size.x / 2;
    const halfHeight = size.y / 2;
    
    return {
        // Bords horizontaux (gauche/droite) - rotation Y
        left: pos.x - cosY * halfWidth,
        right: pos.x + cosY * halfWidth,
        leftZ: pos.z - sinY * halfWidth,
        rightZ: pos.z + sinY * halfWidth,
        
        // Bords verticaux (haut/bas) - rotation X
        top: pos.y + cosX * halfHeight,
        bottom: pos.y - cosX * halfHeight,
        topZ: pos.z - sinX * halfHeight,
        bottomZ: pos.z + sinX * halfHeight,
        
        // Données de rotation pour les calculs
        cosY: cosY,
        sinY: sinY,
        cosX: cosX,
        sinX: sinX
    };
}

function trySnapAllEdges(panel, otherMesh, panelEdges, otherEdges, panelSize, otherSize, threshold) {
    let bestSnap = null;
    let minDistance = threshold;
    
    const snapTests = [
        {
            name: 'leftToRight',
            distance: calculateSnapDistance(panelEdges.left, panelEdges.leftZ, otherEdges.right, otherEdges.rightZ),
            alignment: Math.abs(panel.position.y - otherMesh.position.y)
        },
        {
            name: 'rightToLeft',
            distance: calculateSnapDistance(panelEdges.right, panelEdges.rightZ, otherEdges.left, otherEdges.leftZ),
            alignment: Math.abs(panel.position.y - otherMesh.position.y)
        },
        {
            name: 'topToBottom',
            distance: calculateSnapDistance(panelEdges.top, panelEdges.topZ, otherEdges.bottom, otherEdges.bottomZ),
            alignment: Math.abs(panel.position.x - otherMesh.position.x)*0.5
        },
        {
            name: 'bottomToTop',
            distance: calculateSnapDistance(panelEdges.bottom, panelEdges.bottomZ, otherEdges.top, otherEdges.topZ),
            alignment: Math.abs(panel.position.x - otherMesh.position.x)*0.5
        }
    ];
    
    // Trouver le meilleur snap en tenant compte de l'alignement
    snapTests.forEach(test => {
        const totalDistance = test.distance*0.3 + test.alignment * 0.5;
        console.log(test.distance);
        if (totalDistance < minDistance) {
            minDistance = totalDistance;
            bestSnap = test.name;
        }
    });
    
    if (bestSnap) {
        applySnap(bestSnap, panel, otherMesh, panelEdges, otherEdges, panelSize, otherSize);
    }
}

function trySnapByOrientation(panel, otherMesh, panelEdges, otherEdges, panelSize, otherSize, threshold, angleTolerance) {
    let bestSnap = null;
    let minDistance = threshold;
    
    // Déterminer l'orientation dominante du panneau
    const hasXRotation = Math.abs(panel.rotation.x) > angleTolerance;
    const hasYRotation = Math.abs(panel.rotation.y) > angleTolerance;
    
    const snapTests = [];
    
    if (hasXRotation && !hasYRotation) {
        // Inclinaison sur X dominante -> privilégier snap top/bottom
        snapTests.push(
            {
                name: 'topToBottom',
                distance: calculateSnapDistance(panelEdges.top, panelEdges.topZ, otherEdges.bottom, otherEdges.bottomZ),
                priority: 0.5 // Priorité haute
            },
            {
                name: 'bottomToTop',
                distance: calculateSnapDistance(panelEdges.bottom, panelEdges.bottomZ, otherEdges.top, otherEdges.topZ),
                priority: 0.5
            },
            // Snap left/right possible mais avec priorité plus faible
            {
                name: 'leftToRight',
                distance: calculateSnapDistance(panelEdges.left, panelEdges.leftZ, otherEdges.right, otherEdges.rightZ),
                priority: 3
            },
            {
                name: 'rightToLeft',
                distance: calculateSnapDistance(panelEdges.right, panelEdges.rightZ, otherEdges.left, otherEdges.leftZ),
                priority: 3
            }
        );
    } else if (hasYRotation && !hasXRotation) {
        // Inclinaison sur Y dominante -> privilégier snap left/right
        snapTests.push(
            {
                name: 'leftToRight',
                distance: calculateSnapDistance(panelEdges.left, panelEdges.leftZ, otherEdges.right, otherEdges.rightZ),
                priority: 0.5
            },
            {
                name: 'rightToLeft',
                distance: calculateSnapDistance(panelEdges.right, panelEdges.rightZ, otherEdges.left, otherEdges.leftZ),
                priority: 0.5
            },
            // Snap top/bottom possible mais avec priorité plus faible
            {
                name: 'topToBottom',
                distance: calculateSnapDistance(panelEdges.top, panelEdges.topZ, otherEdges.bottom, otherEdges.bottomZ),
                priority: 3
            },
            {
                name: 'bottomToTop',
                distance: calculateSnapDistance(panelEdges.bottom, panelEdges.bottomZ, otherEdges.top, otherEdges.topZ),
                priority: 3
            }
        );
    } else {
        // Pas d'inclinaison dominante ou double inclinaison -> tous les snaps possibles
        snapTests.push(
            {
                name: 'leftToRight',
                distance: calculateSnapDistance(panelEdges.left, panelEdges.leftZ, otherEdges.right, otherEdges.rightZ),
                priority: 1
            },
            {
                name: 'rightToLeft',
                distance: calculateSnapDistance(panelEdges.right, panelEdges.rightZ, otherEdges.left, otherEdges.leftZ),
                priority: 1
            },
            {
                name: 'topToBottom',
                distance: calculateSnapDistance(panelEdges.top, panelEdges.topZ, otherEdges.bottom, otherEdges.bottomZ),
                priority: 1
            },
            {
                name: 'bottomToTop',
                distance: calculateSnapDistance(panelEdges.bottom, panelEdges.bottomZ, otherEdges.top, otherEdges.topZ),
                priority: 1
            }
        );
    }
    
    // Trouver le meilleur snap en tenant compte de la priorité
    snapTests.forEach(test => {
        const adjustedDistance = test.distance * test.priority; // Les priorité 1 sont favorisées
        console.log(adjustedDistance);
        if (adjustedDistance < minDistance) {
            minDistance = adjustedDistance;
            bestSnap = test.name;
        }
    });
    
    if (bestSnap) {
        applySnap(bestSnap, panel, otherMesh, panelEdges, otherEdges, panelSize, otherSize);
    }
}

function calculateSnapDistance(coord1, z1, coord2, z2) {
    const coordDiff = Math.abs(coord1 - coord2);
    const zDiff = Math.abs(z1 - z2);
    return Math.sqrt(coordDiff * coordDiff + zDiff * zDiff);
}

function applySnap(snapType, panel, otherMesh, panelEdges, otherEdges, panelSize, otherSize) {
    switch (snapType) {
        case 'leftToRight':
            panel.position.x = otherMesh.position.x + (otherEdges.cosY * otherSize.x / 2) + (panelEdges.cosY * panelSize.x / 2);
            panel.position.z = otherMesh.position.z - (Math.sin(panel.rotation.y)*panelSize.x / 2) -(Math.sin(otherMesh.rotation.y)*otherSize.x / 2);
            break;
            
        case 'rightToLeft':
            panel.position.x = otherMesh.position.x - (otherEdges.cosY * otherSize.x / 2) - (panelEdges.cosY * panelSize.x / 2);
            panel.position.z = otherMesh.position.z + (Math.sin(panel.rotation.y) *panelSize.x / 2)+(Math.sin(otherMesh.rotation.y)*otherSize.x / 2);
            break;
            
        case 'topToBottom':
            panel.position.y = otherMesh.position.y - (otherEdges.cosX * otherSize.y / 2) - (panelEdges.cosX * panelSize.y / 2);
            panel.position.z = otherMesh.position.z - (Math.sin(panel.rotation.x) *panelSize.y / 2)-(Math.sin(otherMesh.rotation.x)*otherSize.y / 2);
            break;
            
        case 'bottomToTop':
            panel.position.y = otherMesh.position.y + (otherEdges.cosX * otherSize.y / 2) + (panelEdges.cosX * panelSize.y / 2);
            panel.position.z = otherMesh.position.z + (Math.sin(panel.rotation.x) *panelSize.y / 2)+(Math.sin(otherMesh.rotation.x)*otherSize.y / 2);
            break;
    }
}



////////////////
window.addEventListener('keydown', function (evt) {
    if (!isCameraMoveMode && selectedHold) {
        if (evt.key === 'r' || evt.key === 'R') {
            rotateHoldLocally(selectedHold, 15);
        }
    }
});

function rotateHoldLocally(holdMesh, angleDegrees) {
    if (!holdMesh) return;

    const angleRadians = BABYLON.Tools.ToRadians(angleDegrees);

    if (!holdMesh.rotationQuaternion) {
        holdMesh.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(
            holdMesh.rotation.y, 
            holdMesh.rotation.x, 
            holdMesh.rotation.z
        );
    }

    const localZ = BABYLON.Vector3.Forward();
    const localZAxis = BABYLON.Vector3.TransformNormal(localZ, holdMesh.getWorldMatrix());

    const deltaRotation = BABYLON.Quaternion.RotationAxis(localZAxis, angleRadians);
    holdMesh.rotationQuaternion = deltaRotation.multiply(holdMesh.rotationQuaternion);
}



function deleteall() {
    console.log("🧹 Début du nettoyage...");
    
    // Supprimer tous les murs du tableau walls
    walls.forEach((wall, index) => {
        console.log(`Suppression mur ${index}:`, wall.name);
        if (wall && wall.dispose) {
            wall.dispose();
        }
    });
    walls.length = 0; // Vider complètement le tableau
    
    // Supprimer tous les panels du tableau wallPanels
    wallPanels.forEach((panel, index) => {
        console.log(`Suppression panel ${index}:`, panel.mesh?.name);
        if (panel.mesh && panel.mesh.dispose) {
            panel.mesh.dispose();
        }
    });
    wallPanels.length = 0; // Vider complètement le tableau
    
    // Supprimer toutes les prises du tableau holds
    holds.forEach((hold, index) => {
        console.log(`Suppression prise ${index}:`, hold.mesh?.name);
        if (hold.mesh && hold.mesh.dispose) {
            hold.mesh.dispose();
        }
    });
    holds.length = 0; // Vider complètement le tableau
    
    // Réinitialiser les sélections
    selectedHold = null;
    selectedPanel = null;
    isDragging = false;
    isPanelDragging = false;
    
    // Nettoyer le cache des meshes chargés
    Object.keys(loadedMeshCache).forEach(key => {
        if (loadedMeshCache[key] && loadedMeshCache[key].dispose) {
            loadedMeshCache[key].dispose();
        }
        delete loadedMeshCache[key];
    });
    
    console.log(`✅ Nettoyage terminé - walls: ${walls.length}, wallPanels: ${wallPanels.length}, holds: ${holds.length}`);
}

let keys = {};
window.addEventListener('keydown', function (evt) {
    const speed = 0.05;
    const rotationSpeed = 0.02;
    
    if (!selectedPanel) return;
    console.log('test');
    
    if (evt.key === 'z' || evt.key === 'Z') selectedPanel.position.z += speed;
    if (evt.key === 's' || evt.key === 'S') selectedPanel.position.z -= speed;
    if (evt.key === 'q' || evt.key === 'Q') selectedPanel.position.x -= speed;
    if (evt.key === 'd' || evt.key === 'D') selectedPanel.position.x += speed;
    if (evt.key === 'a' || evt.key === 'A') selectedPanel.position.y += speed;
    if (evt.key === 'e' || evt.key === 'E') selectedPanel.position.y -= speed;
    
    if (evt.key === 'ArrowLeft') selectedPanel.rotation.y -= rotationSpeed;
    if (evt.key === 'ArrowRight') selectedPanel.rotation.y += rotationSpeed;
    if (evt.key === 'ArrowUp') selectedPanel.rotation.x -= rotationSpeed;
    if (evt.key === 'ArrowDown') selectedPanel.rotation.x += rotationSpeed;
});

// FONCTION UTILITAIRE POUR OBTENIR LA LISTE DES FORMES DISPONIBLES
function getAvailableShapes() {
    return Object.keys(HOLD_SHAPES);
}

// FONCTION UTILITAIRE POUR OBTENIR LE NOM D'AFFICHAGE D'UNE FORME
function getShapeDisplayName(shapeType) {
    return HOLD_SHAPES[shapeType]?.name || shapeType;
}






// 2. FONCTION LOADWALL COMPLÈTEMENT REFAITE


// 3. FONCTION ONRIGHTCLICK COMPLÈTEMENT REFAITE


// 4. FONCTION ONPOINTERDOWN AMÉLIORÉE


// 5. FONCTION CREATEWALL AMÉLIORÉE (pour créer des murs manuellement)


// 6. FONCTION ADDPANELBTN CORRIGÉE
if (document.getElementById('addPanel')) {
    document.getElementById('addPanel').addEventListener('click', () => {
        const width = parseFloat(document.getElementById('panelWidth').value) || 2;
        const height = parseFloat(document.getElementById('panelHeight').value) || 2;
        const angleXDeg = parseFloat(document.getElementById('panelAngle').value) || 0;
        const angleYDeg = parseFloat(document.getElementById('panelAngleY').value) || 0;

        const panelIndex = wallPanels.length;
        const panel = BABYLON.MeshBuilder.CreateBox(`wall_panel_${panelIndex}`, { width, height, depth: 0.1 }, scene);

        const totalHeight = wallPanels.reduce((acc, p) => acc + p.height, 0);
        panel.position = new BABYLON.Vector3(0, totalHeight + height / 2, 0);

        panel.rotation.x = BABYLON.Tools.ToRadians(angleXDeg);
        panel.rotation.y = BABYLON.Tools.ToRadians(angleYDeg);

        const panelMaterial = new BABYLON.StandardMaterial(`panelMat_${panelIndex}`, scene);
        panelMaterial.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
        panel.material = panelMaterial;

        // Marquer comme mur
        panel.isWall = true;
        panel.wallIndex = walls.length; // Index dans walls
        
        wallPanels.push({ mesh: panel, width, height, angleX: angleXDeg, angleY: angleYDeg });
        walls.push(panel); // Ajouter au tableau walls pour la détection

        console.log("🧱 Panneau ajouté:", { width, height, angleXDeg, angleYDeg });
    });
}



function duplicateSelected() {
    if (!selectedHold) {
        updateStatus("Aucun objet sélectionné pour la duplication");
        return;
    }

    const originalMesh = selectedHold;
    
    // Créer une copie du mesh
    const duplicatedMesh = originalMesh.clone(`${originalMesh.name}_copy_${Date.now()}`);
    
    // Positionner la copie légèrement décalée
    duplicatedMesh.position = originalMesh.position.add(new BABYLON.Vector3(1, 0, 0));
    duplicatedMesh.isPickable = true;

    // Trouver l'objet hold original dans le tableau holds pour récupérer ses propriétés
    const originalHold = holds.find(hold => hold.mesh === originalMesh);
    
    if (!originalHold) {
        console.error("Hold original non trouvé dans le tableau holds");
        return;
    }

    // Déterminer la shape basée sur le mesh
    let shape = "sphere"; // Correction de la faute de frappe "shere"
    if (originalHold.shape) {
        shape = originalHold.shape;
    } else {
        // Essayer de déterminer la shape par le nom du mesh
        const meshName = originalMesh.name.toLowerCase();
        if (meshName.includes('box') || meshName.includes('cube')) {
            shape = "box";
        } else if (meshName.includes('cylinder')) {
            shape = "cylinder";
        } else if (meshName.includes('sphere')) {
            shape = "sphere";
        }
    }

    // Récupérer la couleur du matériau
    let color = { r: 1, g: 1, b: 1 }; // Couleur par défaut (blanc)
    
    if (duplicatedMesh.material) {
        if (duplicatedMesh.material.diffuseColor) {
            color = {
                r: duplicatedMesh.material.diffuseColor.r,
                g: duplicatedMesh.material.diffuseColor.g,
                b: duplicatedMesh.material.diffuseColor.b
            };
        } else if (duplicatedMesh.material.emissiveColor) {
            color = {
                r: duplicatedMesh.material.emissiveColor.r,
                g: duplicatedMesh.material.emissiveColor.g,
                b: duplicatedMesh.material.emissiveColor.b
            };
        }
    }

    // Si on utilise la couleur de l'objet original
    if (originalHold.color) {
        color = originalHold.color;
    }

    // Déterminer le mur attaché (utiliser le même que l'original ou le plus proche)
    let attachedWall = originalHold.attachedWall || null;
    
    // Si pas de mur attaché dans l'original, essayer de trouver le mur le plus proche
    if (!attachedWall && walls.length > 0) {
        let closestWall = walls[0];
        let minDistance = BABYLON.Vector3.Distance(duplicatedMesh.position, closestWall.position);
        
        for (let i = 1; i < walls.length; i++) {
            const distance = BABYLON.Vector3.Distance(duplicatedMesh.position, walls[i].position);
            if (distance < minDistance) {
                minDistance = distance;
                closestWall = walls[i];
            }
        }
        attachedWall = closestWall;
    }

    console.log(`Objet dupliqué: ${duplicatedMesh.name}`);
    
    // Ajouter le nouveau hold au tableau
    holds.push({
        mesh: duplicatedMesh,
        position: duplicatedMesh.position.asArray(),
        shape: shape,
        color: color,
        attachedWall: attachedWall
    });
    
    console.log("Nouveau hold ajouté:", holds[holds.length - 1]);
    console.log("Total holds:", holds.length);
    
}

// Fonction utilitaire pour récupérer les propriétés d'un hold
function getHoldProperties(holdMesh) {
    const hold = holds.find(h => h.mesh === holdMesh);
    if (!hold) return null;
    
    return {
        name: holdMesh.name,
        shape: hold.shape,
        color: hold.color,
        position: hold.position,
        attachedWall: hold.attachedWall ? hold.attachedWall.name : "Aucun",
        material: holdMesh.material ? holdMesh.material.name : "Aucun"
    };
}

// Fonction pour mettre à jour les propriétés d'un hold existant
function updateHoldProperties(holdMesh, newProperties) {
    const holdIndex = holds.findIndex(h => h.mesh === holdMesh);
    if (holdIndex === -1) {
        console.error("Hold non trouvé");
        return false;
    }
    
    if (newProperties.shape) holds[holdIndex].shape = newProperties.shape;
    if (newProperties.color) holds[holdIndex].color = newProperties.color;
    if (newProperties.attachedWall) holds[holdIndex].attachedWall = newProperties.attachedWall;
    if (newProperties.position) {
        holds[holdIndex].position = newProperties.position;
        holdMesh.position = BABYLON.Vector3.FromArray(newProperties.position);
    }
    
    console.log(`Hold ${holdMesh.name} mis à jour:`, holds[holdIndex]);
    return true;
}


    // Créer l'action d'undo
    const actions = [];

// Observer TOUS les changements automatiquement
/*scene.onNewMeshAddedObservable.add((mesh) => {
    actions.push(() => mesh.dispose());
});*/

// Variables pour tracker le drag

let draggedMesh = null;
let startPosition = null;

scene.onPointerObservable.add((pointerInfo) => {
    // Début du drag
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN && pointerInfo.pickInfo.hit) {
        draggedMesh = pointerInfo.pickInfo.pickedMesh;
        startPosition = draggedMesh.position.clone(); // Sauvegarder position initiale
    }
    
    // Fin du drag
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP && isDragging) {
        if (draggedMesh && startPosition && !startPosition.equals(draggedMesh.position)) {
            // Le mesh a bougé - sauvegarder l'action d'undo
            const meshToRestore = draggedMesh;
            const positionToRestore = startPosition.clone();
            
            actions.push(() => {
                meshToRestore.position.copyFrom(positionToRestore);
            });
        }
        
        // Reset des variables
        draggedMesh = null;
        startPosition = null;
    }
});
 
let hiddenMenu= false;
function hiddMenue(){
    hiddenMenu=!hiddenMenu;
    if (hiddenMenu==true){
    document.getElementById('controls').classList.add('collapsed');
}else{
    document.getElementById('controls').classList.remove('collapsed');
}
    document.getElementById('panelToggle').style.display =hiddenMenu? 'none':'block';
    document.getElementById('panelToggle1').style.display =hiddenMenu? 'block':'none';
}

function actionGlobale() {
    setTimeout(() => {
        console.log("Action déclenchée !");

    console.log("Action détectée : clic ou touche clavier");
    document.getElementById('holdCount').textContent = holds.length;
    document.getElementById('panelCount').textContent = walls.length;
}, 300);
  }
  canvas.addEventListener("contextmenu", actionGlobale);
  document.addEventListener("click", actionGlobale);
  document.addEventListener("keydown", actionGlobale);