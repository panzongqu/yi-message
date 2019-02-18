'use strict';
/**Main:
 * app:主线程，用于控制应用的生命周期
 * BrowserWindow:创建和控制浏览器窗口
 * dialog:展示本地系统对话框，用于打开或者保存文件,警告等
 * globalShortcut:检查键盘事件，当应用不具有焦点的时候
 * ipcMain:从主进程到渲染进程进行异步通讯
 * Menu:创建本机应用程序菜单和上下文菜单
 * MenuItem:将选项添加到本机应用程序菜单和上下文菜单
 * systemPreferences:获取系统偏好
 * Tray:添加到系统的通知区域的图标和上下文菜单
 *
 * Both:
 * nativeImage:创建托盘和使用 PNG 或 JPG 文件的应用程序图标
 * clipboard:执行复制和粘贴操作在系统剪贴板上
 * shell:管理文件和使用其默认的应用程序的 Url
 * */
const electron = require('electron');
const { app } = require('electron');
const { globalShortcut } = require('electron');
const { systemPreferences } = require('electron');
const BrowserWindow = electron.BrowserWindow; // 浏览窗口
const dialog = electron.dialog; // 对话框
const Tray = electron.Tray; // 系统托盘
const Menu = electron.Menu;
const MenuItem = electron.MenuItem;
const clipboard = electron.clipboard; // 粘贴板
const nativeImage = electron.nativeImage;
const shell = electron.shell; // 命令窗口
const ipcMain = electron.ipcMain; // 通信
const path = require('path'); // nodejs的path模块
const fs = require("fs");
const fse = require('fs-extra');
const { exec } = require('child_process');
const cmd = require('node-cmd');


const platform = {
    Windows: /^win/i.test(process.platform),
    OSX: /^darwin/i.test(process.platform),
    Linux: /unix/i.test(process.platform)
};

const electronLocalshortcut = require('electron-localshortcut');

const DIR_PATH = __dirname;

// 其他工具
const pcUtils = require('./pcUtils.js');
const localconfig = require('./localconfig.js');


// 配置文件
var appConfig = require('./appConfig.json');

//设置carsh目录
const getHomePath = require('home-path');
app.setPath('temp', getHomePath() + '/AppData/Roaming/e-message/temp');

// 声明一些全局变量
var mainWindow = null; // 主窗口
var isMainWinodwHided = false; // 主聊天窗口是否隐藏
var windows = {}; // 新窗口Map
var appTray = null; // 托盘部分定义
var electronScreen = null; // 显示器属性
var isAllowNewChatWin = false; //是否开启窗口分离
var mainUrl = null; //主页链接
var isDevelop = false; //是否调试模式，默认为false
var leftWinStatus = false; //左侧窗口状态，判断是否页面存在或者关闭，
var isUpdating = false;

/*--------------------------------  登陆窗口 和 主聊天 窗口设置  start  --------------------------------*/
var LoginAndChatWin = {
    loginWin: null,
    chatWin: null,
    isChatWinReady: false,
    showChatWinHandle: null
};
// 登陆窗口
function initLoginWindow() {
    pcUtils.info('initLoginWindow start');
    var loginWindow = null;

    var winWidth = appConfig.windowSize.loginWin.width;
    var winHeight = appConfig.windowSize.loginWin.height;
    pcUtils.debug('initLoginWindow winWidth' + winWidth);
    pcUtils.debug('initLoginWindow winHeight' + winHeight);
    if (!GLOBAL_INFOS.isAeroGlassEnabled) {
        winWidth -= 10;
        winHeight -= 10;
    }

    loginWindow = new BrowserWindow({
        title: 'e-message',
        show: false,
        width: winWidth,
        height: winHeight,
        //x: primaryDisplay.bounds.width - 350,
        //y: offsetY,
        useContentSize: true,
        resizable: false,
        //skipTaskbar: true,  // 是否隐藏任务栏
        frame: false,
        transparent: GLOBAL_INFOS.isAeroGlassEnabled,
        'webPreferences': {
            'preload': path.join(DIR_PATH, 'preload.js')
        }
    });
    loginWindow.loadURL('file://' + DIR_PATH + appConfig.index);

    loginWindow.on('closed', function() {
        pcUtils.info('loginWindow closed');
        if (!LoginAndChatWin.isChatWinReady) {
            app.quit();
        }
    });
    // 监听窗口重定向时间，阻止重定向
    loginWindow.webContents.on('did-get-redirect-request', function(event, oldURL, newURL, isMainFrame, httpResponseCode, requestMethod, referrer, headers) {
        pcUtils.info('登录窗口出现重定向:\noldURL=' + oldURL + "\nnewURL=" + newURL);
        if (oldURL.indexOf("http:") > -1 && newURL.indexOf("https:") > -1) {
            var args = {};
            args.newURL = newURL;
            loginWindow.webContents.send('do-loginHtml-redirect', args);
        }
    });
    //修复win10不弹出窗口问题
    loginWindow.webContents.on('dom-ready', function(event) {
        pcUtils.info('loginWindow dom-ready');
        if (!loginWindow.isFocused()) {
            loginWindow.minimize();
            loginWindow.show();
            //在登陆界面保持显示在客户面前，置顶
            if (platform.Windows) {
                loginWindow.setAlwaysOnTop(true);
            }
        }
    });

    // 注册 打开工具栏快捷键
    registerWindowShortcut(loginWindow);

    return loginWindow;
}

// 访问系统粘贴板
ipcMain.on('query-clipboard', (event, args) => {
    pcUtils.info('query-clipboard');
    pcUtils.queryClipboard(callbackfun);

    function callbackfun(filepathary) {
        if (isAllowNewChatWin) {
            var chatWin = WindowsDepartUtils.currentChatWindow;
            chatWin.webContents.send('query-clipboard-cb', { 'paths': filepathary });
        } else {
            LoginAndChatWin.chatWin.webContents.send('query-clipboard-cb', { 'paths': filepathary });
        }
    }
});

// 登陆成功，初始化主聊天窗口
ipcMain.on('init-mainChatWindow', (event, args) => {
    pcUtils.info('init-mainChatWindow');
    var url = args;
    if (!url) {
        url = GLOBAL_INFOS.userInfos.currentHost + appConfig.mainChatPage;
    }
    mainUrl = url;
    LoginAndChatWin.chatWin = initMainChatWinodw(url);
});

//切换账号
ipcMain.on('reload-mainChatwin', (event, args) => {
    pcUtils.info('reload-mainChatwin');
    var userInfo = args.userInfo;
    var pcOS = args.pcOS;
    var isAllowNewWin = args.isAllowNewWin;
    var url = '';
    if (isAllowNewWin !== undefined && isAllowNewWin !== 'undefined' && isAllowNewWin !== 0) {
        url = userInfo.currentHost + '/social/im/newChatWin/SocialIMMain-ncr.jsp?frommain=yes&from=pc&isAero=' + GLOBAL_INFOS.isAeroGlassEnabled + '&pcOS=' + pcOS + '&isAllowNewWin=' + isAllowNewWin;
        if (WindowsDepartUtils.currentChatWindow) {
            WindowsDepartUtils.currentChatWindow.close();
            //WindowsDepartUtils.currentChatWindow.destroy();
        }
    } else {
        url = userInfo.currentHost + '/social/im/SocialIMMain.jsp?frommain=yes&from=pc&isAero=' + GLOBAL_INFOS.isAeroGlassEnabled + '&pcOS=' + pcOS;
    }

    url += '&sessionkey=' + userInfo.sessionKey;
    if (!url) {
        url = GLOBAL_INFOS.userInfos.currentHost + appConfig.mainChatPage;
    }
    pcUtils.info('===== start setting client user configs ======');
    // 设置客户端用户信息
    var extend = require('extend');
    GLOBAL_INFOS.userInfos = extend(GLOBAL_INFOS.userInfos, userInfo);
    GLOBAL_INFOS.currentHost = userInfo.currentHost;
    GLOBAL_INFOS.sessionKey = userInfo.sessionKey;
    pcUtils.info('===== start initialize new chat window ======:' + url);
    //重载聊天窗口
    var win = LoginAndChatWin.chatWin;
    if (win) {
        //用户配置
        var config = {};
        //首次登录生成guid
        localconfig.get({
                currentHost: userInfo.currentHost,
                loginId: userInfo.loginId
            },
            function(err, userconfig) {
                config = userconfig;
            }
        );
        if (config.guid === null || config.guid === undefined || config.guid === '' || config.guid === 'undefined') {
            var uuid = require('node-uuid');
            config.guid = uuid.v4();
        }
        GLOBAL_INFOS.userConifg = config;
        win.webContents.session.clearCache(function() {
            win.hide();
            win.reload();
        });
    }
});
// 取消登陆
ipcMain.on('cancel-mainChatWindow', (event, args) => {
    pcUtils.info('cancel-mainChatWindow');
    var flag = false;
    if (!LoginAndChatWin.isChatWinReady && LoginAndChatWin.chatWin !== null) {
        clearTimeout(LoginAndChatWin.showChatWinHandle);
        LoginAndChatWin.chatWin.close();
        LoginAndChatWin.chatWin = null;

        mainWindow = LoginAndChatWin.loginWin;
        flag = true;
        pcUtils.info('cancel-mainChatWindow-success');
    }
    event.returnValue = flag;
});

//初始化修改密码页面
ipcMain.on('init-checkPwdWindow', (event, args) => {
    pcUtils.info('init-checkPwdWindow args====' + JSON.stringify(args));
    mainWindow.hide();
    mainWindow.webContents.send('change-mainwin');
    initCheckPwdWindow(args);
});

function initCheckPwdWindow(args) {
    pcUtils.info('initCheckPwdWindow args====' + JSON.stringify(args));
    var fileUrl = 'file://' + path.join(DIR_PATH, appConfig.checkPwdUrl);
    var checkPwdWindow = null;

    var winWidth = appConfig.windowSize.checkPwdWin.width;
    var winHeight = appConfig.windowSize.checkPwdWin.height;
    if (!GLOBAL_INFOS.isAeroGlassEnabled) {
        winWidth -= 10;
        winHeight -= 10;
    }

    checkPwdWindow = new BrowserWindow({
        title: '密码修改提示 - e-message',
        show: false,
        width: winWidth,
        height: winHeight,
        useContentSize: true,
        resizable: false,
        skipTaskbar: false, // 是否隐藏任务栏
        frame: false,
        transparent: GLOBAL_INFOS.isAeroGlassEnabled, //窗口是否透明
        parent: mainWindow,
        'webPreferences': {
            'preload': path.join(DIR_PATH, 'preload.js')
        }
    });

    // checkPwdWindow.webContents.send('load-checkPwdWindow', args);

    checkPwdWindow.loadURL(fileUrl);

    checkPwdWindow.webContents.on('dom-ready', function(event) {
        pcUtils.info('checkPwdWindow dom-ready args====' + JSON.stringify(args));
        //发送参数
        checkPwdWindow.webContents.send('args', args);
        checkPwdWindow.show();
    });



    // 注册 打开工具栏快捷键
    registerWindowShortcut(checkPwdWindow);

    checkPwdWindow.on('close', function(event, args) {
        pcUtils.info('checkPwdWindow close args====' + JSON.stringify(args));
        if (checkPwdWindow) {
            checkPwdWindow.webContents.send('checkPwdWindow-quit');
            checkPwdWindow.webContents.session.clearCache(function() {
                pcUtils.info('checkPwdWindow  clearCache');
            });
        }
    });
}

