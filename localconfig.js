'use strict';
// 默认配置 Windows
//svn测试
/*
 {
 "login": {
 "autoLogin": false,
 "language": "zh"
 },
 "mainPanel": {
 "alwaysQuit": true,
 "noLongerRemind": false
 },
 "shortcut": {
 "openAndHideWin": "ALT+W",
 "screenshot": "CTRL+Q"
 },
 "download": {
 "isAuto": "false",
 "defaultPath": ""
 },
 "msgAndRemind" : {
     "newMsg" : false,
     "wfRemind" : true,
     "mailRemind" : true,
     "audioSet" : {
        "all" : false,
         "persion" : false,
         "group" : false,
         "broadcast" : false
     }
 },
 "skin" : "default"
 } 
*/
// 默认配置 OSX
/*
 {
 "login": {
 "autoLogin": false,
 "language": "zh"
 },
 "mainPanel": {
 "alwaysQuit": true,
 "noLongerRemind": false
 },
 "shortcut": {
 "openAndHideWin": "COMMAND+W",
 "screenshot": "COMMAND+Q"
 },
 "download": {
 "isAuto": "false",
 "defaultPath": ""
 },
 "msgAndRemind" : {
     "newMsg" : false,
     "wfRemind" : true,
     "mailRemind" : true,
     "audioSet" : {
         "all" : false,
         "persion" : false,
         "group" : false,
         "broadcast" : false
     }
  },
 "skin" : "default"
 }
 */
const fs = require('fs');
const fse = require('fs-extra');
const node_path = require('path');
const extend = require('extend');
const getHomePath = require('home-path');
const Registry = require('winreg');
const regKey = new Registry({ // new operator is optional
    hive: Registry.HKCU, // open registry hive HKEY_CURRENT_USER
    key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' // open key containing autostart programs
});
const platform = {
    Windows: /^win/i.test(process.platform),
    OSX: /^darwin/i.test(process.platform),
    Linux: /unix/i.test(process.platform)
};

const pcUtils = require('./pcUtils.js');

// 把默认配置制作成json压缩字符串形式 
var DEFAULT_CONFIG = '{}';
if (platform.Windows) {
    DEFAULT_CONFIG = '{"login":{"autoLogin":false,"language":"zh"},"mainPanel":{"alwaysQuit":true,"noLongerRemind":false},"shortcut":{"openAndHideWin":"ALT+W","screenshot":"CTRL+Q"},"download":{"isAuto":"false","defaultPath":""},"msgAndRemind":{"newMsg":false,"wfRemind":true,"mailRemind":true,"audioSet":{"all":false,"persion":false,"group":false,"broadcast":false}},"skin":"default","guid":""}';
} else if (platform.OSX) {
    DEFAULT_CONFIG = '{"login":{"autoLogin":false,"language":"zh"},"mainPanel":{"alwaysQuit":true,"noLongerRemind":false},"shortcut":{"openAndHideWin":"COMMAND+W","screenshot":"COMMAND+Q"},"download":{"isAuto":"false","defaultPath":""},"msgAndRemind":{"newMsg":false,"wfRemind":true,"mailRemind":true,"audioSet":{"all":false,"persion":false,"group":false,"broadcast":false}},"skin":"default","guid":""}';
}

//const DIR_PATH = __dirname;
// 默认配置文件路径
const CONFING_PATH = node_path.join(getHomePath(), '/AppData/Roaming/e-message/Users');

/**
 * 获取默认配置 json对象
 */
var getDefaultConifg = function() {
    var defaultConfig = JSON.parse(DEFAULT_CONFIG);
    if (defaultConfig.download.defaultPath === '') {
        defaultConfig.download.defaultPath = getHomePath();
    }
    return defaultConfig;
};

function _getConfigFilePath() {
    var configFilePath = null;
    var ipcRenderer = null;
    var userInfos = { currentHost: '' };
    if (typeof window !== 'undefined') {
        ipcRenderer = window.Electron.ipcRenderer;
        userInfos = ipcRenderer.sendSync('global-getUserInfos');
    } else {
        ipcRenderer = require('electron').ipcMain;
        userInfos = ipcRenderer.emit('global-setUserInfos');
    }
    if (userInfos.currentHost) {
        configFilePath = node_path.join(CONFING_PATH, pcUtils.base64Encode(userInfos.currentHost) + '_' + userInfos.loginId + '_settings.json');
    }
    return configFilePath;
}

function _getUserConifg(userInfos) {
    return node_path.join(CONFING_PATH, pcUtils.base64Encode(userInfos.currentHost) + '_' + userInfos.loginId + '_settings.json');
}

/**
 * 得到现有配置
 * @param cb
 */
