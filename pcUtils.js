'use strict';

//const fs = require('fs');
const node_path = require('path');
const fse = require('fs-extra');
const getHomePath = require('home-path');
const request = require('request');
var exec = require('child_process').exec;
var iconv = require('iconv-lite');
const downloader = require('downloader'); // 下载工具
const unzip = require('unzip'); // 解压工具
const fs = require("fs");

/***加载日志组件**开始**/
const log4js = require('log4js');
//注意修改日志级别,默认是error，当需要调试的时候可修改为debug或者info
//macbook 存在加载不了的情况
try {
    log4js.configure({
        'appenders': [{
            'category': 'log_file',
            'type': 'datefile',
            'filename': getHomePath() + '/AppData/Roaming/e-message/appLogs/app',
            'pattern': '-yyyy-MM-dd.log',
            'alwaysIncludePattern': true,
            'backups': 30
        }],
        'replaceConsole': false,
        'levels': {
            'log_file': 'INFO'
        }
    });
} catch (err) {

}
const log_file = log4js.getLogger('log_file');
/***加载日志组件**结束**/
const DIR_PATH = __dirname;
/**
 * 获得当前时间字符串
 * @returns {string}
 */
exports.getCurrentTimeString = function() {
    var date = new Date();
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var hour = date.getHours();
    var minute = date.getMinutes();
    var second = date.getSeconds();
    return year + '.' + month + '.' + day + '. ' + hour + ':' + minute + ':' + second;
};

function toUnicode(a) {
    a = a.replace(/%([a-zA-Z0-9]{2})/g, function(_, code) {
        return String.fromCharCode(parseInt(code, 16));
    });
    var buff = new Buffer(a, 'binary');
    var result = iconv.decode(buff, 'gbk');
    return result;
}

/*
function _getDateString() {
    var date = new Date();
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    return year + '' + (month < 10 ? ('0' + month) : month) + '' + (day < 10 ? ('0' + day) : day);
}
*/
/**
 * 处理异常错误
 * @param error
 * @param extra
 * @param isShowError
 */
exports.handleError = function(error, extra, isShowError) {
    console.info(error);
    if (typeof extra === 'boolean') {
        isShowError = extra;
        extra = {};
    }

    // Handle the error
    exports.writeLog(error.toString());
    if (isShowError) exports.showError(error);
};

/**
 * 添加到日志文件
 * @param logStr
 * @param isShowError
 */
exports.writeLog = function(logStr, isShowError) {
    if (logStr === '' || logStr === undefined || logStr === 'undefined') {
        logStr = '';
    }
    log_file.info(logStr);
    if (typeof isShowError === 'boolean' && isShowError) exports.showError(logStr);
};

exports.info = function(logStr) {
    log_file.info(logStr);
};

exports.error = function(logStr) {
    log_file.error(logStr);
};

exports.trace = function(logStr) {
    log_file.trace(logStr);
};

exports.debug = function(logStr) {
    log_file.debug(logStr);
};

exports.warn = function(logStr) {
    log_file.warn(logStr);
};

/**
 * 展示对话框信息
 * @param error
 */
exports.showError = function(error) {
    var dialog = require('electron').dialog;
    if (!dialog && window) {
        dialog = window.Electron.remote.dialog;
    }
    dialog.showErrorBox('应用出了点问题，我们会尽快解决', [
        error.toString(),
        '如果影响到您使用请尽快联系我们'
    ].join('\n'));
};

/**
 * 获得package.json的version值
 * @returns {*|version|string}
 */
exports.getVersion = function() {
    var json = fse.readJsonSync(node_path.join(__dirname, './package.json'));
    return json.version;
};

/**
 * 获得package.json的buildVersion值
 * @returns {*}
 */
exports.getBuildVersion = function() {
    var json = fse.readJsonSync(node_path.join(__dirname, './package.json'));
    return {
        buildVersion: json.buildVersion,
        osxBuildVersion: json.osxBuildVersion,
        runtimeVersion: json['cmake-js'].runtimeVersion
    };
};

/**
 * 获得服务端package.json的buildVersion值
 * @returns {*}
 */
exports.getRemoteVersion = function(baseURL) {
    var p = new Promise(function(resolve, reject) {
        request(baseURL + '/social/im/ServerStatus.jsp?p=getVersion', function(error, response, body) {
            if (!error && response.statusCode == 200 && typeof body === 'string') {
                body = body.trim();
                if(body.indexOf('{') == 0) {
                    resolve(JSON.parse(body));
                }else{
                    reject("bad body ["+ body +"]");
                }
                
            } else {
                reject(error ? error : ("no response! status code: " + response.statusCode));
            }
        });
    });

    return p;
};
/**
 * 从指定网络地址下载安装包
 * @param {* 下载地址} remoteZipPath 
 * @param {* 保存路径} saveZipPath 
 */
exports.downloadPak = function(remoteZipPath, saveZipPath) {
    var p = new Promise(function(resolve, reject) {
        var newDlObj = new downloader();
        newDlObj.download(remoteZipPath, saveZipPath, 0);
        newDlObj.on('done', (msg, status) => {
            resolve(saveZipPath);
        });
        newDlObj.on('error', (errMsg) => {
            reject(errMsg);
        });
    });
    return p;
}
/**
 * 解压安装包到指定路径
 * @param {* 压缩包地址} srcPath 
 * @param {* 解压地址} destPath 
 */
exports.extractPak = function(srcPath, destPath) {
    var p = new Promise(function(resolve, reject) {
        var writeStream = fs.createReadStream(srcPath);
        try {
            writeStream.pipe(unzip.Extract({ path: destPath }));
            writeStream.on('end', () => {
                resolve(srcPath);
            });
        } catch (err) {
            reject(err);
        }
    });
    return p;
}
/**
 * base64加密
 * @param str
 * @returns {string}
 */
exports.base64Encode = function(str) {
    return new Buffer(str).toString('base64');
};
/**
 * base64解密
 * @param str
 * @returns {string}
 */
exports.base64Decode = function(str) {
    return new Buffer(str, 'base64').toString();
};
/**
 * 访问粘贴板
 * @param cb
 * @returns {string}
 */
exports.queryClipboard = function(cb) {
    var clipToolPath = node_path.join(DIR_PATH, '/extension/')
    var cmd = "cd " + clipToolPath + " & clipcap --file"
    var ls = exec(cmd, function(error, stdout, stderr) {
        if (error) {
            console.log(error.stack);
            console.log('Error code: ' + error.code);
        }
        var filepath = toUnicode(stdout),
            fp;
        // 去掉首尾的空白字符
        var filelistAry = new Array();
        filepath = filepath.replace(/^\s+|\s+$/g, '');
        var filepathAry = filepath.split("\r\n");
        for (var i = 0; i < filepathAry.length; ++i) {
            fp = filepathAry[i];
            fp = node_path.normalize(fp);
            filelistAry.push(fp);
        }
        if (cb && typeof cb === 'function') {
            cb(filelistAry);
        }
    });
}

/**
 * 获取n小时内以内随机的毫秒值
 */
exports.getRandomMillis = function (n) {
    var next = parseInt(Math.random() * (n?n:2) * 60 * 60 * 1000);
    console.log("next random minutes: " + (next / 1000 / 60))
    return next;
}