ipcMain.on('comfirm-checkPwdWin', (event, args) => {
    pcUtils.info('comfirm-checkPwdWin args====' + JSON.stringify(args));
    if (args.do === 'left') {
        mainWindow.webContents.send('quit-checkPwdWin-left');
    } else {
        mainWindow.webContents.send('quit-checkPwdWin-continue', args.extData);
    }
    mainWindow.show();
});

var UpdateListener = function() {
    var State = function() {};
    State.prototype.isUpdating = function() {
        throw new Error('isUpdating method must be override');
    };

    var IdleState = function(handler) {
        this.handler = handler;
        this.name = "idle state";
        this.id = 0;
        this.print = function() {
            console.log("idle state");
        }
    }
    IdleState.prototype = new State();
    IdleState.prototype.isUpdating = function() {
        return false;
    }
    var QueryVersionState = function(handler) {
        this.handler = handler;
        this.name = "quering version state";
        this.id = 1;
        this.print = function() {
            console.log("quering version");
        }
    }
    QueryVersionState.prototype = new State();
    QueryVersionState.prototype.isUpdating = function() {
        return true;
    }
    var DownloadState = function(handler) {
        this.handler = handler;
        this.name = "downloading update pak state";
        this.id = 2;
        this.print = function() {
            console.log("downloading");
        }
    }
    DownloadState.prototype = new State();
    DownloadState.prototype.isUpdating = function() {
        return true;
    }
    var ExtractState = function(handler) {
        this.handler = handler;
        this.name = "extracting update pak state";
        this.id = 3;
        this.print = function() {
            console.log("extracting");
        }
    }
    ExtractState.prototype = new State();
    ExtractState.prototype.isUpdating = function() {
        return true;
    }
    var FinishState = function(handler) {
        this.handler = handler;
        this.name = "update finish state";
        this.id = 4;
        this.print = function() {
            console.log("update finished");
        }
    }
    FinishState.prototype = new State();
    FinishState.prototype.isUpdating = function() {
        return false;
    }
    this.idleState = new IdleState(this);
    this.queryVersionState = new QueryVersionState(this);
    this.downloadState = new DownloadState(this);
    this.extractState = new ExtractState(this);
    this.finishState = new FinishState(this);

    var currState = this.queryVersionState;
    var stateInterceptors = {};

    this.setState = function(state) {
        currState = state;
        // 运行拦截器方法
        var itcors = stateInterceptors[currState.id];
        if (itcors) {
            for (var handlerName in itcors) {
                if (typeof itcors[handlerName] == 'function') {
                    itcors[handlerName]();
                    delete itcors[handlerName];
                }
            }
        }
    }
    this.getCurrStateName = function() {
        return currState.name;
    }
    this.printCurrState = function() {
        currState.print();
    }
    this.isUpdating = function() {
        return currState.isUpdating();
    }
    this.handleError = function(errMsg) {
        console.log("catch error!" + errMsg);
        this.setState(this.idleState);
    }
    this.addInterceptor = function(state, handlerName, handler) {
        var itcors = stateInterceptors[state.id];
        if (!itcors) stateInterceptors[state.id] = new Object();
        stateInterceptors[state.id][handlerName] = handler;
    }
    this.init = function() {
        this.setState(this.idleState);
    }

}
var global_updateListener = null;
ipcMain.on('init-autoUpdate', (event, args) => {
    var serverURL = args;
    console.log("init auto update... " + serverURL);

    function initUpdateTimer(serverURL) {
        setTimeout(function() {
            checkUpdateInstaller(serverURL);
            initUpdateTimer(serverURL)
        }, pcUtils.getRandomMillis())
    }
    checkUpdateListener() && initUpdateTimer(serverURL)
});

ipcMain.on('check-Update', (event, args) => {

    var serverURL = GLOBAL_INFOS.userInfos.currentHost;
    if (!checkUpdateListener()) return;
    // 设置拦截
    if (args.giveSuccDialog) {
        var handler = function() {
                if (isAllowNewChatWin) {
                    WindowsDepartUtils.currentOpenWindow.webContents.send('check-update-finished');
                } else {
                    LoginAndChatWin.chatWin.webContents.send('check-update-finished');
                }
            }
            // global_updateListener.addInterceptor(global_updateListener.finishState, 'onFinished', handler);
    }
    if (serverURL)
        checkUpdateInstaller(serverURL);
});



function checkUpdateListener() {
    if (!global_updateListener) {
        global_updateListener = new UpdateListener();
        global_updateListener.init();
    } else if (global_updateListener.isUpdating()) {
        console.log("last  update not finished! current state is " + global_updateListener.getCurrStateName());
        return false;
    }
    return true;
}

/**
 * 提示是否安装更新包
 */
function showUpdateChoiceDlg(savePath) {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '提示',
        message: '新版本已准备好，是否安装?',
        buttons: ['是', '否']
    }, function(choice) {
        global_updateListener.setState(global_updateListener.finishState);
        if (choice == 0) {
            shell.openItem(savePath);
            if (mainWindow) mainWindow.removeAllListeners('close');
            app.quit();
        }
    });
}

/**
 * 检查并下载安装包， 不覆盖，只给提示
 * @param {*} serverURL oa服务地址
 */
function checkUpdateInstaller(serverURL) {
    console.log("check update...");
    if (!checkUpdateListener()) return;
    global_updateListener.setState(global_updateListener.queryVersionState);
    pcUtils.getRemoteVersion(serverURL)
        .then(function(remoteVersion) {
            var localVersion = pcUtils.getBuildVersion();
            console.log("localVersion: " + localVersion.buildVersion +
                " remoteVersion: " + remoteVersion.buildversion);

            console.log("osxBuildVersion: " + remoteVersion.osxBuildVersion + " local osxBuildVersion: " + localVersion.osxBuildVersion)
            var needUpdate = (platform.Windows && remoteVersion.buildversion > localVersion.buildVersion) ||
                (platform.OSX && remoteVersion.osxBuildVersion > localVersion.osxBuildVersion);
            if (needUpdate) {
                var versionNo = parseInt(platform.Windows ? remoteVersion.buildversion : remoteVersion.osxBuildVersion);
                const PAK_PATH = path.join(getHomePath(), './.e-message/update');
                fse.ensureDirSync(PAK_PATH);
                var extension = platform.Windows ? '.exe' : '.dmg';
                var remotePath = serverURL + '/social/im/resources/e-message' + extension;
                var savePath = path.join(PAK_PATH + '/e-message-' + pcUtils.getVersion() + '.' + versionNo + extension);
                // 已经下载了，直接提示安装
                fs.exists(savePath, function(exists) {
                    if (exists) {
                        console.log("need update, installer is already downloaded! give tips...");
                        showUpdateChoiceDlg(savePath);
                    } else {
                        console.log("need update, now download e-message full installer from server to the path :" + PAK_PATH);
                        global_updateListener.setState(global_updateListener.downloadState);
                        pcUtils.downloadPak(remotePath, savePath, 0)
                            .then(function(savePath) {
                                if (savePath) {
                                    console.log("download ok! give tips...");
                                    showUpdateChoiceDlg(savePath);
                                }
                            }, function(reason) {
                                console.log("download pak has been rejected, reason: " + reason);
                                global_updateListener.setState(global_updateListener.finishState);
                            }).catch(global_updateListener.handleError)
                    }
                })

            } else {
                console.log("do not need update");
                global_updateListener.setState(global_updateListener.finishState);
                return "";
            }
        }, function(reason) {
            console.log("getRemoteVersion has been rejected, reason: " + reason);
            global_updateListener.setState(global_updateListener.finishState);
        }).catch(global_updateListener.handleError)
}
/**
 * 检查并更新app包，包含覆盖动作
 * @param {*} serverURL oa服务地址
 */
function checkUpdate(serverURL) {
    console.log("check update...");
    if (!checkUpdateListener()) return;
    global_updateListener.setState(global_updateListener.queryVersionState);
    pcUtils.getRemoteVersion(serverURL)
        .then(function(remoteVersion) {
            var localVersion = pcUtils.getBuildVersion();
            console.log("localVersion: " + localVersion.buildVersion +
                " remoteVersion: " + remoteVersion.buildversion);
            var needUpdate = remoteVersion.buildversion > localVersion.buildVersion ||
                remoteVersion.osxBuildVersion > localVersion.osxBuildVersion;
            if (needUpdate) {
                var versionNo = parseInt(platform.Windows ? remoteVersion.buildversion : remoteVersion.osxBuildVersion);
                const PAK_PATH = path.join(getHomePath(), './.e-message/update');
                fse.ensureDirSync(PAK_PATH);
                console.log("need update, now download app folder from server to the path :" + PAK_PATH);
                var remoteZipPath = serverURL + '/social/im/resources/app/app.zip';
                var saveZipPath = path.join(PAK_PATH + '/app-' + versionNo + '.zip');
                global_updateListener.setState(global_updateListener.downloadState);
                return pcUtils.downloadPak(remoteZipPath, saveZipPath, 0);
            } else {
                console.log("do not need update");
                return "";
            }
        }, function(reason) {
            console.log("getRemoteVersion has been rejected, reason: " + reason);
        }).catch(global_updateListener.handleError)
        .then(function(saveZipPath) {
            if (saveZipPath) {
                console.log("download ok! extract package...");
                global_updateListener.setState(global_updateListener.extractState);
                return pcUtils.extractPak(saveZipPath, DIR_PATH);
            } else {
                return "";
            }
        }, function(reason) {
            console.log("download pak has been rejected, reason: " + reason);
        }).catch(global_updateListener.handleError)
        .then(function(saveZipPath) {
            if (saveZipPath) {
                console.log("extract ok! remove temporay file...");
                fs.unlink(saveZipPath, function(err) {
                    if (err) {
                        console.log("unlink file error: " + saveZipPath);
                    }
                });
            }
            global_updateListener.setState(global_updateListener.finishState);
            setTimeout(() => {
                global_updateListener.setState(global_updateListener.idleState);
            }, 5000);
        }, function(reason) {
            console.log("extract progressing has been rejected, reason: " + reason);
        }).catch(global_updateListener.handleError)
}

ipcMain.on('init-updateWindow', (event, args) => {
    mainWindow.hide();
    isUpdating = true;
    initUpdateWindow();
});

function initUpdateWindow() {
    var fileUrl = 'file://' + path.join(DIR_PATH, appConfig.updateUrl);
    var updateWindow = null;

    var winWidth = appConfig.windowSize.updateWin.width;
    var winHeight = appConfig.windowSize.updateWin.height;
    if (!GLOBAL_INFOS.isAeroGlassEnabled) {
        winWidth -= 10;
        winHeight -= 10;
    }

    updateWindow = new BrowserWindow({
        title: 'e-message',
        show: false,
        width: winWidth,
        height: winHeight,
        useContentSize: true,
        resizable: false,
        skipTaskbar: false, // 是否隐藏任务栏
        frame: false,
        transparent: GLOBAL_INFOS.isAeroGlassEnabled,
        'webPreferences': {
            'preload': path.join(DIR_PATH, 'preload.js')
        }
    });

    updateWindow.loadURL(fileUrl);

    updateWindow.webContents.on('dom-ready', function(event) {
        updateWindow.show();
    });

    // 注册 打开工具栏快捷键
    registerWindowShortcut(updateWindow);

    updateWindow.on('close', function(event) {
        isUpdating = false
        if (updateWindow) {
            updateWindow.webContents.send('updateWin-quit');

            updateWindow.webContents.session.clearCache(function() {
                pcUtils.info('updateWindow  clearCache');
            });
        }
    });
}


