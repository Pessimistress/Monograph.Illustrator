#include "helper.jsxinc"

// A script to rename Illustrator objects for prototyping

(function() {
    // warnings and informational messages
    var message = new MessageCenter();

    if (app.documents.length == 0) {
        return;
    }
    var doc = app.activeDocument,
        selection = doc.selection;
    var name;
    var target;

    if (selection.length == 0) {
        // nothing selected
        return message.show("Select the item to rename", "");
    } else if (selection.length == 1) {
        // target selected item
        target = selection[0];
        name = target.name;
    } else {
        // check if it's layer selection
        var error = "Select only one item to rename";
        for (var i = 0; i < selection.length; i++) {
            var obj = selection[i].parent;
            if (obj.typename != "Layer") {
                return message.show(error, "");
            } else if (!target) {
                target = obj;
                name = target.name;
            } else if (target != obj) {
                return message.show(error, "");
            }
        }
        var items = target.pageItems;
        for (var i = 0; i < items.length; i++) {
            var obj = items[0];
            if (!obj.selected) {
                return message.show(error, "");
            }
        }
    }

    var protoSettings = _.PrototypeSettings(doc);
    var extensionMetadata = protoSettings.read().extension_meta;

    var settings = {};

    var TRIGGERS = {
        "render": ["load"],
        "controller": "A B X Y L R U D LB RB LT RT Menu View dblY".split(" "),
        "keyboard": "L R U D ENTER SPACE BACK ESC AKey BKey CKey DKey EKey FKey GKey HKey IKey JKey KKey LKey MKey NKey OKey PKey QKey RKey SKey TKey UKey VKey WKey XKey YKey ZKey D0 D1 D2 D3 D4 D5 D6 D7 D8 D9".split(" "),
        "mouse": ["MLB", "MRB", "dblMLB"],
        "touch": ["TAP", "HOLD", "PAN", "SWIPEL", "SWIPER", "SWIPEU", "SWIPED", "PINCH"]
    }
    var TRIGGER_TYPES = [];
    var ACTIONS = ["goto", "focus", "back", "set", "unset", "toggle", "enable", "disable", "toggle-enable", "wait", "tell", "move", "do"];

    // add triggers and actions from extensions
    if(extensionMetadata) {
        for(var i in extensionMetadata) {
            var meta = extensionMetadata[i];
            var extension = meta.name;
            if(extension) {                
                if(meta.triggers) {
                    if(TRIGGERS[extension]) {
                        TRIGGERS[extension] = TRIGGERS[extension].concat(meta.triggers).unique();
                    }
                    else {
                        TRIGGERS[extension] = meta.triggers;
                    }
                }
                if(meta.actions) {
                    ACTIONS = ACTIONS.concat(meta.actions).unique();
                }
            }
        }
    }
    for(var i in TRIGGERS) {
        TRIGGER_TYPES.push(i);
    }

    var trigger_index = 0;
    var TEMPLATE = function(type, tag, action) {
        var id = "trigger_" + (trigger_index++);
        var tags;
        var actions = [];
        var action_index = 0;

        if (action) {
            actions = action.split(/,\s*/);
            for (var i = 0; i < actions.length; i++) {
                actions[i] = actionTemplate(actions[i]);
            }
        }
        actions.push(actionTemplate());

        function addAction() {
            var d = actionTemplate();
            actions.push(d);
            API.add(API.get(id + "_actions").control, d);
        }

        function removeAction(d) {
            var index = actions.indexOf(d);
            if (index >= 0) {
                actions.splice(index, 1);
            }
            API.remove(d.id);
        }

        function actionTemplate(a) {
            var command, parameters;
            if (a) {
                var tokens = a.match(/^(\S+)( (.*))?$/);
                command = tokens[1];
                parameters = tokens[3] || "";
                if (ACTIONS.indexOf(command) < 0) {
                    parameters = a;
                    command = "(custom)";
                }
            }
            var aId = id + "_action_" + (action_index++);

            var validation = {};
            validation[aId + "_cmd"] = function(v) {
                if (!command && v) {
                    command = v;
                    addAction();
                }
                return v;
            }

            var data = {
                flow: "horizontal",
                spacing: 0,
                id: aId,
                children: [{
                    type: "dropdown",
                    width: 120,
                    options: ACTIONS.concat("(custom)"),
                    value: command,
                    id: aId + "_cmd"
                }, {
                    type: "text",
                    width: 256,
                    value: parameters,
                    id: aId + "_par",
                    deps: validation
                }, {
                    type: "button",
                    width: 24,
                    text: "x",
                    id: aId + "_del",
                    onclick: function(api) {
                        removeAction(data);
                        return true;
                    },
                    deps: validation
                }]
            }
            return data;
        }

        var validation = {};
        validation[id + "_name"] = function(v) {
            if (v != tag) {
                tag = v;
                var tab = API.get(id).control;
                tab.text = v || "(empty)";
            }
            return v;
        }

        var selector = {};
        selector[id + "_type"] = function(v) {
            if (v && type != v) {
                type = v;
                var dropdown = API.get(id + "_name").control;
                dropdown.removeAll();
                var options = TRIGGERS[type];
                for (var j = 0; j < options.length; j++) {
                    dropdown.add("item", options[j]);
                }
                dropdown.selection = 0;
            }
            return true;
        }

        var tab_data = {
            name: tag || "(empty)",
            type: "tab",
            id: id,
            children: [{
                flow: "vertical",
                verticalAlign: "top",
                children: [{
                    flow: "horizontal",
                    spacing: 0,
                    children: [{
                        type: "dropdown",
                        width: 168,
                        options: TRIGGER_TYPES,
                        value: type,
                        id: id + "_type"
                    }, {
                        type: "dropdown",
                        width: 168,
                        options: TRIGGERS[type] || [tag],
                        value: tag,
                        id: id + "_name",
                        deps: selector
                    }, {
                        type: "button",
                        width: 64,
                        text: "Clear",
                        onclick: function(api) {
                            removeTrigger(tab_data);
                            return true;
                        }
                    }]
                }, {
                    flow: "vertical",
                    id: id + "_actions",
                    children: actions,
                    deps: validation
                }]

            }]
        }

        return tab_data;
    }

    var tokens = name.split(":");
    var tagParameterPattern = /^([\w_\-\.]+)(\((.*)\))?$/;

    var tabs = [];

    var config = {
        is_button: false,
        is_default: false,
        pivot: "none",
        input: "any"
    };

    var states = {
        focus: false,
        hover: false,
        press: false,
        disabled: false
    }
    var custom_states = [];

    for (var j = 1; j < tokens.length; j++) {
        var parts = tokens[j].match(tagParameterPattern);
        if(!parts) continue;

        var tag = parts[1],
            par = parts[3] || "";
        var type;

        if (tag == "button") {
            // button
            config.is_button = true;
            if (par.match(/\bdefault\b/)) config.is_default = true;
            if (par.match(/\bpivot-(left|right|up|down|x|y|all)\b/)) config.pivot = par.match(/\bpivot-(\w+)\b/)[1];
        } else {
            type = "";
            for (var t in TRIGGERS) {
                if (TRIGGERS[t].indexOf(tag) >= 0) {
                    type = t;
                    break;
                }
            }
            if (par) {
                tabs.push(TEMPLATE(type, tag, par));
            } else {
                // state
                if (states[tag] !== undefined) states[tag] = true;
                else if (tag.match(/^(controller|keyboard|mouse|touch|pen)$/)) config.input = tag;
                else custom_states.push(tag);
            }
        }
    }

    if (tabs.length == 0) {
        tabs.push(TEMPLATE());
    }
    var extra_tab = TEMPLATE();
    extra_tab.name = "+";
    tabs.push(extra_tab);

    function addTrigger() {
        var d = TEMPLATE();
        d.name = "+";
        tabs.push(d);
        return API.add(API.get("triggers").control, d);
    }

    function removeTrigger(d) {
        var index = tabs.indexOf(d);
        if (index >= 0) {
            tabs.splice(index, 1);
        }
        API.remove(d.id);
    }

    var API;

    if (_.openDialog("Rename", {
            onload: function(api) {
                API = api;
                var triggers = api.get("triggers").control;
                triggers.onChange = function() {
                    var tab = triggers.selection;
                    if (tab.text == "+") {
                        tab.text = "(empty)";
                        addTrigger();
                    }
                }

            },
            children: [{
                name: "Object id",
                width: 220,
                type: "text",
                value: tokens[0],
                id: "name"
            }, {
                flow: "horizontal",
                children: [{
                    flow: "vertical",
                    children: [{
                        name: "Button",
                        children: [{
                                flow: "horizontal",
                                children: [{
                                    name: "Button",
                                    type: "checkbox",
                                    value: config.is_button,
                                    width: 24,
                                    id: "is_button"
                                }, {
                                    name: "Default focus",
                                    type: "checkbox",
                                    width: 24,
                                    value: config.is_default,
                                    id: "is_default",
                                    deps: {
                                        "is_button": function(v) {
                                            return v
                                        }
                                    }
                                }]
                            }, {
                                name: "Pivot",
                                type: "dropdown",
                                options: ["none", "left", "up", "right", "down", "x", "y", "all"],
                                value: config.pivot,
                                id: "pivot",
                                deps: {
                                    "is_button": function(v) {
                                        return v
                                    }
                                }
                            }

                        ]
                    }, {
                        name: "State",
                        children: [{
                            flow: "horizontal",
                            children: [{
                                name: "Focus",
                                type: "checkbox",
                                value: states.focus,
                                width: 24,
                                id: "is_focus"
                            }, {
                                name: "Disabled",
                                type: "checkbox",
                                value: states.disabled,
                                width: 24,
                                id: "is_disabled"
                            }, ]
                        }, {
                            flow: "horizontal",
                            children: [{
                                name: "Hover",
                                type: "checkbox",
                                value: states.hover,
                                width: 24,
                                id: "is_hover"
                            }, {
                                name: "Press",
                                type: "checkbox",
                                value: states.press,
                                width: 24,
                                id: "is_press"
                            }, ]
                        }, {
                            name: "Input device",
                            type: "dropdown",
                            options: ["any", "controller", "keyboard", "mouse", "touch", "pen"],
                            value: config.input,
                            id: "input"
                        }, {
                            name: "Other",
                            type: "text",
                            value: custom_states.join(","),
                            id: "custom_states"
                        }]
                    }]
                }, {
                    name: "Triggers",
                    children: [{
                        type: "tabpanel",
                        id: "triggers",
                        children: tabs
                    }]
                }]
            }]
        }, config) == 1) {

        var name = config.name;

        if (config.is_button) {
            var options = [];
            if (config.is_default) {
                options.push("default");
            }
            if (config.pivot != "none") {
                options.push("pivot-" + config.pivot);
            }
            name += ":button";
            if (options.length) {
                name += "(" + options.join(" ") + ")";
            }
        }
        if (config.is_focus) name += ":focus";
        if (config.is_disabled) name += ":disabled";
        if (config.is_hover) name += ":hover";
        if (config.is_press) name += ":press";
        if (config.input != "any") name += ":" + config.input;
        if (config.custom_states) {
            var states = config.custom_states.split(/[^-\w]/);
            for(var i = 0; i<states.length; i++) {
                var state_name = states[i];
                if(name.length + state_name.length < 255) {
                    name += ":" + state_name;
                }
                else {
                    message.error("State " + state_name + " is dropped")
                }
            }
        }

        var triggers = {};
        var trigger_name_pattern = /^(trigger_\d+)_name$/;
        var trigger_action_pattern = /^((trigger_\d+)_action_\d+)_(\w+)$/;

        for (var i in config) {
            if (i.indexOf("trigger_") == 0) {
                var value = config[i];
                var trigger_name,
                    action_name;
                var nm = i.match(trigger_name_pattern),
                    am = i.match(trigger_action_pattern);
                if (nm) {
                    trigger_name = nm[1];
                } else if (am) {
                    trigger_name = am[2];
                    action_name = am[1];
                } else continue;

                if (!triggers[trigger_name]) triggers[trigger_name] = {
                    actions: {}
                };
                var trigger = triggers[trigger_name];

                if (nm) {
                    trigger.name = value;
                } else if (am) {
                    if (!trigger.actions[action_name]) trigger.actions[action_name] = {};
                    var action = trigger.actions[action_name];
                    action[am[3]] = value;
                }
            }
        }

        for (var i in triggers) {
            var trigger = triggers[i];
            var tr_text = "";
            tr_text += ":" + trigger.name + "(";
            for (var j in trigger.actions) {
                var action = trigger.actions[j];
                if (action.cmd[0] == "(") {
                    tr_text += action.par;
                } else {
                    tr_text += action.cmd + " " + action.par;
                }
                tr_text += ",";
            }
            tr_text = tr_text.replace(/,?$/, ")");
            if(name.length + tr_text.length <= 255) {
                name += tr_text;
            }
            else {
                message.error("Trigger " + trigger.name + " is dropped")
            }
        }

        target.name = name;
        doc.selection = null;
        
        if(target.typename != "Layer") {
            target.selected = true;
        }

        if(message.hasError) {
            message.show("Name is truncated because it is too long.", "");
        }

    } // end open dialog
})();