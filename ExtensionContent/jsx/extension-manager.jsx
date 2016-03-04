#include "helper.jsxinc"

// functions for the extensions management UI

(function() {

	var versionNumber = $._ext_Monograph.version;
	var protoSettings;
	var scripts;
	var metadata;

	// reload all the extensions of the current document
	$._ext_Monograph.load_extensions = function() {
		var thisDoc = app.activeDocument;
		protoSettings = _.PrototypeSettings(thisDoc);
		scripts = [];
		metadata = {};

		var settings = protoSettings.read();

		if (settings.custom_script) {
			var script_paths = settings.custom_script.split(/[,;]\s*/);

			// load script metadata
			for (var i = 0; i < script_paths.length; i++) {
				var path = script_paths[i];
				scripts[i] = {
					"path": path,
					"error": loadMeta(path)
				};
			}

			protoSettings.write(settings);
		}

		dispatchEvent("extensionsLoaded", scripts);
	}

	// open a file picker to add new extension(s)
	$._ext_Monograph.add_extension = function() {
		var files = File.openDialog(
			"Choose Files",
			$.os.search("Windows") == 0 ? "*.js" :
			function(f) {
				return (f instanceof Folder) || f.name.substr(-3, 3) == ".js";
			},
			true
		);

		var new_scripts = [];
		for (var i = 0; i < files.length; i++) {
			var path = files[i].fullName;
			var exists = false;

			for (var j = 0; j < scripts.length; j++) {
				if (scripts[j].path == path) {
					exists = true;
					break;
				}
			}

			if (!exists) {
				var script = {
					"path": path,
					"error": loadMeta(path)
				}
				scripts.push(script);
				new_scripts.push(script);
			}
		}

		if (new_scripts.length) {
			updateSettings();
			dispatchEvent("extensionsAdded", new_scripts);
		}
	}

	// remove an extension
	$._ext_Monograph.remove_extension = function(path) {
		var index = -1;

		for (var i = 0; i < scripts.length; i++) {
			if (scripts[i].path == path) {
				index = i;
				break;
			}
		}

		if (index >= 0) {
			scripts.splice(index, 1);
			delete metadata[path];
			updateSettings();
			dispatchEvent("extensionsRemoved", [path]);
		}
	}

	// save extension settings to file
	function updateSettings() {
		var settings = protoSettings.read();
		var script_paths = [];

		for (var i = 0; i < scripts.length; i++) {
			script_paths[i] = scripts[i].path;
		}

		settings.custom_script = script_paths.join(";");
		settings.extension_meta = metadata;
		protoSettings.write(settings);
	}

	// read metadata from an extension file
	// returns error if any
	function loadMeta(filepath) {
		var script_text = _.readFromFile(filepath);

		if (script_text) {
			var script_meta = script_text.match(/\/\* MONOGRAPH EXTENSION\s*(.*?)\s*\*\//m);
			if (script_meta) {
				try {
					var meta = JSON.parse(script_meta[1]);
					metadata[filepath] = meta;

					// check compatibility
					if (meta.target && (versionNumber < meta.target[0] || versionNumber > meta.target[1])) {
						return "May not work with this version"
					}
				} catch (err) {
					return "Meta data is invalid";
				}
			} else if (metadata[filepath]) {
				delete metadata[filepath];
			}
			return null;
		}
		return "Cannot read file";
	}

	// send an event to the UI
	function dispatchEvent(type, data) {
		var mylib = new ExternalObject("lib:PlugPlugExternalObject");

		var eventObj = new CSXSEvent();
		eventObj.type = type;
		eventObj.data = JSON.stringify(data);
		eventObj.dispatch();
	}

})();