// 设置并返回主聊天窗口
function initMainChatWinodw(url) {
    pcUtils.info('initMainChatWinodw url====' + url);
    var mainChatWindow = null;
    var urlParse = require('url');
    var newUrl = urlParse.parse(url, true).query;
    var flag = false;
    var resizable = true;
    try {
        var isAllowNewWin = newUrl.isAllowNewWin;
        if (isAllowNewWin === '1') {
            flag = true;
            resizable = false;
            isAllowNewChatWin = true;
        } else if (isAllowNewWin === '0' || isAllowNewWin === undefined) {
            flag = false;
            resizable = true;
            isAllowNewChatWin = false;
        }
    } catch (err) {
        flag = false;
        resizable = true;
    }
    var winMinWidth = 0;
    var winWidth = 0;
    if (flag) {
        winMinWidth = appConfig.windowSize.mainChatWin.reWidth;
        winWidth = appConfig.windowSize.mainChatWin.reWidth;
    } else {
        winMinWidth = appConfig.windowSize.mainChatWin.minWidth;
        winWidth = appConfig.windowSize.mainChatWin.width;
    }

    var winHeight = appConfig.windowSize.mainChatWin.height;
    var winMinHeight = appConfig.windowSize.mainChatWin.minHeight;
    if (!GLOBAL_INFOS.isAeroGlassEnabled) {
        winWidth -= 10;
        winHeight -= 10;
        winMinWidth -= 10;
        winMinHeight -= 10;
    }
    var browserWindowOptions = {
        title: 'e-message',
        show: false,
        width: winWidth,
        height: winHeight,
        minWidth: winMinWidth,
        minHeight: winMinHeight,
        useContentSize: true,
        resizable: resizable,
        skipTaskbar: false, // 是否隐藏任务栏
        frame: false,
        transparent: GLOBAL_INFOS.isAeroGlassEnabled,
        'webPreferences': {
            'preload': path.join(DIR_PATH, 'preload.js')
        }
    }
    if (flag) {
        var screenSize = electronScreen.getPrimaryDisplay().bounds;
        browserWindowOptions.x = screenSize.width - winMinWidth - 60;
        try {
            browserWindowOptions.y = parseInt(screenSize.height / 10);
        } catch (error) {
            browserWindowOptions.y = 40;
        }

    }
    mainChatWindow = new BrowserWindow(browserWindowOptions);
    mainChatWindow.loadURL(url);

    // 延迟到内容加载完成之后，再显示主窗口
    mainChatWindow.webContents.on('dom-ready', function(event) {
        pcUtils.info('mainChatWindow  dom-ready');

        LoginAndChatWin.isChatWinReady = true;
        if (LoginAndChatWin.loginWin) {
            // 隐藏登陆窗口
            if (!LoginAndChatWin.loginWin.isDestroyed()) {
                LoginAndChatWin.loginWin.hide();
                LoginAndChatWin.loginWin.setAlwaysOnTop(false);
            }
        }

        // 展示主聊天窗口
        LoginAndChatWin.showChatWinHandle = setTimeout(function() {
            if (LoginAndChatWin.loginWin && !LoginAndChatWin.loginWin.isDestroyed()) {
                if (platform.Windows) {
                    //destroyWin(LoginAndChatWin.loginWin);
                    //后续做重新登陆的时候不能将登陆窗口关闭，需要隐藏
                    LoginAndChatWin.loginWin.hide();
                }
                // 变换主窗口
                mainWindow = LoginAndChatWin.chatWin;
                // 初始化主聊天窗口的特性
                setMainWindowAttr();
            }
            TrayUtils.setTrayCommon(); // 变化图标状态

            //修复新版的win10不弹出窗口问题
            if (!mainChatWindow.isFocused()) {
                mainChatWindow.minimize();
                mainChatWindow.show();
            }

            TrayUtils.setContextMenu(TrayMenu.winChat);
        }, 200);
    });

    mainChatWindow.webContents.on('new-window', function(event, url, name) {
        pcUtils.info('mainChatWindow  new-window');
        if (!event) return;
        event.preventDefault();
        //openANewMaximizeWindow(url, name);
        mainChatWindow.webContents.send('open-new-window', url);
    });

    // 主聊天窗口加载失败（服务端错误或者url地址不正确）
    mainChatWindow.webContents.on('did-fail-load', function(event, errorCode, errorDescription, validatedURL) {
        pcUtils.info('mainChatWindow did-fail-load');
        pcUtils.writeLog('did-fail-load\n errorCode=' + errorCode + '\n errorDescription=' + errorDescription);

        if (LoginAndChatWin.loginWin && !LoginAndChatWin.loginWin.isDestroyed()) {
            LoginAndChatWin.loginWin.webContents.send('chatWin-load-error');
        }
    });

    // 监听窗口重定向时间，阻止重定向
    mainChatWindow.webContents.on('did-get-redirect-request', function(event, oldURL, newURL, isMainFrame, httpResponseCode, requestMethod, referrer, headers) {
        pcUtils.info('mainChatWindow did-get-redirect-request');
        pcUtils.info('oldURL==' + oldURL);
        pcUtils.info('newURL==' + newURL);
        //出现了302重定向到登陆地址
        if (newURL.indexOf('/login/Login.jsp') !== -1) {
            pcUtils.writeLog('did-get-redirect-request\n isMainFrame=' + isMainFrame + '\n oldURL=' + oldURL + '\n newURL=' + newURL);
            mainChatWindow.webContents.stop(); // 阻止页面跳转
            mainChatWindow.webContents.send('pc-power-resume');
        }
    });
    //当出现渲染进程奔溃的时候
    mainChatWindow.webContents.on('crashed', () => {
        pcUtils.info('mainChatWindow crashed');
        mainChatWindow.hide();
        if (mainUrl !== null && mainUrl !== '') {
            dialog.showErrorBox("e-message", "进程崩溃，将重新加载");
            //重新加载主页面
            //initMainChatWinodw(mainUrl);
            mainChatWindow.reload(function() {
                mainChatWindow.show();
            });

        } else {
            dialog.showErrorBox("e-message", "进程崩溃，请重新登陆");
            //注销，重新登录
            localconfig.setLogout(true, function() {
                if (mainWindow) {
                    mainWindow.removeAllListeners('close');
                    mainWindow.webContents.send('pc-send-logout');
                }
                if (platform.Windows) {
                    mainWindow = null;
                    app.quit();
                } else {
                    mainWindow.close();
                    ImageViewPageUtil._currentTipWindow.close();
                    mainWindow = null;
                    ImageViewPageUtil._currentTipWindow = null;
                    LoginAndChatWin.chatWin = null;
                    mainWindow = LoginAndChatWin.loginWin;
                    LoginAndChatWin.loginWin.reload()
                }
            });
        }
    });


    // 聊天窗口获得焦点
    mainChatWindow.on('focus', function() {
        if (mainChatWindow) {
            mainChatWindow.webContents.send('pc_focus');
            TrayUtils.setTrayCommon();
            mainChatWindow.webContents.send('user-click-tray');
        }
        //win10屏幕缩放比例导致白边，解决窗口左侧白边
        if (isAllowNewChatWin && platform.Windows) {
            mainChatWindow.setSize(winWidth, winHeight);
        }
    });

    mainChatWindow.on('hide', function() {
        isMainWinodwHided = true;
        mainChatWindow.blur();
    });
    mainChatWindow.on('show', function() {
        isMainWinodwHided = false;
        //win10屏幕缩放比例导致白边，解决窗口左侧白边
        if (isAllowNewChatWin && platform.Windows) {
            mainChatWindow.setSize(winWidth, winHeight);
        }
        mainChatWindow.focus();
    });

    // 注册 打开工具栏快捷键
    registerWindowShortcut(mainChatWindow);
    // 图片查看窗口初始化
    ImageViewPageUtil.initImageViewPage(null);
    return mainChatWindow;
}

// 定义最终主窗口特性
function setMainWindowAttr() {
    mainWindow.on('close', function(event) {
        mainWindow.webContents.send('pc_out');
        event.preventDefault();

    });

    //主聊天窗口关闭，退出应用
    mainWindow.on('closed', function() {
        // mainWindow = null;
        // app.quit();
    });
}
/**
 * 新建一个BrowserWindow窗口
 * @param name  窗口名称
 * @param windowCondif  窗口属性设置
 * @returns {*}
 */
function getWindow(name, windowCondif) {
    if (windows[name]) return windows[name];
    windows[name] = new BrowserWindow(windowCondif);

    windows[name].webContents.on('new-window', function(event, url, name) {
        //if (!event) return;
        //event.preventDefault();
        openANewMaximizeWindow(url, name);
    });
    windows[name].on('closed', function() {
        var win = windows[name];
        delete windows[name];
        win = name = null;
    });

    return windows[name];
}
/**
 * 打开一个最大化新窗口
 * @param url  要加载的地址
 * @param name  窗口名称（标识）
 */
function openANewMaximizeWindow(url, name) {
    var winOptions = {
        title: 'e-message',
        show: false,
        skipTaskbar: false,
        frame: true,
        center: true,
        useContentSize: true,
        'webPreferences': {
            'preload': path.join(DIR_PATH, 'preload.js')
        }
    };
    name = name || new Date().getTime() + '';
    var win = getWindow(name, winOptions);
    win.maximize();
    win.loadURL(url);
    win.show();
}
/*--------------------------------  登陆窗口 和 主聊天 窗口设置  end  --------------------------------*/


/*--------------------------------  系统托盘  start  --------------------------------*/

var TrayConfig = {
    trayIsbusying: false,
    trayCount: 0,
    trayInterval: null,
    trayOffline: false
};
if (platform.Windows) {
    TrayConfig.trayCommonIco = nativeImage.createFromPath(path.join(DIR_PATH, appConfig.trayConfig.commonIco));
    TrayConfig.trayBusyIco = nativeImage.createFromPath(path.join(DIR_PATH, appConfig.trayConfig.busyIco));
    TrayConfig.trayOfflineIco = nativeImage.createFromPath(path.join(DIR_PATH, appConfig.trayConfig.offlineIco));
} else if (platform.OSX) {
    TrayConfig.trayCommonIco = nativeImage.createFromPath(path.join(DIR_PATH, appConfig.trayConfig.macCommonIco));
    TrayConfig.trayBusyIco = nativeImage.createFromPath(path.join(DIR_PATH, appConfig.trayConfig.macBusyIco));
    TrayConfig.trayOfflineIco = nativeImage.createFromPath(path.join(DIR_PATH, appConfig.trayConfig.macOfflineIco));
}

