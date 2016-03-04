#include "helper.jsxinc"

// A script to toggle focus state of selected objects in Illustrator

(function() {
    
    if(app.documents.length == 0 ) {
        return;
    }

    var doc = app.activeDocument;
    var items;
    var statePattern = /:(\w+)(?!\()/g;

    if (doc.selection.length > 0) {
        items = doc.selection;
        
    } else {
        items = doc.layers;
    }

    var settings = {
        "focus": true,
        "hover": true,
        "press": true,
        "disabled": true,
        "controller": true,
        "keyboard": true,
        "mouse": true
    }
    apply(items, checkState);

    var deps = {};
    for(var id in settings) {
        deps[id] = onChange(id);
    }

    _.openDialog("Toggle Visibility", {
        flow: "horizontal",
        children: [
            {
                flow: "vertical",
                children: [{
                    name: "focus",
                    type: "checkbox",
                    value: settings.focus,
                    width: 24,
                    id: "focus",
                    deps: deps
                }, {
                    name: "hover",
                    type: "checkbox",
                    width: 24,
                    value: settings.hover,
                    id: "hover"
                }, {
                    name: "press",
                    type: "checkbox",
                    value: settings.press,
                    width: 24,
                    id: "press",
                }]
            }, {
                flow: "vertical",
                children: [{
                    name: "controller",
                    type: "checkbox",
                    value: settings.controller,
                    width: 24,
                    id: "controller",
                }, {
                    name: "keyboard",
                    type: "checkbox",
                    width: 24,
                    value: settings.keyboard,
                    id: "keyboard"
                }, {
                    name: "mouse",
                    type: "checkbox",
                    width: 24,
                    value: settings.mouse,
                    id: "mouse"
                }]
            }, {
                flow: "vertical",
                children: [{
                    name: "disabled",
                    type: "checkbox",
                    width: 84,
                    value: settings.disabled,
                    id: "disabled"
                }]
            }
        ]
    });

    function onChange(id) {
        return function(v) {
            settings[id] = v;
            apply(items, updateState);
            app.redraw();
            return true;
        }
    }    

    function apply(targets, func) {
        if(!targets) return;
        for (var i = 0; i < targets.length; i++) {
            var target = targets[i];
            func(target);

            apply(target.pageItems, func);
            apply(target.layers, func);
        } 
    }

    function checkState(item) {
        if ( (item.typename == "Layer" && !item.visible) || item.hidden) {
            var states = item.name.match(statePattern);
            if(!states) return;

            for(var i=0; i<states.length; i++) {
                var state_name = states[i].slice(1);
                if(settings[state_name]) settings[state_name] = false;
            }
        } 
    }

    function updateState(item) {
        if(!item.locked) {
            var states = item.name.match(statePattern);
            if(!states) return;

            var need_update = false,
                visible = true;
            for(var i=0; i<states.length; i++) {
                var state_name = states[i].slice(1);
                if(settings[state_name] === undefined) {
                    continue;
                }
                else {
                    need_update = true;
                    visible = visible && settings[state_name];
                }
            }
            if(need_update) {
                try {
                    if (item.typename == "Layer") {
                        item.visible = visible;
                    }
                    else {
                        item.hidden = !visible;
                    }
                } catch (err) {}
            }
        }
    }
})();