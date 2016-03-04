// Logic for the Monograph panel UI

(function() {
	var versionNumber = 1.42;

	// Get a reference to a CSInterface object
	var csInterface = new CSInterface();

	var extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION) + "/jsx/";
	var filesContainer = document.getElementById("extensions"),
		addFile = document.getElementById("add-ext"),
		files = {};
	var themeCSSLink;
	var debug_mode;

	/*---- init ----*/
	csInterface.evalScript('$._ext_Monograph.version=' + versionNumber);
	execJSX('extension-manager.jsx');

	document.querySelector("#add-ext button").onclick = function() {
		csInterface.evalScript('$._ext_Monograph.add_extension()');
	}

	document.getElementById("rename-btn").onclick = function() {
		execJSX('rename.jsx');
	};

	document.getElementById("toggle-btn").onclick = function() {
		execJSX('toggle.jsx');
	};

	document.getElementById("export-btn").onclick = function() {
		execJSX('export.jsx');
	};

    // Debug event to log event data and data types to console
	csInterface.addEventListener("debug", function(evt) {
	    var data = JSON.parse(evt.data);
	    console.log(typeof(data) + ': ' + data);
	});

	csInterface.addEventListener("documentAfterActivate", function(evt) {
		// reload extensions of the new active document
		csInterface.evalScript('$._ext_Monograph.load_extensions()');
	});

	csInterface.addEventListener("extensionsLoaded", function(evt) {
		for (var i in files) {
			removeExtFile(i);
		}
		var data = (evt.data instanceof String)? JSON.parse(evt.data) : evt.data;
		for (var i = 0; i < data.length; i++) {
			addExtFile(data[i]);
		}
	});

	csInterface.addEventListener("extensionsAdded", function(evt) {
	    var data = (evt.data instanceof String) ? JSON.parse(evt.data) : evt.data;
		for (var i = 0; i < data.length; i++) {
			addExtFile(data[i]);
		}
	});

	csInterface.addEventListener("extensionsRemoved", function(evt) {
	    var data = (evt.data instanceof String) ? JSON.parse(evt.data) : evt.data;
		for (var i = 0; i < data.length; i++) {
			removeExtFile(data[i]);
		}
	});

	csInterface.addEventListener("com.adobe.csxs.events.flyoutMenuClicked", function(evt) {
		// force refresh
		switch (evt.data.menuId) {
			case "refresh":
				window.location.reload();
				break;
			case "debug_mode":
				setDebugMode(!debug_mode);
				break;
		}
	});

	csInterface.evalScript('$._ext_Monograph.load_extensions()');
	updateThemeWithAppSkinInfo();
	// contextual menu
	csInterface.setPanelFlyoutMenu('<Menu>'
		+ '<MenuItem Id="refresh" Label="Refresh" Enabled="true" Checked="false"/>'
		+ '<MenuItem Id="debug_mode" Label="Debug mode" Enabled="true" Checkable="true" Checked="false"/>'
		+ '<MenuItem Id="about" Label="Monograph v' + versionNumber + '" Enabled="false" Checked="false"/>'
		+ '</Menu>');
	setDebugMode(false);

	/*---- end init ----*/

	// display one line of extension file
	function addExtFile(file) {
		var path = file.path;
		var obj = document.createElement("div");
		obj.className = "file";

		if(file.error) {
			obj.className += " invalid";
			obj.title = file.error;
		}

		var span = document.createElement("span");
		span.innerHTML = path.match(/[^\\\/]+$/)[0];
		obj.appendChild(span);

		var btn = document.createElement("button");
		btn.className = "topcoat-button--quiet icomatic";
		btn.innerHTML = '\ue011';
		obj.appendChild(btn);
		btn.onclick = function() {
			csInterface.evalScript('$._ext_Monograph.remove_extension("' + path + '")');
		}

		filesContainer.insertBefore(obj, addFile);
		files[path] = obj;
	}

	// remove one line of extension file
	function removeExtFile(path) {
		if (files[path]) {
			filesContainer.removeChild(files[path]);
			delete files[path];
		}
	}

	// choose the color theme to display
	function updateThemeWithAppSkinInfo() {
		var skinInfo = csInterface.hostEnvironment.appSkinInfo;
		var bgColor = skinInfo.panelBackgroundColor.color;
		var bgColorStr = "rgb(" + Math.round(bgColor.red) + "," + Math.round(bgColor.green) + "," + Math.round(bgColor.blue) + ")";

		var items = document.querySelectorAll(".bg");
		for (var i = 0; i < items.length; i++) {
			items[i].style.background = bgColorStr;
		}

		var theme = (bgColor.red + bgColor.green + bgColor.blue) / 3 < 128 ? "dark" : "light";

		if (themeCSSLink) {
			document.head.removeChild(themeCSSLink);
		}

		themeCSSLink = document.createElement("link")
		themeCSSLink.setAttribute("rel", "stylesheet")
		themeCSSLink.setAttribute("type", "text/css")
		themeCSSLink.setAttribute("href", "css/topcoat-desktop-" + theme + ".css");
		document.head.insertBefore(themeCSSLink, document.head.childNodes[0]);

		document.body.setAttribute("data-theme", theme);
	}

	// execute a jsx file
	function execJSX(path) {
		csInterface.evalScript('$._ext_Monograph.evalFile("' + extensionRoot + path + '")');
	}

	function setDebugMode(value) {
		debug_mode = value;
		csInterface.updatePanelMenuItem("Debug mode", true, debug_mode);
		csInterface.evalScript('$._ext_Monograph.debugMode=' + debug_mode);
	}

})();