var TrayMenu = {
    winLogin: [{
            label: '显示窗口',
            click: function() {
                showAndFocusMainWindow();
            }
        },
        {
            label: '退出',
            click: function(item) {
                app.quit();
            }
        }
    ],
    winChat: [{
            label: '显示窗口',
            click: function() {
                showAndFocusMainWindow();
            }
        },
        {
            label: '清理缓存',
            click: function() {
                var win = LoginAndChatWin.chatWin;
                if (win) {
                    win.webContents.session.clearCache(function() {
                        win.hide();
                        win.webContents.send('before-reload');
                        win.reload();
                    });
                }
                //将窗口分离的其他窗口也关掉
                try {
                    var chatWin = WindowsDepartUtils.currentChatWindow;
                    var openWin = WindowsDepartUtils.currentOpenWindow;
                    if (chatWin) {
                        chatWin.webContents.session.clearCache(function() {
                            //关闭方法已经改为隐藏
                            chatWin.close();
                            pcUtils.info('====窗口分离会话窗口清理缓存====');
                        });
                    }
                    if (openWin) {
                        openWin.webContents.session.clearCache(function() {
                            openWin.close();
                            pcUtils.info('====窗口分离功能窗口清理缓存====');
                        });
                    }
                } catch (err) {}
            }
        },
        {
            label: '注销',
            click: function() {
                localconfig.setLogout(true, function() {
                    if (mainWindow) {
                        mainWindow.removeAllListeners('close');
                        mainWindow.webContents.send('pc-send-logout');
                    }
                    if (platform.Windows) {
                        mainWindow = null;
                        app.quit();
                    } else {
                        mainWindow.close();
                        ImageViewPageUtil._currentTipWindow.close();
                        mainWindow = null;
                        ImageViewPageUtil._currentTipWindow = null;
                        LoginAndChatWin.chatWin = null;
                        mainWindow = LoginAndChatWin.loginWin;
                        LoginAndChatWin.loginWin.reload()
                    }
                });
            }
        },
        {
            label: '退出',
            click: function(item) {
                if (mainWindow) {
                    mainWindow.removeAllListeners('close');
                    mainWindow.webContents.send('pc-send-logout');
                }
                mainWindow = null;
                app.quit();
            }
        }
    ]
};

var TrayUtils = {
    showBalloon: function(config) {
        if (appTray.isDestroyed()) return;
        if (platform.Windows) {
            appTray.displayBalloon({
                // icon: path.join(DIR_PATH, '/web_contents/images/logo.ico'),  // 图片必须是ico格式
                title: config.title,
                content: config.content
            });
        }
    },
    setToolTip: function(toolTip) {
        if (appTray.isDestroyed()) return;
        appTray.setToolTip(toolTip);
    },
    setTrayBusy: function() {
        if (appTray.isDestroyed()) return;
        var _this = this;
        // !mainWindow.isFocused() &&
        if (!TrayConfig.trayIsbusying) {
            TrayConfig.trayInterval = setInterval(_this._trayBusying, 400);
            TrayConfig.trayIsbusying = true;
        }
    },
    // 在正常图标与忙碌图标间切换
    _trayBusying: function() {
        if (appTray.isDestroyed()) return;
        var trayPath = TrayConfig.trayCount % 2 == 0 ? TrayConfig.trayBusyIco : TrayConfig.trayCommonIco;
        appTray.setImage(trayPath);
        TrayConfig.trayCount++;
    },
    // 置托盘图标为正常状态
    setTrayCommon: function() {
        if (appTray.isDestroyed()) return;
        if (TrayConfig.trayIsbusying) {
            clearInterval(TrayConfig.trayInterval);
            TrayConfig.trayInterval = null;
            TrayConfig.trayIsbusying = false;
            appTray.setImage(TrayConfig.trayCommonIco);
            TrayConfig.trayCount = 0;
        } else if (TrayConfig.trayOffline) {
            appTray.setImage(TrayConfig.trayCommonIco);
        }
    },
    setTrayOffline: function() {
        if (appTray.isDestroyed()) return;
        appTray.setImage(TrayConfig.trayOfflineIco);
        TrayConfig.trayOffline = true;
    },
    setContextMenu: function(menuArr) {
        if (appTray.isDestroyed()) return;
        var contextMenu = Menu.buildFromTemplate(menuArr);
        appTray.setContextMenu(contextMenu);
    }
};

function showAndFocusMainWindow() {
    // 正在升级，不显示主窗口
    if (isUpdating) return;
    try {
        if (mainWindow != null) {
            mainWindow.show();
            mainWindow.focus();
        }
        var chatWin = WindowsDepartUtils.currentChatWindow;
        if (isAllowNewChatWin && chatWin && (!chatWin.isDestroyed()) && chatWin.isVisible()) {
            chatWin.show();
            chatWin.focus();
        }
    } catch (e) {
        console.log(e)
    }
}

/**
 * 设置托盘图标 及 托盘图标菜单和事件。
 */
function initAppTray() {
    appTray = new Tray(TrayConfig.trayCommonIco);

    TrayUtils.setContextMenu(TrayMenu.winLogin);

    appTray.setToolTip(appConfig.trayConfig.trayToolTipMessage);

    // 托盘图标单机事件
    appTray.on('click', function(event, bounds) {
        // 聊天窗口才变换
        if (LoginAndChatWin.chatWin && !TrayConfig.trayOffline) {
            LoginAndChatWin.chatWin.webContents.send('user-click-tray');
            TrayUtils.setTrayCommon();
        }
        showAndFocusMainWindow();
        if (LoginAndChatWin.chatWin) {
            LoginAndChatWin.chatWin.webContents.send('apply-chatwin-func', 'trayClick');
        }
    });

    if (platform.OSX) {
        appTray.on('right-click', function(event, bounds) {
            showAndFocusMainWindow();
        });
    }

    if (platform.Windows) {
        appTray.on('balloon-click', function() {
            showAndFocusMainWindow();
        });

        // 变更托盘提示内容
        // args为 { title: '', content: '' }形式
        ipcMain.on('tray-balloon-show', (event, args) => {
            TrayUtils.showBalloon(args);
        });
    }

    // 托盘鼠标悬停文字
    ipcMain.on('tray-setToolTip', (event, args) => {
        TrayUtils.setToolTip(args);
    });

    // 变更托盘图标为有信息
    ipcMain.on('tray-setTrayBusy', (event, args) => {
        TrayUtils.setTrayBusy();
    });
    // 变更托盘图标为正常状态
    ipcMain.on('tray-setTrayCommon', (event, args) => {
        TrayUtils.setTrayCommon();
    });
    // 变更托盘图标为离线状态
    ipcMain.on('tray-offlineStatus', (event, args) => {
        TrayUtils.setTrayOffline();
    });
}
/*--------------------------------  系统托盘  end  --------------------------------*/


/*--------------------------------  消息提醒小窗口工具  start  --------------------------------*/
var AppTipWindowUtil = {
    _currentTipWindow: null,
    _tipPushInterval: null,
    _messageQueue: new Array(), // 提醒消息队列
    _pushInQueue: function(args) {
        this._messageQueue.unshift(args);
    },
    _popFromQueue: function() {
        return this._messageQueue.pop();
    },

    // 初始化提醒窗口
    initAppTipWindow: function(domreadyCb) {
        var _this = this;
        var tipTaskbar = _this.getTipTaskbar();
        var options = {
            resizable: false,
            frame: false,
            show: false,
            x: tipTaskbar.x,
            y: tipTaskbar.y,
            width: tipTaskbar.winWidth,
            height: tipTaskbar.winHeight,
            skipTaskbar: true,
            alwaysOnTop: true,
            transparent: GLOBAL_INFOS.isAeroGlassEnabled,
            'webPreferences': {
                'preload': path.join(DIR_PATH, 'preload.js')
            }
        };
        var appTipWindow = new BrowserWindow(options);
        var htmlFile = 'file://' + DIR_PATH + '/web_contents/remind/remind.html';
        appTipWindow.loadURL(htmlFile);
        appTipWindow.webContents.on('dom-ready', function(event) {
            if (platform.Windows) {
                appTipWindow.show();
                if (!appTipWindow.isFocused()) {
                    appTipWindow.minimize();
                    appTipWindow.showInactive();
                }
            } else {
                appTipWindow.showInactive();
            }
            //提示框弹出但不获取焦点         
            typeof domreadyCb === 'function' && domreadyCb();
        });
        // 如果窗口被关闭了，用这个回调
        appTipWindow.on('closed', function(event) {
            _this._currentTipWindow = null;
            clearInterval(AppTipWindowUtil._tipPushInterval);
            AppTipWindowUtil._tipPushInterval = null;
        });

        // 注册 打开工具栏快捷键
        registerWindowShortcut(appTipWindow);
        _this._currentTipWindow = appTipWindow;
    },
    // 获取Tip弹出位置
    getTipTaskbar: function() {
        var taskbar = {};
        taskbar.winWidth = appConfig.windowSize.appTipWin.width;
        taskbar.winHeight = appConfig.windowSize.appTipWin.height;
        var primaryDisplay = electronScreen.getPrimaryDisplay();
        var workAreaSize = primaryDisplay.workArea; //工作空间 h w x y
        taskbar.x = workAreaSize.width + workAreaSize.x - taskbar.winWidth - 20;
        taskbar.y = workAreaSize.height + workAreaSize.y - taskbar.winHeight;
        return taskbar;
    },
    // 打开提醒窗口
    showAppTipWindow: function(args) {
        var _this = this;
        _this._pushInQueue(args);
        if (AppTipWindowUtil._tipPushInterval == null) {
            AppTipWindowUtil._tipPushInterval = setInterval(function() {
                if (AppTipWindowUtil._messageQueue.length > 0) {
                    var _pop = AppTipWindowUtil._popFromQueue();
                    if (AppTipWindowUtil._currentTipWindow != null) {
                        AppTipWindowUtil._executeShow(_pop);
                    } else {
                        AppTipWindowUtil.initAppTipWindow(function() {
                            AppTipWindowUtil._executeShow(_pop);
                        });
                    }
                } else {
                    clearInterval(AppTipWindowUtil._tipPushInterval);
                    AppTipWindowUtil._tipPushInterval = null;
                }
            }, 800);
        }

    },
    _executeShow: function(args) {
        var _this = this;
        pcUtils.info('打开提醒：详细信息===== ' + JSON.stringify(args));
        if (args != null && typeof args != 'undefined') {
            _this._currentTipWindow.webContents.send('plugin-remind-htmlFile', args);
        }
    }
};

// 消息通道 - 打开消息提醒窗口
ipcMain.on('plugin-remind-show', (event, args) => {
    pcUtils.info('plugin-remind-show=== ' + JSON.stringify(args));
    AppTipWindowUtil.showAppTipWindow(args);
});
/*--------------------------------  消息提醒小窗口工具  end  --------------------------------*/


