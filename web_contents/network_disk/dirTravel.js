'use strict';
const node_path = require('path');
var fs = require('fs');  
  
/* 
递归处理文件,文件夹 
dir 路径
callback 回调函数
*/
function travel(dir, callback) {
  fs.readdirSync(dir).forEach(function (filename) {
    var pathname = node_path.join(dir, filename);
	var fileStat = fs.statSync(pathname);
	if (fileStat.isDirectory()) {
      travel(pathname, callback);
    } else {
      callback(filename,pathname,fileStat);
    }
  });
}
exports.travel = travel;  