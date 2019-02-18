'use strict';
const os = require('os');

exports.getHostname =  function(){
	return os.hostname();
};