/*--------------------------------  图片浏览窗口  start  --------------------------------*/
var ImageViewPageUtil = {
    _currentTipWindow: null,
    initImageViewPage: function(imgInfos) {
        var _this = this;
        var screenSize = electronScreen.getPrimaryDisplay().bounds;
        var imageViewWindow = new BrowserWindow({
            width: Math.round(screenSize.width * 0.8),
            height: Math.round(screenSize.height * 0.8),
            useContentSize: true,
            resizable: false,
            show: false,
            frame: false,
            transparent: GLOBAL_INFOS.isAeroGlassEnabled,
            'webPreferences': {
                'preload': path.join(DIR_PATH, 'preload.js')
            }
        });
        //var htmlFile = 'file://' + DIR_PATH + '/web_contents/viewImgs/viewImgs.html';
        var url = GLOBAL_INFOS.currentHost + '/social/im/imageReview.jsp?from=pc&frompc=true';
        imageViewWindow.loadURL(url);

        imageViewWindow.on('close', function(event) {
            /*
            if(_this._currentTipWindow) {
            	_this._currentTipWindow.webContents.session.clearCache(function(){
            		pcUtils.info('imageViewWindow  clearCache');
            	});
            }
            */
            _this._currentTipWindow = null;
        });

        imageViewWindow.webContents.on('dom-ready', function(event) {
            _this._currentTipWindow.webContents.send('plugin-imageView-htmlFile', imgInfos);
        });

        // 注册 打开工具栏快捷键
        registerWindowShortcut(imageViewWindow);

        _this._currentTipWindow = imageViewWindow;
    },
    showImageViewWindow: function(imgInfos) {
        pcUtils.info('plugin-imageView-htmlFile');
        var _this = this;
        if (_this._currentTipWindow == null) {
            _this.initImageViewPage(imgInfos);
        } else {
            _this._currentTipWindow.webContents.send('plugin-imageView-htmlFile', imgInfos);
        }
    }
};
// 消息通道 - 打开消息提醒窗口
ipcMain.on('plugin-imageView-show', (event, args) => {
    ImageViewPageUtil.showImageViewWindow(args);
});
ipcMain.on('plugin-imageView-close', (event, args) => {
    var win = ImageViewPageUtil._currentTipWindow;
    if (win !== null) {
        win.hide();
    }
});
/*--------------------------------  图片浏览窗口  end  --------------------------------*/


/*--------------------------------  C# 扩展功能插件  start  --------------------------------*/

// 截屏
ipcMain.on('plugin-screenshot', (event, arg) => {
    if (platform.Windows) {
        var flag = shell.openExternal(path.join(DIR_PATH, '/extension/CaptureImageTool.exe'), { 'activate': true });
        event.returnValue = flag;
    } else if (platform.OSX) {
        event.returnValue = false;
    }
});

// 获得屏幕任务栏位置和高度
var taskbarDllMethod = null;

function gettaskbarPostion(callback) {
    if (platform.Windows) {
        let workareasize = electron.screen.getPrimaryDisplay().workAreaSize;
        let screensize = electron.screen.getPrimaryDisplay().size;

        pcUtils.debug('workareasize:' + workareasize);
        pcUtils.debug('screensize:' + screensize);

        let w = null,
            h = null,
            site = null;
        if (screensize.height > workareasize.height) {
            h = screensize.height - workareasize.height;
            w = screensize.width;
            site = 'bottom';
        } else {
            h = workareasize.height;
            w = screensize.width - workareasize.width;
            site = 'right';
        }
        let taskbar = { width: w, height: h, site: site };
        if (callback) callback(taskbar);
    } else if (platform.OSX) {
        var taskbar = { width: 0, height: 0 };
        taskbar.site = 'bottom'; //任务栏默认在底部
        if (callback) callback(taskbar);
    }

}

/*--------------------------------  C# 扩展功能插件  end  --------------------------------*/

/*--------------------------------  快捷键相关定义  start  --------------------------------*/
var GlobalShortMethods = {
    SCREENSHOT: 'screenshot',
    OPENDEVPTOOL: 'openDevpTool',
    OPENANDHIDEWIN: 'openAndHideWin',
    CLOSEALLCHATWIN: 'closeAllChatWin',
    CLOSECHATWIN: 'closeChatWin'
};

var GlobalShortcutUtils = {
    // 注册快捷键
    register: function(oldKey, newKey, methodName) {
        try {
            if (!methodName || !GlobalShortcutUtils[methodName] || (newKey && globalShortcut.isRegistered(newKey))) {
                return false;
            }

            if (oldKey) {
                globalShortcut.unregister(oldKey);
            }
            if (newKey) {
                globalShortcut.register(newKey, () => {
                    GlobalShortcutUtils[methodName].apply(null, []);
                });
            }
            return true;
        } catch (e) {
            pcUtils.info(e);
            return false;
        }
    },
    // 截图
    screenshot: function() {
        if (!GLOBAL_INFOS.isScreenShoting) {
            GLOBAL_INFOS.isScreenShoting = true;
            var win = null;
            if (isAllowNewChatWin) {
                win = WindowsDepartUtils.currentChatWindow;
            } else {
                win = LoginAndChatWin.chatWin;
            }
            var isChatWinFocused = win ? (win.isFocused()) : false;
            var flag = false;
            var isScreenHide = false;
            if (win.isAlwaysOnTop()) {
                win.setAlwaysOnTop(false);
                flag = true;
            }
            if (typeof GLOBAL_INFOS.userConifg.isScreenShotMinimize !== 'undefined' && GLOBAL_INFOS.userConifg.isScreenShotMinimize == 1 && isChatWinFocused) {
                isScreenHide = true;
                pcUtils.info('======screenshot=========截图隐藏窗口=======');
                win.hide();
            }
            setTimeout(function() {
                shell.openExternal(path.join(DIR_PATH, '/extension/CaptureImageTool.exe'), true);
                setTimeout(function() {
                    if (flag) {
                        win.setAlwaysOnTop(true);
                    }
                    if (isScreenHide) {
                        win.show();
                    }
                    if (win) { //有截图信息
                        win.webContents.send('screenshot-hotkey', { 'isChatWinFocused': isChatWinFocused });
                    }
                    GLOBAL_INFOS.isScreenShoting = false;
                }, 2000);
            }, 200);

        }
    },


    // 呼入和隐藏聊天窗口
    openAndHideWin: function() {
        var chatWin = null;
        if (isAllowNewChatWin) {
            chatWin = WindowsDepartUtils.currentChatWindow;
            if (chatWin != null && chatWin != undefined) {
                if (platform.Windows && !chatWin.isVisible) {
                    chatWin = LoginAndChatWin.chatWin;
                }
                if (platform.OSX && !leftWinStatus) {
                    chatWin = LoginAndChatWin.chatWin;
                }
            } else {
                chatWin = LoginAndChatWin.chatWin;
            }
        } else {
            chatWin = LoginAndChatWin.chatWin;
        }
        if (chatWin) {
            if (chatWin.isFocused() && !isMainWinodwHided) {
                if (isAllowNewChatWin) {
                    chatWin.minimize();
                } else {
                    chatWin.hide();
                }
            } else if (isMainWinodwHided ||
                chatWin.isMinimized() ||
                !chatWin.isVisible() ||
                (!isMainWinodwHided && !chatWin.isFocused()) ||
                chatWin.isMinimized()) {
                chatWin.show();
            }
        }
    },
    // 打开调试工具
    openDevpTool: function() {
        var win = BrowserWindow.getFocusedWindow();
        if (win) {
            win.setResizable(true);
            win.openDevTools();
            //打开调试之后最大化,窗口分离不需要最大化
            if (!isAllowNewChatWin) {
                win.maximize();
            }
        }
    },
    // 关闭所有聊天窗口
    closeAllChatWin: function() {
        var chatWin = null;
        if (isAllowNewChatWin) {
            chatWin = WindowsDepartUtils.currentChatWindow;
        } else {
            chatWin = LoginAndChatWin.chatWin;
        }
        if (chatWin) {
            var isChatWinFocused = chatWin ? (chatWin.isFocused()) : false;
            if (isChatWinFocused) {
                chatWin.webContents.send('closeallchatwin-hotkey');
            }

        }
    },
    // 关闭聊天窗口
    closeChatWin: function() {
        var chatWin = null;
        if (isAllowNewChatWin) {
            chatWin = WindowsDepartUtils.currentChatWindow;
        } else {
            chatWin = LoginAndChatWin.chatWin;
        }
        if (chatWin) {
            var isChatWinFocused = chatWin ? (chatWin.isFocused()) : false;
            if (isChatWinFocused) {
                chatWin.webContents.send('closechatwin-hotkey');
            }

        }
    }
};

function registerWindowShortcut(win) {
    //打开调试工具
    var openDevpToolKey = null;
    if (platform.Windows) {
        openDevpToolKey = 'CTRL+ALT+M';
    } else if (platform.OSX) {
        openDevpToolKey = 'CONTROL+COMMAND+M';
    }
    electronLocalshortcut.register(win, openDevpToolKey, (event) => {
        pcUtils.info('======registerWindowShortcut======press======' + openDevpToolKey);
        GlobalShortcutUtils.openDevpTool();
    });
}

// 注册快捷键
ipcMain.on('globalshortcut-slave', (event, args) => {
    var oldKey = args.oldKey;
    var newKey = args.newKey;
    var execMethodName = args.execMethodName;
    event.returnValue = GlobalShortcutUtils.register(oldKey, newKey, execMethodName);

});
/*--------------------------------  快捷键相关定义  end  --------------------------------*/


/*--------------------------------  定义一些全局量  start  --------------------------------*/
// 全局参数
var GLOBAL_INFOS = {
    userInfos: {
        currentHost: '', // 当前登陆人的OA全地址,http://XXX
        loginId: '',
        userName: '',
        sessionKey: '', // 登陆后的sessionKey,
        language: 7, // 默认简体中文
        loginTime: new Date().getTime(),
        password: '' //新增密码记录，验证重新登陆
    },
    isScreenShoting: false, //截屏是否正在使用
    currentHost: '',
    sessionKey: '',
    appPath: DIR_PATH,
    newBuildVersion: {
        buildVersion: -1,
        osxBuildVersion: -1
    },
    isAeroGlassEnabled: false,
    userConifg: null, // 用户本地配置文件
    dirServerConifg: {
        isServerStarted: false,
        currentPort: null
    }
};

//获取操作系统类型信息
ipcMain.on('global-getPlatform', (event, args) => {
    event.returnValue = platform;
});

// 记录用户基本信息
ipcMain.on('global-setUserInfos', (event, args) => {
    var extend = require('extend');
    GLOBAL_INFOS.userInfos = extend(GLOBAL_INFOS.userInfos, args);
});
// 获取用户基本信息
ipcMain.on('global-getUserInfos', (event, args) => {
    event.returnValue = GLOBAL_INFOS.userInfos;
});

ipcMain.on('global-getImagesDir', (event, args) => {
    event.returnValue = path.join(DIR_PATH, '/web_contents/images');
});

// 记录当前用户的oa地址‘http://xxxx’
ipcMain.on('global-setHost', (event, args) => {
    GLOBAL_INFOS.currentHost = args;
});
ipcMain.on('global-getHost', (event, args) => {
    event.returnValue = GLOBAL_INFOS.currentHost;
});

// 设置和获取登陆后用户的sessionID
ipcMain.on('global-setSessionKey', (event, args) => {
    GLOBAL_INFOS.sessionKey = args;
});
ipcMain.on('global-getSessionKey', (event, args) => {
    event.returnValue = GLOBAL_INFOS.sessionKey;
});