var get = function(arg1, arg2) {
    var userInfos = typeof arg1 === 'object' ? arg1 : null;
    var cb = typeof arg1 === 'object' ? arg2 : arg1 ? arg1 : arg2;
    try {
        _ensureDir();
        var configFilePath = userInfos ? _getUserConifg(userInfos) : _getConfigFilePath();
        if (configFilePath && fs.existsSync(configFilePath)) {
            typeof cb === 'function' && cb(null, JSON.parse(fs.readFileSync(configFilePath, 'UTF-8')));
        } else {
            var data = getDefaultConifg();
            // fs.writeFileSync(CONFING_FILE, JSON.stringify(data), 'UTF-8');
            typeof cb === 'function' && cb(null, data);
        }
    } catch (e) {
        console.info('get config error');
        console.info(e);
        typeof cb === 'function' && cb(e, getDefaultConifg());
    }
};

/**
 * 保存配置信息
 * @param config  配置信息json对象
 * @param cb
 */
var set = function(userInfos, config, cb) {
    try {
        _ensureDir();
        if (!config) config = getDefaultConifg();
        var configFilePath = _getUserConifg(userInfos);
        fs.writeFileSync(configFilePath, JSON.stringify(extend(getDefaultConifg(), config)), 'UTF-8');
        typeof cb === 'function' && cb(null);
    } catch (e) {
        console.info(e);
        typeof cb === 'function' && cb(e);
    }
};

function _ensureDir() {
    fse.ensureDirSync(CONFING_PATH);
}

/**
 * 设置 注销 状态
 */
var setLogout = function(flag, cb) {
    var logoutFilePath = node_path.join(CONFING_PATH, 'logout.json');
    if (flag) {
        fs.writeFileSync(logoutFilePath, 'true');
    } else {
        fs.unlinkSync(logoutFilePath);
    }
    typeof cb === 'function' && cb();
};

/**
 * 获取 注销 状态
 * @param cb
 */
var getLogoutSet = function(cb) {
    var logoutFilePath = node_path.join(CONFING_PATH, 'logout.json');
    typeof cb === 'function' && cb(fs.existsSync(logoutFilePath));
};

/**
 * 验证是否有开机启动
 * @param platform
 */
var validAutoStartup = function(platform, callback) {
    var cb = typeof callback === 'function' ? callback : function() {};
    if (platform.Windows) {
        regKey.values(function(err, items) {
            if (err) {
                console.log('ERROR: ' + err);
                cb(err, false);
            } else {
                var flag = false;
            }
            for (var i = 0; i < items.length; i++) {
                if (global.process.execPath === items[i].value) {
                    flag = true;
                    break;
                }
            }
            cb(null, flag);
        });
    } else {
        cb(null, false);
    }
};

/**
 * 设置开机自启动
 * @param platform
 * @returns {boolean}
 */
var setAppAutoStartup = function(platform, callback) {
    var cb = typeof callback === 'function' ? callback : function() {};
    if (platform.Windows) {
        validAutoStartup(platform, function(err, exist) {
            if (exist) {
                cb(null, true);
            } else {
                try {
                    regKey.set('e-message', 'REG_SZ', global.process.execPath, function(n, e) {
                        cb(null, true);
                    });
                } catch (e) {
                    cb(e, false);
                }
            }
        });
    } else {
        cb(null, false);
    }
};

/**
 * 取消开机自启动
 * @param platform
 */
var cancelAppAutoStartup = function(platform, callback) {
    var cb = typeof callback === 'function' ? callback : function() {};
    if (platform.Windows) {
        try {
            regKey.remove('e-message', function(n, e) {
                callback(null, true);
            });
        } catch (o) {
            cb(o, false);
        }
    }
};

/**
 * 检测是否有启动进行升级
 * @returns {*}
 */
var validLogoutThenUpgrade = function() {
    return fs.existsSync(node_path.join(CONFING_PATH, 'logoutThenUpgrade.json'));
};

/**
 * 设置退出并更新
 * @param obj
 * @param callback
 */
var setLogoutThenUpgrade = function(obj, callback) {
    var upgradeFilePath = node_path.join(CONFING_PATH, 'logoutThenUpgrade.json');
    fs.writeFileSync(upgradeFilePath, JSON.stringify(obj), 'UTF-8');
    typeof callback === 'function' && callback();
};

/**
 * 获取退出更新保存的oa地址
 * @param callback
 */
var getLogoutThenUpgrade = function(callback) {
    var upgradeFilePath = node_path.join(CONFING_PATH, 'logoutThenUpgrade.json');
    var oaAddress = fs.readFileSync(upgradeFilePath, 'UTF-8');
    fs.unlinkSync(node_path.join(CONFING_PATH, 'logout.json'));
    fs.unlinkSync(upgradeFilePath);
    typeof callback === 'function' && callback(JSON.parse(oaAddress));
};

module.exports = {
    getDefaultConifg: getDefaultConifg,
    get: get,
    set: set,

    setLogout: setLogout,
    getLogoutSet: getLogoutSet,

    validAutoStartup: validAutoStartup,
    setAppAutoStartup: setAppAutoStartup,
    cancelAppAutoStartup: cancelAppAutoStartup,

    validLogoutThenUpgrade: validLogoutThenUpgrade,
    setLogoutThenUpgrade: setLogoutThenUpgrade,
    getLogoutThenUpgrade: getLogoutThenUpgrade
};