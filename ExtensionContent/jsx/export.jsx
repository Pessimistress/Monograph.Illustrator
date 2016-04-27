#include "helper.jsxinc"

// A script to convert Illustrator files to Monograph prototype

(function() {

		// ===================
		// config
		// ===================

		var versionNumber = $._ext_Monograph.version;
		var debugMode = $._ext_Monograph.debugMode;	
		var licenseInfo = "Monograph " + versionNumber + " (MIT License) Microsoft 2016";
		var devServer = "http://localhost/Monograph/core/";

		// warnings and informational messages
		var message = new MessageCenter();

		if (app.documents.length == 0) {
			return message.show("Open the document you want to export", licenseInfo);
		}

		var thisDoc = app.activeDocument;

		// save/load last export settings
		var Settings = _.PrototypeSettings(thisDoc);
		var exportSettings = Settings.read();

		// these are used for generating HTML, images and CSS data
		var docSettings = {
			// parsing
			buttonTag: "button",

			// image format
			export_image: true,
			image_format: "PNG24",
			image_scale: 100,
			png_transparency: true,
			png_number_of_colors: 128,

			// pointers
			output_path: "*-prototype",
			custom_script: ""
		};

		// these will be passed to runtime for rendering
		var jsSettings = {
			input_controller: true,
			input_keyboard: false,
			input_mouse: false,
			input_touch: false,
			auto_scale: true,
			background: "#ffffff",
			transition_duration: 300,
			easing_func: "cubic",
			easing_mode: "out"
		};

		var getSettingValue = function(key, default_settings) {
			return (exportSettings[key] === undefined) ? default_settings[key] : exportSettings[key];
		}

		if (_.openDialog("Options", {
				children: [{
					name: "Name",
					type: "text",
					value: getSettingValue("output_path", docSettings),
					id: "output_path"
				}, {
					name: "Images",
					children: [{
						name: "Export Images",
						type: "checkbox",
						value: getSettingValue("export_image", docSettings),
						id: "export_image"
					}, {
						name: "Format",
						type: "dropdown",
						options: ["PNG24", "PNG8", "JPEG"],
						value: getSettingValue("image_format", docSettings),
						id: "image_format",
						deps: {
							"export_image": function(v) {
								return v
							}
						}
					}, {
						name: "Transparency",
						type: "checkbox",
						value: getSettingValue("png_transparency", docSettings),
						id: "png_transparency",
						deps: {
							"export_image": function(v) {
								return v
							},
							"image_format": function(v) {
								return v != "JPEG"
							}
						}
					}, {
						name: "Scale",
						type: "number",
						value: getSettingValue("image_scale", docSettings),
						id: "image_scale",
						deps: {
							"export_image": function(v) {
								return v
							}
						}
					}]
				}, {
					name: "Transition",
					children: [{
						name: "Duration (ms)",
						type: "number",
						value: getSettingValue("transition_duration", jsSettings),
						id: "transition_duration"
					}, {
						name: "Easing function",
						type: "dropdown",
						options: ["cubic", "quad", "linear", "sin", "exp", "circle", "bounce", "elastic", "back"],
						value: getSettingValue("easing_func", jsSettings),
						id: "easing_func"
					}, {
						name: "Easing mode",
						type: "dropdown",
						options: ["in", "out", "in-out", "out-in"],
						value: getSettingValue("easing_mode", jsSettings),
						id: "easing_mode"
					}]
				}, {
					name: "Input",
					children: [{
						flow: "horizontal",
						children: [{
							name: "Controller",
							type: "checkbox",
							width: 24,
							value: getSettingValue("input_controller", jsSettings),
							id: "input_controller"
						}, {
							name: "Keyboard",
							type: "checkbox",
							width: 24,
							value: getSettingValue("input_keyboard", jsSettings),
							id: "input_keyboard"
						}]
					}, {
						flow: "horizontal",
						children: [{
							name: "Mouse",
							type: "checkbox",
							width: 24,
							value: getSettingValue("input_mouse", jsSettings),
							id: "input_mouse"
						}, {
							name: "Touch",
							type: "checkbox",
							width: 24,
							value: getSettingValue("input_touch", jsSettings),
							id: "input_touch"
						}]
					}]
				}, {
					name: "Page",
					children: [{
						name: "Scale to fit",
						type: "checkbox",
						value: getSettingValue("auto_scale", jsSettings),
						id: "auto_scale"
					}, {
						name: "Background",
						type: "color",
						value: getSettingValue("background", jsSettings),
						id: "background"
					}]
				}]
			}, exportSettings) == 1) {

		// ===================
		// modules
		// ===================

		var tagPattern = /:[^:]+/g,
			tagParameterPattern = /^:([\w_\-\.]+)(\((.*)\))?$/,
			badNamePattern = /[" @\/\.]/,
			badIdPattern = /[^A-Za-z0-9\-]/g;
		var imageExtension = exportSettings.image_format == "JPEG"? ".jpg" : ".png";

		// check if an item or layer is hidden in Illustrator
		var isHidden = function(obj, value) {
			if (obj.typename == "Document") return false;
			if (value === undefined) {
				if (obj.typename == "Layer") {
					return !obj.visible;
				} else {
					return obj.hidden;
				};
			} else {
				if (obj.typename == "Layer") {
					obj.visible = !value;
				} else {
					obj.hidden = value;
				};
			}
		};

		// convert string to safe id name
		var idSafe = function(text) {
			text = text.replace(badIdPattern, "-");
			return text;
		};

		// check if a path item is rectangular or oval
		// rectangle and oval can be rendered as a DIV, reducing the # of SVGs
		var SHAPE = {
			NONE: 0,
			RECT: 1,
			OVAL: 2
		};
		var classifyShape = function(pathItem) {
			// tolerance < .1%
			var epsilon = 0.001;

			if (pathItem.pathPoints.length != 4) return SHAPE.NONE;

			var x = pathItem.geometricBounds[0],
				y = -pathItem.geometricBounds[1],
				w = pathItem.geometricBounds[2] - pathItem.geometricBounds[0],
				h = -pathItem.geometricBounds[3] + pathItem.geometricBounds[1];

			if (w < epsilon || h < epsilon) return SHAPE.RECT;

			if (equal(w * h, pathItem.area)) {
				return SHAPE.RECT;
			}
			if (equal(w * h * Math.PI / 4, pathItem.area)) {
				return SHAPE.OVAL;
			}
			return SHAPE.NONE;

			function equal(a, b) {
				return Math.abs(a / b - 1) < epsilon;
			}
		}

		// convert path item to SVG path data
		var getPathData = function(pathItem, offset_x, offset_y) {
			var path_data = "";

			var pts = pathItem.pathPoints;
			var pt, pt0;
			for (var pt_index = 0; pt_index <= pts.length; pt_index++) {
				if (pt_index == pts.length) {
					if (pathItem.closed) {
						pt = pts[0];
					} else {
						break;
					}
				} else {
					pt = pts[pt_index];
				}

				if (pt_index == 0) {
					path_data += "M";
					path_data += coords(pt.anchor);
				} else if (pt.pointType == "PointType.CORNER" && pt0.pointType == "PointType.CORNER") {
					path_data += "L";
					path_data += coords(pt.anchor);
				} else {
					path_data += "C";
					path_data += coords(pt0.rightDirection);
					path_data += coords(pt.leftDirection);
					path_data += coords(pt.anchor);
				}

				pt0 = pt;
			}
			if (pathItem.closed) {
				path_data += "z";
			}
			return path_data;

			function coords(point) {
				return Math.round((point[0] - offset_x) * 100) / 100 + " " + Math.round((-point[1] - offset_y) * 100) / 100 + " ";
			}
		}


		// css styles
		var StyleManager = function() {

			var textStyles = {},
				shapeStyles = {},
				textStyleCount = 0,
				shapeStyleCount = 0;

			var fontWeights = [
				{ pattern: /extra light|ultra light/i, weight: 100 },
				{ pattern: /extra black|ultra black/i, weight: 900 },
				{ pattern: /extra bold|black|heavy/i, weight: 800 },
				{ pattern: /normal|regular/i, weight: 400 },
				{ pattern: /semilight/i, weight: 300 },
				{ pattern: /semibold/i, weight: 600 },
				{ pattern: /light/i, weight: 200 },
				{ pattern: /bold/i, weight: 700 },
				{ pattern: /medium/i, weight: 500 }
			]

			// convert Illustrator styles of a text frame to CSS
			this.getTextStyle = function(textFrame, paragraph_index) {
				var paragraph = textFrame.paragraphs[paragraph_index];
				var sampleChar = paragraph.characters[Math.round(paragraph.length / 2) - 1];

				var key = {
					"family": sampleChar.textFont.family,
					"style": sampleChar.textFont.style,
					"size": Math.round(sampleChar.size * 10) / 10,
					"caps": sampleChar.capitalization.toString(),
					"color": _.toColor(sampleChar.fillColor),
					"tracking": sampleChar.tracking / 1000,
					"leading": Math.round(paragraph.leading * 10) / 10,
					"before": Math.round(paragraph.paragraphAttributes.spaceBefore * 10) / 10,
					"after": Math.round(paragraph.paragraphAttributes.spaceAfter * 10) / 10,
					"just": paragraph.justification.toString(),
				};

				keyString = JSON.stringify(key);

				// use existing key if possible
				if (!textStyles[keyString]) {
					var style = {
						"font-size": key.size + "px",
						"line-height": key.leading + "px",
						"padding-top": key.before + "px",
						"padding-bottom": key.after + "px",
						"letter-spacing": key.tracking * key.size + "px",
						"color": key.color,
						"margin": 0
					};

					if (key.caps == "FontCapsOption.ALLCAPS" || key.caps == "FontCapsOption.SMALLCAPS") style["text-transform"] = "uppercase";
					else style["text-transform"] = "none";

					if (key.just == "Justification.LEFT") style["text-align"] = "left";
					else if (key.just == "Justification.RIGHT") style["text-align"] = "right";
					else if (key.just == "Justification.CENTER") style["text-align"] = "center";
					else style["text-align"] = "justify";

					style["font-family"] = key.family;

					for(var i=0; i<fontWeights.length; i++) {
						var w = fontWeights[i];
						if(w.pattern.test(key.style)) {
							style["font-weight"] = w.weight;
							break;
						}
					}

					if (key.style.search(/italic/i) >= 0) {
						style["font-style"] = "italic";
					}

					textStyles[keyString] = {
						name: "textStyle-" + (textStyleCount++),
						css: style
					};
				}

				return textStyles[keyString];
			}

			// convert Illustrator styles of a path item to CSS
			this.getShapeStyle = function(obj) {

				var key = {
					"stroked": obj.stroked,
					"stroke": _.toColor(obj.strokeColor),
					"width": Math.round(obj.strokeWidth * 10) / 10,
					"cap": obj.strokeCap.toString(),
					"join": obj.strokeJoin.toString(),
					"dash": obj.strokeDashes,
					"filled": obj.filled,
					"fill": _.toColor(obj.fillColor),
					"opacity": obj.opacity / 100
				}

				keyString = JSON.stringify(key);

				// use existing key if possible
				if (!shapeStyles[keyString]) {
					var style = {};

					if (key.stroked == true) {
						style["stroke"] = key.stroke;
						style["stroke-opacity"] = 1;
						style["stroke-width"] = key.width + "px";
						style["border-width"] = key.width + "px";
						style["border-color"] = key.stroke;

						if (key.dash.length) {
							var dashsize = key.dash[0];
							style["border-style"] = dashsize >= key.width * 2 ? "dashed" : "dotted";
							style["stroke-dasharray"] = key.dash.join(",");
						} else {
							style["border-style"] = "solid";
						}

						if (key.cap == "StrokeCap.BUTTENDCAP") style["stroke-linecap"] = "butt";
						else if (key.cap == "StrokeCap.ROUNDENDCAP") style["stroke-linecap"] = "round";
						else if (key.cap == "StrokeCap.PROJECTINGENDCAP") style["stroke-linecap"] = "square";

						if (key.join == "StrokeJoin.BEVELENDJOIN") style["stroke-linejoin"] = "bevel";
						else if (key.join == "StrokeJoin.ROUNDENDJOIN") style["stroke-linejoin"] = "round";
						else if (key.join == "StrokeJoin.MITERENDJOIN") style["stroke-linejoin"] = "miter";

					} else {
						style["stroke-opacity"] = 0;
						style["border-style"] = "none";
					}
					if (key.filled == true) {
						style["fill"] = key.fill;
						style["fill-opacity"] = 1;
						style["background"] = key.fill;
					} else {
						style["fill-opacity"] = 0;
						style["background"] = "none";
					}

					style["opacity"] = key.opacity;

					shapeStyles[keyString] = {
						name: "shapeStyle-" + (shapeStyleCount++),
						css: style
					};
				}

				return shapeStyles[keyString];
			}

			this.all = function() {
				var styles = {};
				for (var i in textStyles) {
					styles[textStyles[i].name] = textStyles[i].css;
				}
				for (var i in shapeStyles) {
					styles[shapeStyles[i].name] = shapeStyles[i].css;
				}
				return styles;
			}

		}

		// process a document to output-ready format
		// returns the path to the entry point HTML
		var DocumentParser = function() {
			var itemHash = {};
			var docRoot,
				pageItemNodes;
			var rasterImageNodes = {};
			var sourceDoc;

			var NAMESPACE = {
				FLEXIBLE: 0,
				HTML: 1,
				SVG: 2,
				MIXED: 4
			};
			var NON_TYPES = ["LegacyTextItem", "GraphItem", "MeshItem", "NonNativeItem", "PluginItem"];

			var me = this;

			this.artboards = [];
			this.states = [];
			this.embeddedFiles = {};
			this.styles = new StyleManager();
			this.keyframes = {};

			this.parse = function(doc) {
				sourceDoc = doc;

				docRoot = itemToTree(doc);
				pageItemNodes = docRoot.getNodes();

				for (var i = 0; i < pageItemNodes.length; i++) {
					var node = pageItemNodes[i];
					if (node.type == "PathItem") {
						var shape = itemHash[node.path].shape;
						if (shape == SHAPE.RECT) {
							node.type = "RectShapeItem";
						} else if (shape == SHAPE.OVAL) {
							node.type = "CircleShapeItem";
						}
					}
				}

				this.states = this.states.unique();
				var tempLayer = sourceDoc.layers.add();				

				for (var abNumber = 0; abNumber < doc.artboards.length; abNumber++) {

					doc.artboards.setActiveArtboardIndex(abNumber);
					var activeArtboard = doc.artboards[abNumber];
					var sceneName = activeArtboard.name.match(/^\S*/i)[0];
					var activeArtboardRect = activeArtboard.artboardRect;
					var abL = activeArtboardRect[0],
						abT = -activeArtboardRect[1],
						abR = activeArtboardRect[2],
						abB = -activeArtboardRect[3];
					var abW = Math.round(abR - abL);
					var abH = Math.round(abB - abT);

					var artboardItemNodes = [];

					// sort items into artboards
					for (var i = 0; i < pageItemNodes.length; i++) {
						var thisNode = pageItemNodes[i];
						var thisItem = thisNode.instance;

						if (thisNode.type == "Document") continue;

						// include item if it overlaps with the artboard, or belongs to a group that overlaps with the artboard
						if (thisItem.visibleBounds) {
							var l = thisItem.visibleBounds[0];
							var t = -thisItem.visibleBounds[1];
							var r = thisItem.visibleBounds[2];
							var b = -thisItem.visibleBounds[3];

							if ((thisNode.parent && thisNode.parent.inArtboard) || (l <= abR && r >= abL && t <= abB && b >= abT)) {
								// in artboard bounds
								artboardItemNodes.push(thisNode);
								thisNode.inArtboard = true;
							} else {
								thisNode.inArtboard = false;
							}
						} else {
							// is layer
							artboardItemNodes.push(thisNode);
						}
					};

					// process all items on the artboard
					for (var i = 0; i < artboardItemNodes.length; i++) {
						var thisNode = artboardItemNodes[i];
						var thisItem = thisNode.instance;

						var keyframe = {};
						var key = abNumber;
						if (thisNode.states) {
							key += ":" + thisNode.states.join(":");
						}

						thisNode.keyframes[key] = keyframe;

						if (thisItem.visibleBounds) {
							
							if(thisNode.rotation != null) {
								keyframe.transform = "rotate(" + Math.round(-thisNode.rotation) +"deg)";
							}
							if(thisNode.rotation) {
								var dx = (thisItem.visibleBounds[0] + thisItem.visibleBounds[2])/2,
									dy = (thisItem.visibleBounds[1] + thisItem.visibleBounds[3])/2;
								thisItem = thisItem.duplicate(tempLayer, ElementPlacement.INSIDE);
								thisItem.rotate(-thisNode.rotation);
								dx -= (thisItem.visibleBounds[0] + thisItem.visibleBounds[2])/2,
								dy -= (thisItem.visibleBounds[1] + thisItem.visibleBounds[3])/2;
								thisItem.translate(dx, dy);
							}

							var bounds = [
								Math.round(thisItem.visibleBounds[0] - abL), // left
								Math.round(-thisItem.visibleBounds[1] - abT), // top
								Math.round(thisItem.visibleBounds[2] - thisItem.visibleBounds[0]), // width
								Math.round(-thisItem.visibleBounds[3] + thisItem.visibleBounds[1]) // height
							];

							keyframe._rect = [
								bounds[0], bounds[1], bounds[0] + bounds[2], bounds[1] + bounds[3]
							];

							// use position relative to parent
							var parentL = 0,
								parentT = 0,
								svgTransL = 0,
								svgTransT = 0;
							var parent = thisNode.isClipPath ? thisNode.parent.parent : thisNode.parent;

							if (parent && parent.instance.visibleBounds) {
								parentL = Math.round(parent.instance.visibleBounds[0] - abL);
								parentT = Math.round(-parent.instance.visibleBounds[1] - abT);
							}
							if (thisNode.isClipPath) {
								svgTransL = -(Math.round(thisNode.parent.instance.visibleBounds[0] - abL) - parentL);
								svgTransT = -(Math.round(-thisNode.parent.instance.visibleBounds[1] - abT) - parentT);
							}
						}

						if (thisNode.actions) keyframe._act = thisNode.actions;
						if (thisNode.options) {
							keyframe._opt = thisNode.options;
						}

						if (thisNode.type == "Layer") {
							keyframe.opacity = thisItem.opacity / 100;
						} else if (thisNode.type == "GroupItem") {
							keyframe.opacity = thisItem.opacity / 100;
							keyframe.left = (bounds[0] - parentL) + "px";
							keyframe.top = (bounds[1] - parentT) + "px";
							keyframe.width = bounds[2] + "px";
							keyframe.height = bounds[3] + "px";
							keyframe["svg-transform"] = "translate(" + (bounds[0] - parentL) + " " + (bounds[1] - parentT) + ")";

							delete keyframe._rect;
						} else if (thisNode.type == "TextFrame") {

							keyframe._content = [];
							for (var k = 0; k < thisItem.paragraphs.length; k++) {
								var paragraph = keyframe._content[k] = {};

								if (thisItem.paragraphs[k].characters.length != 0) {
									var style = me.styles.getTextStyle(thisItem, k);
									paragraph._base = style.name;

									if (isNaN(thisItem.paragraphs[k].length)) {
										paragraph.text = "&nbsp;";
									} else {
										textToClean = thisItem.paragraphs[k].contents;
										cleanedText = _.escapeHTML(textToClean);
										paragraph.text = cleanedText;
									};
								} else {
									paragraph.text = "&nbsp;";
								};
							};

							var sampleChar = thisItem.characters[0];
							var l = bounds[0],
								t = Math.round(-thisItem.position[1] - (((sampleChar.leading - sampleChar.size) / 2) + sampleChar.spaceBefore) - abT),
								w = bounds[2];

							if (thisItem.kind == "TextType.POINTTEXT") {
								var offset = Math.ceil(w / 50);

								if (sampleChar.justification == "Justification.RIGHT") {
									l -= offset;
								} else if (sampleChar.justification == "Justification.CENTER") {
									l -= (offset / 2);
									keyframe.marginLeft = (-offset / 2) + "px";
								}
								w += offset;
							}

							keyframe.opacity = thisItem.opacity / 100;
							keyframe.top = (t - parentT) + "px";
							keyframe.left = (l - parentL) + "px";
							keyframe.width = w + "px";
							keyframe.height = bounds[3] + "px";

						} else if (thisNode.type == "RectShapeItem" || thisNode.type == "CircleShapeItem") {
							var style = me.styles.getShapeStyle(thisItem);
							keyframe._base = style.name;

							if (thisNode.type == "RectShapeItem") {
								keyframe["svg-x"] = bounds[0] - parentL;
								keyframe["svg-y"] = bounds[1] - parentT;
								keyframe["svg-width"] = bounds[2];
								keyframe["svg-height"] = bounds[3];
							} else {
								keyframe["svg-cx"] = bounds[0] + bounds[2] / 2 - parentL;
								keyframe["svg-cy"] = bounds[1] + bounds[3] / 2 - parentT;
								keyframe["svg-rx"] = bounds[2] / 2;
								keyframe["svg-ry"] = bounds[3] / 2;
								keyframe["border-radius"] = (bounds[2] / 2) + "px /" + (bounds[3] / 2) + "px";
							}

							// rect or circle
							keyframe.left = (bounds[0] - parentL) + "px";
							keyframe.top = (bounds[1] - parentT) + "px";
							keyframe.width = bounds[2] + "px";
							keyframe.height = bounds[3] + "px";
							if (thisNode.isClipPath) keyframe["svg-transform"] = "translate(" + svgTransL + " " + svgTransT + ")";

						} else if (thisNode.type == "PathItem" || thisNode.type == "CompoundPathItem") {


							var l = thisItem.geometricBounds[0],
								t = -thisItem.geometricBounds[1];
							var path_data = "";

							if (thisNode.type == "PathItem") {
								path_data = getPathData(thisItem, l, t);
							} else {
								for (var k = 0; k < thisItem.pathItems.length; k++) {
									path_data += getPathData(thisItem.pathItems[k], l, t);
								}
							}

							var style = me.styles.getShapeStyle(thisNode.type == "CompoundPathItem" ? thisItem.pathItems[0] : thisItem);
							keyframe._base = style.name;
							keyframe["svg-transform"] = "translate(" + Math.round(l - abL - parentL) + " " + Math.round(t - abT - parentT) + ")";
							keyframe["svg-d"] = path_data;

							if (thisNode.isClipPath) {
								keyframe["svg-transform"] += " translate(" + svgTransL + " " + svgTransT + ")";
							}
						} else if (thisNode.type == "PlacedItem" || thisNode.type == "RasterItem" || thisNode.type == "SymbolItem") {

							if (thisNode.type == "SymbolItem") {
								thisNode.imgSrc = idSafe(thisItem.symbol.name) + imageExtension;
							} else {
								try {
									thisNode.imgSrc = thisItem.file.name;
								} catch (err) {
									// embedded image may not have a file associated with it
									thisNode.imgSrc = thisNode.path + imageExtension;
								}
							}
							addRasterImage(thisNode);

							keyframe.opacity = thisItem.opacity / 100;
							keyframe["svg-x"] = (bounds[0] - parentL);
							keyframe["svg-y"] = (bounds[1] - parentT);
							keyframe["svg-width"] = bounds[2];
							keyframe["svg-height"] = bounds[3];

							keyframe.left = (bounds[0] - parentL) + "px";
							keyframe.top = (bounds[1] - parentT) + "px";
							keyframe.width = bounds[2] + "px";
							keyframe.height = bounds[3] + "px";

						} else if (thisNode.type == "EmbeddedProto") {

							keyframe.opacity = thisItem.opacity / 100;
							keyframe.left = (bounds[0] - parentL) + "px";
							keyframe.top = (bounds[1] - parentT) + "px";
							keyframe.width = bounds[2] + "px";
							keyframe.height = bounds[3] + "px";
						}

						if(thisItem != thisNode.instance) thisItem.remove();
					};

					me.artboards[abNumber] = {
						scene: sceneName,
						width: abW,
						height: abH
					};
					artboardCount++;

				}; // end artboard loop

				tempLayer.remove();

				// collect all keyframes
				for (var i in itemHash) {
					var inn = itemHash[i];
					if (_.isEmpty(inn.keyframes)) continue;
					me.keyframes[itemHash[inn.parent.path].shortPath + " " + inn.shortPath] = inn.keyframes;
				}

			}

			this.toHTML = function() {				
				var domRoot = makeDOM(null, docRoot);
				var emptyNodes = domRoot.descendants();
				for (var i = 0; i < emptyNodes.length(); i++) {
					var div = emptyNodes[i];
					if (div.elements().length() == 0) {
						// force remove all self-closing tags
						div.appendChild(new XML("<empty/>"));
					}
				}
				return domRoot.toXMLString().replace(/\s*\<empty\/\>\s*/g, "");
			}

			this.exportImages = function(dest_folder) {

				// hide all the top layers
				for(var i = 0; i < docRoot.children.length; i++) {
					var node = docRoot.children[i];					
					node.instance.locked = false;
					isHidden(node.instance, true);
				}

				// add temporary layer
				var tempLayer = sourceDoc.layers.add();

				for(var src in rasterImageNodes) {
					var node = rasterImageNodes[src];
					var targetPath = dest_folder + src;

					try {
						// copy source file if available
						var file = node.instance.file;
						if (file.exists) {
							node.instance.file.copy(targetPath);
							continue;
						}
					} catch (err) {}

					// otherwise, make a temporary copy of the item, set up for export
					var dup = node.instance.duplicate(tempLayer, ElementPlacement.INSIDE);
					dup.locked = false;
					dup.hidden = false;
					dup.opacity = 100;
					if(node.rotation) dup.rotate(-node.rotation);

					_.exportToImage(targetPath, docSettings);

					dup.remove();
				}
				// remove temporary layer
				tempLayer.remove();

				// restore all the top layers
				for(var i = 0; i < docRoot.children.length; i++) {
					var node = docRoot.children[i];					
					if(!node.hidden) isHidden(node.instance, false);
					if(node.locked) node.instance.locked = true;
				}
			}

			// determine whether node needs to be rendered as SVG
			function getNamespace(node) {

				var result = NAMESPACE.FLEXIBLE;
				if (node.type == "TextFrame" || node.type == "EmbeddedProto") {
					result = NAMESPACE.HTML;
				}
				else if (node.type == "PathItem" || node.type == "CompoundPathItem") {
					result = NAMESPACE.SVG;
				}
				else if (node.children) {
					for (var i = 0; i < node.children.length; i++) {
						var sr = getNamespace(node.children[i]);
						if (!result) {
							result = sr;
						} else if (sr && result != sr) {
							result = NAMESPACE.MIXED;
							break;
						}
					}
				}
				return result;
			}

			// recursively generate the DOM tree
			function makeDOM(container, node, is_svg) {

				var obj;
				var classname = [];

				if (_.isEmpty(node.keyframes) && node.type.search("Document|Layer") != 0) return null;

				var uniqueKeyframes = {};

				for (var k in node.keyframes) {
					var keyframe = node.keyframes[k];
					for (var key in keyframe) {
						var del = false;
						if (is_svg) {
							del = (key.search("border|left|top|width|height") == 0);
						} else {
							del = (key.search("svg-|stroke|fill") == 0);
						}
						if (del) delete keyframe[key];
					}

					var json = JSON.stringify(keyframe);
					if (uniqueKeyframes[json]) node.keyframes[k] = uniqueKeyframes[json];
					else uniqueKeyframes[json] = k;
				}

				switch (node.type) {
					case "Document":
					case "Layer":
					case "GroupItem":
						if (is_svg) {
							obj = new XML("<g/>");
						} else {
							obj = new XML("<div/>");
						}
						if (container) container.appendChild(obj);

						if (node.children) {
							var sub_ctn = obj,
								sub_ctn_svg = is_svg;
							for (var i = 0; i < node.children.length; i++) {
								var child = node.children[i];
								if (itemHash[child.path] != child) continue;

								var ns = getNamespace(child);

								if (ns == NAMESPACE.SVG) {
									if (!sub_ctn_svg) {
										sub_ctn = new XML("<svg/>");
										obj.appendChild(sub_ctn);
										sub_ctn_svg = true;
									}
								} else if (ns == NAMESPACE.HTML || ns == NAMESPACE.MIXED) {
									if (sub_ctn_svg) {
										sub_ctn = obj;
										sub_ctn_svg = false;
									}
								}
								makeDOM(sub_ctn, child, sub_ctn_svg);
							}
						}
						break;

					case "TextFrame":
						obj = new XML("<div/>");
						container.appendChild(obj);
						break;

					case "PathItem":
					case "CompoundPathItem":
						obj = new XML("<path/>");
						if (node.isClipPath) {
							// warning
							message.warning("Irregular clipping of " + node.parent.path + " may not be rendered correctly in Edge.");

							var def = new XML("<clipPath />");
							def.@id = node.shortPath + "_cp";
							container.appendChild(def);
							def.appendChild(obj);
						} else {
							container.appendChild(obj);
						}
						break;

					case "RectShapeItem":
					case "CircleShapeItem":
						if (is_svg) {
							var tagname;
							if (node.type == "RectShapeItem") {
								obj = new XML("<rect/>");
							} else {
								obj = new XML("<ellipse/>");
							}

							if (node.isClipPath) {
								var def = new XML("<clipPath />");
								def.@id = node.shortPath + "_cp";
								container.appendChild(def);
								def.appendChild(obj);
							} else {
								container.appendChild(obj);
							}
						} else {
							obj = new XML("<div/>");
							if (node.isClipPath) {
								var p = container.parent();
								p.replace(container.childIndex(), obj);
								var sub_obj = new XML("<div/>");
								obj.appendChild(sub_obj);
								sub_obj.appendChild(container);
							} else {
								container.appendChild(obj);
							}
						}
						break;

					case "PlacedItem":
					case "RasterItem":
					case "SymbolItem":
						if (is_svg) {
							obj = new XML('<image xlink:href="' + node.imgSrc + '"/>');
						} else {
							obj = new XML("<div/>");
							obj.@style = "background-image: url(" + node.imgSrc + ")";
						}
						container.appendChild(obj);
						break;

					case "EmbeddedProto":
						var name = node.instance.file.name.replace(/\.\w+$/, "");
						me.embeddedFiles[name] = node.instance.file;

						obj = new XML('<iframe />');
						obj.@["data-src"] = name + "/index.html";
						obj.@frameBorder = "0";
						obj.@allowTransparency = "true";
						container.appendChild(obj);
						break;
				}

				if (obj) {
					objectCount++;

					if (node.isButton) {
						classname.push("button");
						buttonCount++;
					}
					if (node.isClipPath) {
						obj.@["data-clip-path"] = "true";
					}
					if (node.name && node.name.length > 0) {
						if (badNamePattern.test(node.name)) message.warning("Object name contains illegal characters: @ (space) . / \"");
						obj.@["data-name"] = node.name;
					}

					if (classname.length > 0) obj.@class = classname.join(" ");
					obj.@id = node.shortPath;
				}

				return obj;

			}

			// recursively build the item tree of this document
			function itemToTree(obj, path, z_index, states) {

				var is_hidden = isHidden(obj);

				// skip non-objects
				if (
					obj.name == "<PrototypeSettings>" // settings storage layer
					|| is_hidden // hidden
					|| (obj.typename == "TextFrame" && obj.characters.length == 0) // empty text
					|| (NON_TYPES.indexOf(obj.typename) >= 0 ) // item type not supported
				) return null;

				var node = new TreeNode();
				var children = [];
				var name;
				var rotation = (obj.tags && obj.tags.length > 0 &&
						obj.tags[0].name == "BBAccumRotation")? obj.tags[0].value / Math.PI*180 : 0;

				node.instance = obj;
				node.type = (obj.typename == "PlacedItem" && obj.file && obj.file.name.match(/\.(ai|pdf)$/)) ? "EmbeddedProto" : obj.typename;
				node.hidden = is_hidden;
				node.locked = obj.locked;
				node.isClipPath = obj.clipping;
				node.isButton = false;
				node.zIndex = -(z_index || 0);

				if (node.type == "Document") {
					name = "root";
				} else {
					// parse the object name
					var tags = obj.name.match(tagPattern);
					if (tags != null) {

						for (var i = 0; i < tags.length; i++) {
							var tag_parts = tags[i].match(tagParameterPattern);
							var a = tag_parts[1],
								p = tag_parts[3];

							if (a == docSettings.buttonTag) {
								// is button
								node.isButton = true;
								if (p) {
									var options = p.split(" ");
									if (!node.options) node.options = {};

									for (var j = 0; j < options.length; j++) {
										var option = options[j].split("-");
										node.options[option[0]] = option[1] || true;
									}
								}
							} else if (p) {
								// is trigger
								if (!node.actions) node.actions = {};
								node.actions[a] = p;
							} else {
								// is state
								if (!node.states) node.states = [];
								node.states.push(a);
								me.states.push(a);
							}
						}
					}
					if (states) {
						node.states = states.concat(node.states).unique();
					}
					node.name = obj.name.replace(tagPattern, "");
					name = idSafe(node.name);

					if (name.length == 0) {
						name = "Unnamed-" + z_index;
					}					
				}
				node.path = (path && path.length > 0 ? (path + "_") : "") + name;

				// merge with other instances of the same object
				if (itemHash[node.path]) {
					var that_node = itemHash[node.path]
					node.keyframes = that_node.keyframes;
					if (that_node.type != node.type) {
						message.warning('Object ' + node.path + " cannot be both " + node.type + " and " + that_node.type);
					}
					if (node.isButton) that_node.isButton = true;
				} else {
					node.keyframes = {};
					itemHash[node.path] = node;

					// compress path names if in production mode
					node.shortPath = debugMode ? node.path : _.uniqueId();
				}

				// special treatment	
				// Supporting: PathItem, PlacedItem, RasterItem, TextFrameItem, CompoundPathItem, SymbolItem
				switch(node.type) {
					case "PathItem":
						var path_shape = classifyShape(obj);
						if (itemHash[node.path].shape != null) {
							if (itemHash[node.path].shape != path_shape) {
								itemHash[node.path].shape = SHAPE.NONE;
							}
						} else {
							itemHash[node.path].shape = path_shape;
						}
						break;

					case "PlacedItem":
					case "RasterItem":
					case "SymbolItem":
					case "TextFrame":
						node.rotation = (rotation + 360) %360;
						break;
				}

				// parse through child items
				if (node.type == "Document" || node.type == "Layer") {
					for (var i = 0; i < obj.layers.length; i++) {
						children.push(obj.layers[i]);
					}
				}
				if (node.type == "Layer" || node.type == "GroupItem") {
					for (var i = 0; i < obj.pageItems.length; i++) {
						children.push(obj.pageItems[i]);
					}
				}

				for (var i = 0; i < children.length; i++) {
					var c_node = itemToTree(children[i], node.path, children.length - 1 - i, node.states);
					if (c_node) {
						itemHash[node.path].addChild(c_node, function(n) {
							return n.zIndex
						});
						c_node.parent = node;
					}
				}

				return node;
			}

			// export node to specified image format
			function addRasterImage(node) {
				var img = rasterImageNodes[node.imgSrc];

				if (img && img.instance.width >= node.instance.width) return;

				rasterImageNodes[node.imgSrc] = node;
			}

		} // end DocumentParser


		// main export workflow
		var exportDocument = function(doc, path_pattern, recurse_level) {
				var filename = doc.name.replace(/(.+)\.\w+$/, "$1").replace(/ /g, "-");
				var destFolder = path_pattern.replace("*", filename);
				var fResult;
				recurse_level = recurse_level || 0;

				// check for project folders
				fResult = _.createFolder(destFolder);
				if (fResult !== true) {
					message.error("The output folder could not be created: " + fResult);
				}
				// check for color space settings
				if (doc.documentColorSpace != "DocumentColorSpace.RGB") {
					message.error('Convert document color mode to "RGB" before running script. (File>Document Color Mode>RGB Color)');
				}

				// do not proceed with errors
				if (message.hasError) return;

				//========
				// start export
				//========

				var docParser = new DocumentParser();

				docParser.parse(doc);

				if (docSettings.export_image) {
					docParser.exportImages(destFolder);
				}

				var jsonDict = {
					artboards: docParser.artboards,
					states: docParser.states,
					settings: jsSettings,
					styles: docParser.styles.all(),
					keyframes: docParser.keyframes
				};

				// output js file

				var jsText = "";

				jsText += "// Generated by " + licenseInfo + " - " + dateTimeStamp + "\r" + "// From file: " + doc.name + "\r\r";
				jsText += "var proto_data = ";
				jsText += JSON.stringify(jsonDict, null, (debugMode ? "\t" : null)) + ";";

				fResult = _.writeToFile(jsText, destFolder + "data.js");
				if (fResult !== true) {
					message.error("Error writing data.js: " + fResult);
				}

				// output html file 

				var templateFolder = $.fileName.replace(/[\w]+.jsx$/, "template/");

				var relativeScriptPath = "";
				var i = recurse_level;
				while (i > 0) {
					relativeScriptPath += "../";
					i--;
				}

				var extensionScripts = "";
				var script_names = docSettings.custom_script.split(/[,;]\s*/);
				var filesToCopy = { 
					"data.js": null,
				};
				filesToCopy["monograph-" + versionNumber + ".css"] = templateFolder + "monograph-" + versionNumber + ".css";
				filesToCopy["monograph-" + versionNumber + ".min.js"] = templateFolder + "monograph-" + versionNumber + ".min.js";


				for (var i = 0; i < script_names.length; i++) {
					var name = script_names[i].match(/[^\\\/]*$/)[0];
					if (name.length > 0) {
						if (debugMode) {
							extensionScripts += '<script type="text/javascript" src="' + _.relativePath(destFolder, script_names[i]) + '"></script>\r';
						} else {
							while (name in filesToCopy) name = "_" + name;
							filesToCopy[name] = script_names[i];
							extensionScripts += '<script type="text/javascript" src="' + relativeScriptPath + name + '"></script>\r\t\t';
						}
					}
				}

				if (recurse_level == 0) {
					for(var i in filesToCopy) {
						if(filesToCopy[i]) {
							fResult = _.copyFile(filesToCopy[i], destFolder + i);
							if (fResult !== true) {
								message.error("Error copying " + i + ": " + fResult);
							}
						}
					}					
				}

				var htmlText = _.readFromFile(templateFolder + "index.html");
				if(htmlText) {
					htmlText = htmlText.replace(/\{\{file_name\}\}/g, filename)	// title
								.replace(/\{\{prod_path\}\}/g, relativeScriptPath)
								.replace(/\{\{dev_path\}\}/g, devServer)
								.replace(/\{\{script_version\}\}/g, versionNumber)
								.replace(/\{\{custom_scripts\}\}/g, extensionScripts)
								.replace(/\{\{license_info\}\}/g, licenseInfo + " - " + dateTimeStamp)
								.replace(new RegExp("\\s*\\{% block " + (debugMode ? "prod" : "dev") +  " %\\}.*?\\{% endblock %\\}", "mg"), "")	// footer
								.replace(/\s*\{%.*?%\}/g, "")
								.replace("{{html_body}}", docParser.toHTML());	// body
					fResult = _.writeToFile(htmlText, destFolder + "index.html");
					if (fResult !== true) {
						message.error("Error writing index.html: " + fResult);
					}
				}
				else {
					message.error("Error reading the template");
				}

				//========
				// end export
				//========

				// export embedded Illustrator files
				for (var name in docParser.embeddedFiles) {
					var file = docParser.embeddedFiles[name];
					var sub_doc,
						is_open = false;

					for (var j = 0; j < app.documents.length; j++) {
						sub_doc = app.documents[j];
						if (sub_doc.name == file.name && sub_doc.path == file.path) {
							is_open = true;
							sub_doc.activate();
							break;
						}
					}

					if (!is_open) sub_doc = app.open(file);

					exportDocument(sub_doc, destFolder + "*/", recurse_level + 1);

					if (!is_open) sub_doc.close(SaveOptions.DONOTSAVECHANGES);
				}

				doc.activate();

				return (destFolder + "index.html");
			} // end exportDocument

		// ===================
		// do the work
		// ===================

		// starts timer
		$.hiresTimer;

		// update settings objects with user values
		for (var key in docSettings) {
			if (exportSettings[key] !== undefined) {
				docSettings[key] = exportSettings[key];
			}
		}
		docSettings.output_path = docSettings.output_path.replace(/(^\/*)|(\/*$)/g, "/");

		for (var key in jsSettings) {
			if (exportSettings[key] !== undefined) {
				jsSettings[key] = exportSettings[key];
			}
		}

		// remember user settings for future
		Settings.write(exportSettings);

		// statistics
		var dateTimeStamp = (new Date()).toJSON().substr(0, 19).replace("T", " ");
		var objectCount = 0,
			artboardCount = 0,
			buttonCount = 0;

		if (thisDoc.path == null) {
			message.error('Save your Illustrator file before running this script!');
		} else {
			var entry_point = exportDocument(thisDoc, thisDoc.path + docSettings.output_path);
		}

		if (message.hasError) {
			// termination message
			message.show("The Script Stopped Because of an Error", licenseInfo);
		} else {
			// success message
			var runTime = ($.hiresTimer / 1000000).toFixed(3);
			message.info("Total objects: " + objectCount);
			message.info("Total buttons: " + buttonCount);
			message.info("Total artboards: " + artboardCount);
			message.info("Time: " + runTime + "s");
			message.show("Success!",
				licenseInfo, [{
					text: "Launch",
					onclick: function() {
						File(entry_point).execute();
					}
				}]);
		}

	} // end options window callback
})(); // end scope protect