ipcMain.on('global-getAppPath', (event, args) => {
    event.returnValue = GLOBAL_INFOS.appPath;
});

// 设置和获取oa地址的最新版本号
ipcMain.on('global-setNewBuildVersion', (event, args) => {
    GLOBAL_INFOS.newBuildVersion = args;
});
ipcMain.on('global-getNewBuildVersion', (event, args) => {
    event.returnValue = GLOBAL_INFOS.newBuildVersion;
});

// 获得系统是否支持透明
ipcMain.on('global-getIsAeroGlassEnabled', (event, args) => {
    event.returnValue = GLOBAL_INFOS.isAeroGlassEnabled;
});

// 配置文件信息
ipcMain.on('global-setUserConifg', (event, args) => {
    var conifg = args.config;
    var callback = args.callback;
    localconfig.set(GLOBAL_INFOS.userInfos, conifg, callback);
    GLOBAL_INFOS.userConifg = conifg;
});
ipcMain.on('global-getUserConifg', (event, args) => {
    if (GLOBAL_INFOS.userConifg) {
        event.returnValue = GLOBAL_INFOS.userConifg;
    } else {
        localconfig.get(args, function(err, config) {
            if (err) pcUtils.info('global-getUserConifg  err = ' + err);
            if (!err) {
                GLOBAL_INFOS.userConifg = config;
            }
            event.returnValue = GLOBAL_INFOS.userConifg;
        });
    }
});

// 传输文件夹配置
ipcMain.on('global-getDirServerConifg', (event, args) => {
    event.returnValue = GLOBAL_INFOS.dirServerConifg;
});
ipcMain.on('global-setDirServerConifg', (event, args) => {
    GLOBAL_INFOS.dirServerConifg = args;
});

/*--------------------------------  定义一些全局量  end  --------------------------------*/


/*--------------------------------  ipcMain中转  start  --------------------------------*/
// 中转消息到主聊天窗口
ipcMain.on('send-to-mainChatWin', (event, args) => {
    if (LoginAndChatWin.chatWin) {
        LoginAndChatWin.chatWin.webContents.send(args.event, args.args);
    }
});
/*--------------------------------  ipcMain中转  end  --------------------------------*/


/*--------------------------------  注册一些通信事件  start  --------------------------------*/
// 主窗口最大化按钮
ipcMain.on('set-mainwindow-max', (event, args) => {
    var width = 0;
    try {
        width = args.width;
    } catch (err) {
        width = 0;
    }
    var mainChatWinMinWidth = 0;
    if (width === 0 || width === undefined) {
        mainChatWinMinWidth = appConfig.windowSize.mainChatWin.minWidth;
    } else {
        mainChatWinMinWidth = width;
    }
    var mainChatWinMinHeight = appConfig.windowSize.mainChatWin.minHeight;
    if (!(width === 0 || width === undefined)) {
        if (args.isMainWinMax) {
            var primaryDisplay = electronScreen.getPrimaryDisplay();
            mainWindow.setSize(mainChatWinMinWidth, primaryDisplay.bounds.height);
            mainWindow.center();
            mainWindow.setResizable(false);
        } else {
            mainWindow.setSize(mainChatWinMinWidth, appConfig.windowSize.mainChatWin.minHeight);
            mainWindow.center();
            mainWindow.setResizable(false);
        }
    } else {
        if (args || args.isMainWinMax) {
            gettaskbarPostion(function(taskbar) {
                // 设置窗口位置
                var primaryDisplay = electronScreen.getPrimaryDisplay();
                var offsetX = 0,
                    offsetY = 0;
                var winWidth = mainChatWinMinWidth,
                    winHeight = mainChatWinMinHeight;
                var sreenWidth = primaryDisplay.bounds.width;
                var sreenHeight = primaryDisplay.bounds.height;
                switch (taskbar.site) {
                    case 'top':
                        offsetX = 0;
                        offsetY = taskbar.height;
                        winWidth = sreenWidth;
                        winHeight = sreenHeight - taskbar.height;
                        break;
                    case 'bottom':
                        offsetX = 0;
                        offsetY = 0;
                        winWidth = sreenWidth;
                        winHeight = sreenHeight - taskbar.height;
                        break;
                    case 'left':
                        offsetX = taskbar.width;
                        offsetY = 0;
                        winWidth = sreenWidth - taskbar.width;
                        winHeight = sreenHeight;
                        break;
                    case 'right':
                        offsetX = 0;
                        offsetY = 0;
                        winWidth = sreenWidth - taskbar.width;
                        winHeight = sreenHeight;
                        break;
                    default:
                        break;
                }
                mainWindow.setBounds({
                    x: offsetX,
                    y: offsetY,
                    width: winWidth,
                    height: winHeight
                });

            });
        } else {
            //var primaryDisplay = electronScreen.getPrimaryDisplay();
            //var winWidth = primaryDisplay.bounds.width;
            mainWindow.setSize(mainChatWinMinWidth, mainChatWinMinHeight);
            mainWindow.center();
        }
        // 最大化时不可更改窗口大小，非最大化时刻更改。
        mainWindow.setResizable(!args.isMainWinMax);
    }
});

/*--------------------------------  注册一些通信事件  end  --------------------------------*/




/*--------------------------------  下载监控  start  --------------------------------*/
var DownloadItems = {};

