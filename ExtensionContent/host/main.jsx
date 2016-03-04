$._ext_Monograph = {

	version: 0,

	evalFile: function (path) {
        try {
            $.evalFile(path);
        } catch (e) {
            alert("Exception:" + e);
        }
    },

	debugMode: false
};
