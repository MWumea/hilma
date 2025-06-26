// scripts/XRControllerModelFactory.js

THREE.XRControllerModelFactory = function () {

	/*********************************/
	/* MODIFIED FOR ES6 CLASS SYNTAX */
	/*********************************/
	class XRControllerModel extends THREE.Group {

		constructor() {
			super(); // Replaces THREE.Group.call(this)

			this.motionController = null;
			this.envMap = null;
		}

		setEnvironmentMap( envMap ) {

			if ( this.envMap == envMap ) {

				return this;

			}

			this.envMap = envMap;
			this.traverse( ( child ) => {

				if ( child.isMesh ) {

					child.material.envMap = this.envMap;
					child.material.needsUpdate = true;

				}

			} );

			return this;

		}

		/**
		 * Polls the MotionController for updates and updates the model accordingly.
		 *
		 * @param {string} Gamepad id of the gamepad to load the model for
		 */
		updateMatrixWorld( force ) {

			super.updateMatrixWorld( force );

			if ( ! this.motionController ) return;

			// Cause the MotionController to poll the Gamepad for data
			this.motionController.updateFromGamepad();

			// Update the 3D model to reflect the button, thumbstick, and touchpad state
			Object.values( this.motionController.components ).forEach( ( component ) => {

				// Update node data based on the visual responses' current state
				Object.values( component.visualResponses ).forEach( ( visualResponse ) => {

					const { valueNode, minNode, maxNode, value, valueNodeProperty } = visualResponse;

					// Skip if the visual response node is not found. No error is needed,
					// because it will be reported at load time.
					if ( ! valueNode ) return;

					// Calculate the new properties based on the weight supplied
					if ( valueNodeProperty === 'visibility' ) {

						valueNode.visible = value;

					} else if ( valueNodeProperty === 'transform' ) {

						THREE.Quaternion.slerp(
							minNode.quaternion,
							maxNode.quaternion,
							valueNode.quaternion,
							value
						);

						valueNode.position.lerpVectors(
							minNode.position,
							maxNode.position,
							value
						);

					}

				} );

			} );

		}
	}


	/**
	 * @param {Object} motionControllerDef - Motion controller definition to be used
	 * @param {string} motionControllerDef.id - Id of the motion controller
	 * @param {string} motionControllerDef.path - Path to the inner motion controller JSON file
	 * @param {Object} motionControllerDef.layouts - Layouts of the motion controller
	 * @param {Object} motionControllerDef.layouts.[layoutId] - The object containing the layout information
	 * @param {string} motionControllerDef.layouts.[layoutId].path - Path to the layout's GLTF file
	 * @param {Object} motionControllerDef.layouts.[layoutId].components - The components in the layout
	 */
	function MotionController( motionControllerDef,
		gamepad ) {

		this.id = motionControllerDef.id;
		this.gamepad = gamepad;
		this.layout = motionControllerDef.layouts[ Object.keys( motionControllerDef.layouts )[ 0 ] ];
		this.assetPath = motionControllerDef.path.replace( /[^/]+$/, '' ) + this.layout.assetPath;

		this.components = {};
		Object.keys( this.layout.components ).forEach( ( componentId ) => {

			const componentDef = this.layout.components[ componentId ];
			this.components[ componentId ] = {
				type: componentDef.type,
				gamepadIndices: Object.assign( {}, componentDef.gamepadIndices ),
				visualResponses: {},
				touchPointNode: null,
				values: {
					state: 'default',
					button: 0,
					xAxis: 0,
					yAxis: 0,
				}
			};

		} );
	}

	MotionController.prototype = {
		/**
		 * Takes a gamepad object and polls it for data.
		 *
		 * @param {Object} gamepad - A gamepad object from the WebXR API
		 */
		updateFromGamepad: function () {

			Object.keys( this.components ).forEach( ( componentId ) => {

				const component = this.components[ componentId ];
				component.values.state = 'default';

				if ( component.gamepadIndices.button !== undefined &&
					this.gamepad.buttons[ component.gamepadIndices.button ] ) {

					const gamepadButton = this.gamepad.buttons[ component.gamepadIndices.button ];
					component.values.button = gamepadButton.value;
					if( gamepadButton.pressed ) {

						component.values.state = 'pressed';

					} else if ( gamepadButton.touched ) {

						component.values.state = 'touched';

					}


				}

				if ( component.gamepadIndices.xAxis !== undefined &&
					this.gamepad.axes[ component.gamepadIndices.xAxis ] !== undefined ) {

					component.values.xAxis = this.gamepad.axes[ component.gamepadIndices.xAxis ];

				}

				if ( component.gamepadIndices.yAxis !== undefined &&
					this.gamepad.axes[ component.gamepadIndices.yAxis ] !== undefined ) {

					component.values.yAxis = this.gamepad.axes[ component.gamepadIndices.yAxis ];

				}

			} );

		}
	};

	const motionControllers = {};
	function fetchMotionController( gamepad ) {

		const path = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/';
		const supportedProfiles = gamepad.profiles || [ gamepad.id ] || [];
		const promises = [];
		supportedProfiles.forEach( ( profile ) => {

			const fullPath = path + profile + '/profile.json';
			promises.push(
				fetch( fullPath )
					.then( ( response ) => {

						return response.json();

					} )
					.then( ( motionControllerDef ) => {

						motionControllerDef.path = fullPath;
						return new MotionController( motionControllerDef, gamepad );

					} )
			);

		} );

		return Promise.race( promises )
			.catch( ( err ) => {

				console.warn( err );
				return null;

			} );

	}

	const gltfLoader = new THREE.GLTFLoader();
	function fetchGltf( motionController ) {

		const path = motionController.assetPath;
		const gltfPromise = new Promise( ( resolve, reject ) => {

			gltfLoader.load( path, resolve, null, reject );

		} );

		return gltfPromise
			.then( ( gltf ) => {

				const GltfScene = gltf.scene;

				// Find the nodes that are named and set them as properties on the THREE object
				const visualResponses = {};
				const componentIds = Object.keys( motionController.components );
				componentIds.forEach( ( componentId ) => {

					const component = motionController.components[ componentId ];
					visualResponses[ componentId ] = {};
					if ( component.visualResponses ) {

						Object.keys( component.visualResponses ).forEach( ( responseName ) => {

							const responseDesc = component.visualResponses[ responseName ];
							const VisualResponse = {
								value: 0,
								valueNode: GltfScene.getObjectByName( responseDesc.valueNodeName ),
								valueNodeProperty: responseDesc.valueNodeProperty,
							};

							// If there is a min and max node, treat this visual response as a lerp
							if ( responseDesc.minNodeName && responseDesc.maxNodeName ) {

								VisualResponse.minNode = GltfScene.getObjectByName( responseDesc.minNodeName );
								VisualResponse.maxNode = GltfScene.getObjectByName( responseDesc.maxNodeName );

							}

							visualResponses[ componentId ][ responseName ] = VisualResponse;

						} );

					}

				} );

				// Find the touch-point nodes and set them as properties on the THREE object
				componentIds.forEach( ( componentId ) => {

					const component = motionController.components[ componentId ];
					const touchPointNodeName = component.touchPointNodeName;
					if ( touchPointNodeName ) {

						component.touchPointNode = GltfScene.getObjectByName( touchPointNodeName );

					}

				} );

				// Set the THREE object's components to the response descriptions
				Object.keys( motionController.components ).forEach( ( componentId ) => {

					motionController.components[ componentId ].visualResponses =
						visualResponses[ componentId ];

				} );
				return GltfScene;

			} );

	}

	return {
		createControllerModel: function ( controller ) {

			const model = new XRControllerModel();
			let motionController = null;
			controller.addEventListener( 'connected', ( event ) => {

				const gamepad = event.data.gamepad;

				if ( gamepad && gamepad.id ) {

					fetchMotionController( gamepad )
						.then( ( fetchedMotionController ) => {

							motionController = fetchedMotionController;
							if ( motionController ) {

								model.motionController = motionController;
								return fetchGltf( motionController );

							}

						} )
						.then( ( gltf ) => {

							if ( gltf ) {

								model.add( gltf );

							}

						} );

				}

			} );

			controller.addEventListener( 'disconnected', () => {

				model.motionController = null;
				model.remove( model.children[ 0 ] );

			} );


			return model;

		}
	};

};