function initDownloadSetting() {
    //app.on('browser-window-created', function(event, window){
    if (mainWindow) {
        ipcMain.on('download-complete', (event, args) => {
            delete DownloadItems[args];
        });
        mainWindow.webContents.session.on('will-download', function(event, item, webContents) {
            console.log('a new download event');
            event.preventDefault();
            console.log('=======1=======' + DownloadItems[url]);
            var url = item.getURL();
            var filename = item.getFilename();
            var fileSize = item.getTotalBytes();
            if (DownloadItems[url] === false) return;
            if (DownloadItems[url]) {
                dialog.showMessageBox(BrowserWindow.fromWebContents(webContents), {
                    type: 'info',
                    title: '提示',
                    message: '该文件正在下载',
                    buttons: []
                });
                return;
            }
            DownloadItems[url] = false;
            if (false) {
                // 如果配置了默认保存路径，那么不弹出保存对话框，直接保存文件到默认路径。
                var defaultDlPath = 'C://';
                var fse = require('fs-extra');
                fse.ensureDir(defaultDlPath, function(err) {
                    if (err) throw err;
                    var dlObj = {
                        url: url,
                        filePath: path.join(defaultDlPath, filename)
                    };
                    mainWindow.webContents.send('create-new-download', dlObj);
                    DownloadItems[url] = true;
                });
            } else {
                var index = filename.lastIndexOf('.');
                var name = platform.Windows ? filename.substring(0, index) : filename;
                var ext = filename.substring(index + 1);
                var querystring = require('querystring');
                dialog.showSaveDialog(BrowserWindow.fromWebContents(webContents), {
                    title: '另存为',
                    defaultPath: querystring.unescape(name),
                    filters: [
                        { name: '文件类型', extensions: [ext] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                }, function(filepn) {
                    delete DownloadItems[url];
                    console.log('=======2=====' + DownloadItems[url]);
                    if (filepn) {
                        var dlObj = {
                            url: url,
                            filePath: filepn,
                            ext: ext
                        };
                        mainWindow.webContents.send('create-new-download', dlObj);
                        DownloadItems[url] = true;
                    }
                });
            }
        });
    }
    //});
}
/*--------------------------------  下载监控  end  --------------------------------*/

/*--------------------------------  电源事件  start  --------------------------------*/
function initPowerMonitorEvents() {
    const powerMonitor = electron.powerMonitor;

    // 系统即将进入睡眠，进入休眠将断开网络连接
    powerMonitor.on('suspend', function() {
        //将主窗口最小化
        mainWindow.minimize();
        pcUtils.info('powerMonitor suspend');
    });
}
/*--------------------------------  电源事件  end  --------------------------------*/
//客户端忽略https证书错误，让登陆不要失败
app.commandLine.appendSwitch('ignore-certificate-errors');
//禁用http缓存，防止每次都要清理缓存，但是可能会导致加载时间增加
app.commandLine.appendSwitch("disable-http-cache");
/*--------------------------------  app对象相关定义  start  --------------------------------*/
/**
 * 程序开始执行
 */
app.on('ready', function() {
    //  electron.screen只能在ready方法里获取到。
    electronScreen = electron.screen;

    // 系统是否支持透明属性
    var isAeroGlassEnabled = false;
    if (platform.Windows) {
        //win10 情况下 cpu会升高 暂时去掉
        // isAeroGlassEnabled = systemPreferences.isAeroGlassEnabled();
    } else if (platform.OSX) {
        //mac版本去掉透明属性窗口变成圆角
        //isAeroGlassEnabled = true;
    }
    GLOBAL_INFOS.isAeroGlassEnabled = isAeroGlassEnabled;
    // 是否来自自动升级
    if (localconfig.validLogoutThenUpgrade()) {
        // 下载升级
        localconfig.getLogoutThenUpgrade(function(obj) {
            GLOBAL_INFOS.currentHost = obj.currentHost;
            GLOBAL_INFOS.sessionKey = obj.sessionKey;
            GLOBAL_INFOS.newBuildVersion = obj.newBuildVersion;

            initUpdateWindow();
        });
    } else {
        // 正常启动

        //初始化登陆页面
        LoginAndChatWin.loginWin = initLoginWindow();
        mainWindow = LoginAndChatWin.loginWin;

        // 下载监控
        initDownloadSetting();
    }

    //托盘图标
    initAppTray();

    // 注册电源变化监听事件
    initPowerMonitorEvents();
    //加载标签
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
});

app.on('will-quit', function(event) {
    // 清除快捷键配置
    globalShortcut.unregisterAll();
});

// 退出后事件
app.on('quit', function(event) {
    console.log('capture quiting')
    // 是否是注销
    localconfig.getLogoutSet(function(data) {
        if (data) {
            if (isDevelop) {
                let file = global.process.mainModule.filename;
                let exe = global.process.execPath;
                exec(exe + " " + file, (error, stdout, stderr) => {});
            } else {
                //执行该操作相当于重新打开应用
                shell.openItem(global.process.execPath);
            }
        }
        console.info('app on quit');
    });
});

// 退出应用
ipcMain.on('quit-app', (event, args) => {
    console.info('ipcMain on quit-app');
    if (mainWindow) mainWindow.removeAllListeners('close');
    app.exit();
});

// 退出并自动重启应用
ipcMain.on('quit-restart-app', (event, args) => {
    pcUtils.info('ipcMain quit-restart-app');
    if (mainWindow) mainWindow.removeAllListeners('close');
    shell.openItem(process.execPath);
    app.quit();
});

process.on('uncaughtException', function(error) {
    pcUtils.info('process uncaughtException');
    pcUtils.info(error);
    pcUtils.handleError(error);
    pcUtils.showError(error);
});
/*--------------------------------  app对象相关定义  end  --------------------------------*/

/*--------------------------------  网盘浏览窗口  start  --------------------------------*/
var NetWorkDiskUtil = {
    _currentTipWindow: null,
    initNetWorkDisk: function(infos) {
        var _this = this;
        var screenSize = electronScreen.getPrimaryDisplay().bounds;
        var netWorkDiskWindow = new BrowserWindow({
            title: '我的云盘',
            width: Math.round(screenSize.width * 0.7),
            height: 900,
            useContentSize: true,
            resizable: true,
            show: false,
            frame: false,
            transparent: false,
            'webPreferences': {
                'preload': path.join(DIR_PATH, 'preload.js')
            }
        });
        var url = GLOBAL_INFOS.currentHost + '/social/im/NetWorkDisk.jsp?url=' + infos;
        netWorkDiskWindow.loadURL(url);
        netWorkDiskWindow.on('close', function(event) {
            _this._currentTipWindow = null;
        });
        // 注册 打开工具栏快捷键
        registerWindowShortcut(netWorkDiskWindow);

        _this._currentTipWindow = netWorkDiskWindow;
        _this.showNetWorkDiskWindow(infos);
    },
    showNetWorkDiskWindow: function(infos) {
        var _this = this;
        if (_this._currentTipWindow == null) {
            _this.initNetWorkDisk(infos);
        } else {
            var url = GLOBAL_INFOS.currentHost + '/social/im/NetWorkDisk.jsp?url=' + infos;
            _this._currentTipWindow.loadURL(url);
            _this._currentTipWindow.show();
        }
    }
};
//打开网盘窗口
ipcMain.on('plugin-netWorkDisk-show', (event, args) => {
    NetWorkDiskUtil.showNetWorkDiskWindow(args);
});
ipcMain.on('plugin-netWorkDisk-close', (event, args) => {
    var win = NetWorkDiskUtil._currentTipWindow;
    if (win) win.close();
});
/*--------------------------------  网盘浏览窗口  end  --------------------------------*/
/*--------------------------------  预览  start  --------------------------------*/
var ImgTextViewUtil = {
    imgTextViewList: {}, //报存已经打开的页面
    initImgTextView: function(infos) {
        var _this = this;
        var screenSize = electronScreen.getPrimaryDisplay().bounds;
        var imgTextViewWindow = new BrowserWindow({
            title: '我的云盘',
            width: Math.round(screenSize.width * 0.7),
            height: 900,
            useContentSize: true,
            resizable: false,
            show: false,
            frame: false,
            transparent: false,
            'webPreferences': {
                'preload': path.join(DIR_PATH, 'preload.js')
            }
        });
        var url = GLOBAL_INFOS.currentHost + '/social/im/ImgTextView.jsp?url=' + infos;
        imgTextViewWindow.loadURL(url);
        imgTextViewWindow.on('close', function(event) {
            delete _this.imgTextViewList[infos];
        });
        if (this.imgTextViewList[infos]) delete _this.imgTextViewList[infos];
        this.imgTextViewList[infos] = { viewWin: imgTextViewWindow };
        // 注册 打开工具栏快捷键
        registerWindowShortcut(imgTextViewWindow);
        _this.showimgTextViewWindow(infos);
        imgTextViewWindow.show();
    },
    showimgTextViewWindow: function(infos) {
        var _this = this;
        if (_this.imgTextViewList[infos] && _this.imgTextViewList[infos].viewWin) {
            _this.imgTextViewList[infos].viewWin.show();
        } else {
            _this.initImgTextView(infos);
        }
    }
};
//打开网盘窗口
ipcMain.on('plugin-imgTextView-show', (event, args) => {
    ImgTextViewUtil.showimgTextViewWindow(args);
});
/*--------------------------------  预览窗口  end  --------------------------------*/

/*--------------------------------  快捷键  start  --------------------------------*/
const version = electron.app.getVersion();
let template = [{
    label: '编辑',
    submenu: [{
        label: '撤销',
        accelerator: 'CmdOrCtrl+Z',
        role: 'undo'
    }, {
        label: '重做',
        accelerator: 'Shift+CmdOrCtrl+Z',
        role: 'redo'
    }, {
        type: 'separator'
    }, {
        label: '剪切',
        accelerator: 'CmdOrCtrl+X',
        role: 'cut'
    }, {
        label: '复制',
        accelerator: 'CmdOrCtrl+C',
        role: 'copy'
    }, {
        label: '粘贴',
        accelerator: 'CmdOrCtrl+V',
        role: 'paste'
    }, {
        label: '全选',
        accelerator: 'CmdOrCtrl+A',
        role: 'selectall'
    }]
}, {
    label: '查看',
    submenu: [{
        label: '重载',
        accelerator: 'CmdOrCtrl+R',
        click: function(item, focusedWindow) {
            if (focusedWindow) {
                // 重载之后, 刷新并关闭所有的次要窗体
                if (focusedWindow.id === 1) {
                    BrowserWindow.getAllWindows().forEach(function(win) {
                        if (win.id > 1) {
                            win.close();
                        }
                    });
                }
                focusedWindow.reload();
            }
        }
    }, {
        label: '切换全屏',
        accelerator: (function() {
            if (process.platform === 'darwin') {
                return 'Ctrl+Command+F';
            } else {
                return 'F11';
            }
        })(),
        click: function(item, focusedWindow) {
            if (focusedWindow) {
                focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
            }
        }
    }, {
        label: '切换开发者工具',
        accelerator: (function() {
            if (process.platform === 'darwin') {
                return 'CONTROL+COMMAND+I';
            } else {
                return 'Ctrl+Alt+I';
            }
        })(),
        click: function(item, focusedWindow) {
            if (focusedWindow) {
                focusedWindow.toggleDevTools();
            }
        }
    }]
}, {
    label: '窗口',
    role: 'window',
    submenu: [{
        label: '最小化',
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize'
    }, {
        label: '关闭',
        accelerator: 'CmdOrCtrl+W',
        role: 'close'
    }]
}];

function findReopenMenuItem() {
    const menu = Menu.getApplicationMenu();
    if (!menu) return;
    let reopenMenuItem;
    menu.items.forEach(function(item) {
        if (item.submenu) {
            item.submenu.items.forEach(function(item) {
                if (item.key === 'reopenMenuItem') {
                    reopenMenuItem = item;
                }
            });
        }
    });
    return reopenMenuItem;
}

if (process.platform === 'darwin') {
    const name = electron.app.getName();
    template.unshift({
        label: name,
        submenu: [{
            label: `关于 ${name} ${version}`,
            click: function() {
                electron.shell.openExternal('http://emessage.e-cology.com.cn/html/download.html');
            }
        }, {
            type: 'separator'
        }, {
            label: '服务',
            role: 'services',
            submenu: []
        }, {
            type: 'separator'
        }, {
            label: `隐藏 ${name}`,
            accelerator: 'Command+H',
            role: 'hide'
        }, {
            label: '隐藏其它',
            accelerator: 'Command+Alt+H',
            role: 'hideothers'
        }, {
            label: '显示全部',
            role: 'unhide'
        }, {
            type: 'separator'
        }, {
            label: '退出',
            accelerator: 'Command+Q',
            click: function() {
                if (mainWindow) {
                    mainWindow.removeAllListeners('close');
                    mainWindow.webContents.send('pc-send-logout');
                }
                mainWindow = null;
                app.quit();
            }
        }]
    });
    // 窗口菜单.
    template[3].submenu.push({
        type: 'separator'
    }, {
        label: '前置所有',
        role: 'front'
    });
}
app.on('browser-window-created', function() {
    let reopenMenuItem = findReopenMenuItem();
    if (reopenMenuItem) reopenMenuItem.enabled = false;
});

app.on('window-all-closed', function() {
    let reopenMenuItem = findReopenMenuItem();
    if (reopenMenuItem) reopenMenuItem.enabled = true;
});
/*--------------------------------  快捷键  end  --------------------------------*/

function getOsString() {
    var os = 'Windows';
    if (platform.OSX) {
        os = 'OSX';
    } else if (platform.Linux) {
        os = 'Linux';
    }
    return os;
}
/*--------------------------------  窗口分离功能  start  --------------------------------*/
var WindowsDepartUtils = {
    currentOpenWindow: null,
    currentChatWindow: null,
    winID: {},
    openNewWindow: function(args) {
        pcUtils.info('openNewWindow args===' + JSON.stringify(args));
        var _this = this;
        _this.initNewWindow(args);
    },
    openNewChatWin: function(args, winid) {
        pcUtils.info('openNewChatWin args===' + JSON.stringify(args) + "\nwinid=" + winid);
        var _args = args;
        var _this = this;
        var url = GLOBAL_INFOS.currentHost + '/social/im/newChatWin/SocialIMMain-ncl.jsp?frommain=yes&from=pc&isAero=' + GLOBAL_INFOS.isAeroGlassEnabled + '&pcOS=' + getOsString() + '&isAllowNewWin=1';
        //修改展示长度可以让文件标签样式不往下展示
        var newChatWin = new BrowserWindow({
            title: 'e-message聊天',
            width: 845,
            height: appConfig.windowSize.mainChatWin.height,
            useContentSize: true,
            resizable: true,
            show: false,
            frame: false,
            transparent: GLOBAL_INFOS.isAeroGlassEnabled,
            'webPreferences': {
                'preload': path.join(DIR_PATH, 'preload.js')
            }
        });

        newChatWin.loadURL(url);

        //监控关闭事件，让聊天窗口隐藏
        newChatWin.on('close', function(event) {
            pcUtils.info('newChatWin close == 让聊天窗口不关闭，只隐藏，加快下次打开的速度');
            if (mainWindow && !mainWindow.isVisible()) {
                if (newChatWin) {
                    newChatWin.hide();
                }
                newChatWin.webContents.send('plugin-hideChatWin-cbHandle');
                event.preventDefault();
            }
        });

        //获取焦点
        newChatWin.on('focus', function() {
            if (newChatWin) {
                newChatWin.webContents.send('chatwin_focus');
                TrayUtils.setTrayCommon();
                newChatWin.webContents.send('user-click-tray');
            }
        });

        //最大化
        newChatWin.on('maximize', function() {
            newChatWin.webContents.send('plugin-maximize-cbHandle');
        });

        //非最大化
        newChatWin.on('unmaximize', function() {
            newChatWin.webContents.send('plugin-unmaximize-cbHandle');
        });

        //在加载页面时，渲染进程第一次完成绘制时，会发出 ready-to-show 事件 。 在此事件后显示窗口将没有视觉闪烁：
        newChatWin.once('ready-to-show', () => {
            newChatWin.show()
        });

        newChatWin.webContents.on('dom-ready', function(event) {
            var winIdObj;
            if (winid !== undefined && winid !== 'undefined') {
                _this.winID = winid;
                _this.currentChatWindow.webContents.send('plugin-openUserChatWin-cbHandle', _args, winid);
            } else {
                winIdObj = {
                    'chatwinid': newChatWin.id,
                    'mainwinid': mainWindow.id
                };
                _this.winID = winIdObj;
                _this.currentChatWindow.webContents.send('plugin-openUserChatWin-cbHandle', _args, winIdObj);
            }
            newChatWin.show();

            if (!newChatWin.isFocused()) {
                newChatWin.minimize();
                newChatWin.show();
            }
        });

        //页面崩溃时执行操作
        newChatWin.webContents.on('crashed', function(event) {
            _this.currentChatWindow = null;
            if (newChatWin) {
                newChatWin.webContents.session.clearCache(function() {
                    newChatWin.close();
                    pcUtils.info('newChatWin  clearCache');
                });
                if (!newChatWin.isDestroyed()) {
                    try {
                        newChatWin.close();
                    } catch (err) {}
                }
            }
        });

        //页面加载完成时执行,如果页面没有重新加载，只会执行一次
        newChatWin.webContents.on('did-finish-load', function(event) {
            _this.currentChatWindow.webContents.send('plugin-newChatWin-didFinishLoad');
        });

        //页面加载失败
        newChatWin.webContents.on('did-fail-load', function(event) {
            try {
                _this.currentChatWindow.close();
                pcUtils.info('newChatWin did-fail-load');
            } catch (err) {
                _this.currentChatWindow = null;
                if (_this.currentChatWindow)
                    _this.currentChatWindow.close();
            }
        });

        //执行开发者工具刷新
        newChatWin.webContents.on('devtools-reload-page', function(event) {
            _this.currentChatWindow.webContents.send('plugin-newChatWin-reload-byDevTool');
        });



        // 注册 打开工具栏快捷键
        registerWindowShortcut(newChatWin);
        _this.currentChatWindow = newChatWin;
    },
    initNewWindow: function(args) {
        pcUtils.info('initNewWindow args=' + JSON.stringify(args));
        var _args = args.args;
        var _winId = args.newWinId;
        var url = '';
        var name = '';
        var content = '';
        var doid = '';

        if (_winId === 8) {
            name = _args.name;
            url = GLOBAL_INFOS.currentHost + '/social/im/newChatWin/SocialImNewWindow.jsp?id=' + _winId + '&name=' + name;
        } else if (_winId === 6) {
            content = _args.content;
            url = GLOBAL_INFOS.currentHost + '/social/im/newChatWin/SocialImNewWindow.jsp?id=' + _winId + '&content=' + content;
        } else if (_winId === 9) {
            content = _args.content;
            doid = _args.id;
            if (doid === '4') {
                url = GLOBAL_INFOS.currentHost + '/social/im/newChatWin/SocialImNewWindow.jsp?id=' + _winId + '&content=' + content + '&doid=' + doid + '&comfirmText=' + _args.comfirmText;
            } else {
                url = GLOBAL_INFOS.currentHost + '/social/im/newChatWin/SocialImNewWindow.jsp?id=' + _winId + '&content=' + content + '&doid=' + doid;
            }
        } else if (_winId === 10) {
            let type = _args.type;
            let hrmids = _args.hrmids;
            let hrmnames = _args.hrmnames;
            url = GLOBAL_INFOS.currentHost + '/social/im/newChatWin/SocialImNewWindow.jsp?id=' + _winId + '&type=' + type + '&hrmids=' + hrmids + '&hrmnames=' + hrmnames;
        } else {
            url = GLOBAL_INFOS.currentHost + '/social/im/newChatWin/SocialImNewWindow.jsp?id=' + _winId;
        }
        var _this = this;
        var newDepartWindow = new BrowserWindow({
            title: _args.title,
            width: _args.width,
            height: _args.height,
            useContentSize: true,
            resizable: false,
            show: false,
            frame: false,
            modal: true,
            parent: mainWindow,
            'webPreferences': {
                'preload': path.join(DIR_PATH, 'preload.js')
            }
        });

        newDepartWindow.loadURL(url);

        newDepartWindow.on('close', function(event) {
            if (_this.currentOpenWindow) {
                _this.currentOpenWindow.webContents.session.clearCache(function() {
                    pcUtils.info('newDepartWindow  clearCache');
                });
            }
            _this.currentOpenWindow = null;
        });

        newDepartWindow.webContents.on('dom-ready', function(event) {
            _this.currentOpenWindow.webContents.send('plugin-pcNewWindow-show', args);
            _this.currentOpenWindow.show();
            if (!_this.currentOpenWindow.isFocused()) {
                _this.currentOpenWindow.minimize();
                _this.currentOpenWindow.show();
            }
        });

        newDepartWindow.webContents.on('crashed', function(event) {
            if (_this.currentOpenWindow) {
                _this.currentOpenWindow.webContents.session.clearCache(function() {
                    _this.currentOpenWindow.close();
                    pcUtils.info('newDepartWindow  clearCache');
                });
                if (!_this.currentOpenWindow.isDestroyed()) {
                    _this.currentOpenWindow.close();
                }
            }
            _this.currentOpenWindow = null;
        });

        //页面加载失败
        newDepartWindow.webContents.on('did-fail-load', function(event) {
            try {
                _this.currentOpenWindow.close();
                //pcUtils.showError('窗口加载失败，请检查服务是否正常');
            } catch (err) {
                _this.currentOpenWindow = null;
                if (_this.currentOpenWindow)
                    _this.currentOpenWindow.close();
            }
        });

        // 注册 打开工具栏快捷键
        registerWindowShortcut(newDepartWindow);
        _this.currentOpenWindow = newDepartWindow;

    }
};

//获取winID信息
ipcMain.on('plugin-getWinIdInfo', (event) => {
    event.returnValue = WindowsDepartUtils.winID;
});

//打开新窗口
ipcMain.on('plugin-windowsdepart-show', (event, args) => {
    if (WindowsDepartUtils.currentOpenWindow !== null && WindowsDepartUtils.currentOpenWindow !== undefined) {
        if (!WindowsDepartUtils.currentOpenWindow.isDestroyed()) {
            WindowsDepartUtils.currentOpenWindow.close();
        }
        //WindowsDepartUtils.currentOpenWindow = null;
    }
    WindowsDepartUtils.openNewWindow(args);
});

//打开新的聊天窗口
ipcMain.on('plugin-openNewChatWin-show', (event, args) => {
    if (WindowsDepartUtils.currentChatWindow !== null && WindowsDepartUtils.currentChatWindow !== undefined) {
        if (!WindowsDepartUtils.currentChatWindow.isDestroyed()) {
            let webcontent = WindowsDepartUtils.currentChatWindow.webContents;
            var winid = {
                'chatwinid': WindowsDepartUtils.currentChatWindow.id,
                'mainwinid': mainWindow.id
            };
            WindowsDepartUtils.winID = winid;
            webcontent.send('plugin-openUserChatWin-cbHandle', args, winid);
            WindowsDepartUtils.currentChatWindow.show();
        } else {
            WindowsDepartUtils.openNewChatWin(args);
        }
    } else {
        WindowsDepartUtils.openNewChatWin(args);
    }
    leftWinStatus = true;
});


//关闭新窗口
ipcMain.on('plugin-pcNewWindow-close', (event) => {
    if (WindowsDepartUtils.currentOpenWindow !== null && WindowsDepartUtils.currentOpenWindow !== undefined) {
        if (!WindowsDepartUtils.currentOpenWindow.isDestroyed()) {
            WindowsDepartUtils.currentOpenWindow.hide();
        }
    }
});

//管理应用回调
ipcMain.on('plugin-pcAppManager-cb', (event, data) => {
    mainWindow.send('plugin-pcAppManager-cbHandle', data);
});

//设置头像回调
ipcMain.on('plugin-setUserIcon-cb', (event) => {
    mainWindow.send('plugin-setUserIcon-cbHandle');
});

//设置添加群组回调
ipcMain.on('plugin-addGroup-cb', (event, args) => {
    mainWindow.send('plugin-addGroup-cbHandle', args);
});

//设置系统设置回调
ipcMain.on('plugin-setUserConifg-cb', (event, args) => {
    mainWindow.send('plugin-setUserConifg-cbHandle', args);
});

//设置添加群聊分组回调
ipcMain.on('plugin-addGroupSub-cb', (event, args) => {
    mainWindow.send('plugin-addGroupSub-cbHandle', args);
});

//设置重命名群聊分组回调
ipcMain.on('plugin-renameGroupSub-cb', (event, args) => {
    mainWindow.send('plugin-renameGroupSub-cbHandle', args);
});

//系统信息确认框
ipcMain.on('plugin-systemComfirm-cb', (event, args) => {
    mainWindow.send('plugin-systemComfirm-cbHandle', args);
});

//是否开启窗口分离
ipcMain.on('isAllowNewChatWin', (event, args) => {
    if (args) {
        isAllowNewChatWin = args;
    }
});

//截获系统操作事件，打开窗口处理
ipcMain.on('ELECTRON_GUEST_WINDOW_MANAGER_WINDOW_OPEN', (event, url, frameName, features) => {
    if (isAllowNewChatWin) {
        var chatWin = WindowsDepartUtils.currentChatWindow;
        if (chatWin !== null && chatWin !== undefined) {
            chatWin.webContents.send('window-open-by-guest', url, frameName, features);
        }
    }
});

/*--------------------------------  窗口分离功能  end  --------------------------------*/

//强制关闭窗口
function destroyWin(win) {
    try {
        if (win) {
            //先给窗口隐藏掉
            win.hide();
            win.close();
            if (!win.isDestroyed()) {
                win.destroy();
            }
        }
    } catch (err) {
        win = null;
    }
}

//窗口分离支持切换
ipcMain.on('switch-window-depart', (event, args) => {
    pcUtils.info("switch-window-depart=======args======" + JSON.stringify(args));
    var isWinDepart = args.to;
    var winSide = args.win;
    var url = "";
    if (isWinDepart) {
        if (mainUrl.indexOf('SocialIMMain.jsp') != -1) {
            url = mainUrl.replace(/SocialIMMain.jsp/ig, "newChatWin\/SocialIMMain-ncr.jsp");
        }
        if (url.indexOf('isAllowNewWin=1') == -1) {
            url = url + "&isAllowNewWin=1";
        }
    } else {
        if (mainUrl.indexOf('SocialIMMain-ncr.jsp') != -1) {
            url = mainUrl.replace(/newChatWin\/SocialIMMain-ncr.jsp/ig, "SocialIMMain.jsp");
        }
        if (mainUrl.indexOf('SocialIMMain-ncl.jsp') != -1) {
            url = mainUrl.replace(/newChatWin\/SocialIMMain-ncl.jsp/ig, "SocialIMMain.jsp");
        }
        if (url.indexOf('isAllowNewWin=1') != -1) {
            url = url.replace(/\&isAllowNewWin=1/ig, "");
        }
        destroyWin(WindowsDepartUtils.currentChatWindow);
        destroyWin(WindowsDepartUtils.currentOpenWindow);
    }
    pcUtils.info("switch-window-depart=======url======" + url);
    destroyWin(LoginAndChatWin.chatWin);
    destroyWin(mainWindow);
    destroyWin(ImageViewPageUtil._currentTipWindow);
    mainWindow = initMainChatWinodw(url);
    //记录上一次加载的url
    mainUrl = url;
    LoginAndChatWin.chatWin = mainWindow;
});

//维护左侧窗口状态
ipcMain.on('plugin-leftWinStatus-change', (event, args) => {
    leftWinStatus = args;
});
//获取左侧窗口的状态
ipcMain.on('plugin-get-leftWinStatus', (event) => {
    event.returnValue = leftWinStatus;
});

//重启系统
ipcMain.on('reboot-system', (event) => {
    cmd.run('shutdown -r -t 0');
});