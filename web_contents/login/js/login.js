'use strict';

const node_path = window.Electron.require('path');
const pcUtils = window.Electron.require(node_path.join(__dirname, './../../pcUtils.js'));
const localconfig = window.Electron.require(node_path.join(__dirname, './../../localconfig.js'));
const platform = window.Electron.ipcRenderer.sendSync('global-getPlatform');
const low = window.Electron.require('lowdb');
const FileSync = window.Electron.require('lowdb/adapters/FileSync');
const adapter = new FileSync(node_path.join(__dirname, './../../db.json'));
const db = low(adapter);

const qrcodeMaxLength = 10;
var qrCode = null;
var qrcodeLoginHandle = null;
var qrCodeGetCount = 0;
const DIR_PATH = __dirname;
const isAeroEnabled = window.Electron.ipcRenderer.sendSync('global-getIsAeroGlassEnabled');
/**
 * 页面加载完成执行操作
 */
var GLOBAL_IS_ONLINE = true;
var LngMapping = {
    "7": "zh_CN",
    "8": "en",
    "9": "zh_TW"
};
$(function() {
    window.Electron.ipcRenderer.on('do-loginHtml-redirect', function(event, args) {
        var newUrl = args.newURL;
        if (newUrl.indexOf("https:") > -1) {
            var host = $('input[name="oaAddress"]').val().trim();
            //需要把不带双斜杠的也替换
            host = host.replace(/https:\/\/|http:\/\/|https:|http:/gi, "");
            host = "https://" + host;
            $('input[name="oaAddress"]').val(host);
        }
    });
    if (isAeroEnabled) {
        $('body').addClass('canAero-body');
        $('.container').addClass('canAero-container');
        $('.content').addClass('canAero-content');
    }

    // 监测本地网络是否通畅
    setInterval(function() {
        GLOBAL_IS_ONLINE = navigator.onLine;
        if (!GLOBAL_IS_ONLINE) {
            errotTipUtils.showErrorTip('网络不通，请检查网络');
        } else {
            if ($('.errorMsg').html() === '网络不通，请检查网络') {
                errotTipUtils.closeErrorTip();
            }
        }
    }, 1000);

    // 页面初始化完成操作
    $('input[name="oaAddress"]').val(localStorage.getItem('emessage-oaAddress'));
    $('input[name="username"]').val(localStorage.getItem('emessage-username'));
    $('input[name="oaAddress"]').focus();


    // 绑定事件
    $(document.body).click(function(event) {
        // 隐藏语言选择div
        var $selectLanguage = $('#selectLanguage');
        var $inputLanguage = $('#languageInput');
        if (!$selectLanguage.is(':hidden')) {
            $selectLanguage.hide();
            $inputLanguage.removeClass('languageInput-click').addClass('languageInput-common');
        }
        // 隐藏oa地址选择div
        var $oaAdressImg = $('.oaAdressImg');
        if ($oaAdressImg.is(':visible')) {
            var $oaAdressSelect = $('.oaAdressSelect');
            if ($oaAdressSelect.is(':visible')) {
                $oaAdressSelect.hide();
                $oaAdressImg.removeClass('oaAdressImg-click');
            }
        }
    }).keydown(function(event) {
        // 扫码等待中，回车键不响应
        if (event.keyCode === 13 && $('#qrcodeLogin').is(':hidden')) {
            if (!$('.submitButton').is(':hidden')) {
                $('.submitButton').click();
            }
        }
    });

    // 服务器没启动等情况，展示默认头像。
    $('#headImg').error(function() {
        $(this).attr('src', '../images/loginhead.jpg');
    });
    // 设置按钮
    $(".setButton").click(function() {
        const BrowserWindow = window.Electron.remote.BrowserWindow;
        var winWidth = 440;
        var winHeight = 290;
        if (platform.OSX) {
            winHeight = 311;
        }
        var setWindow = new BrowserWindow({
            title: '系统设置',
            show: false,
            width: winWidth,
            height: winHeight,
            useContentSize: true,
            resizable: false,
            skipTaskbar: false, // 是否隐藏任务栏
            frame: false,
            modal: true,
            transparent: isAeroEnabled,
            'webPreferences': {
                'preload': node_path.join(DIR_PATH, './../../preload.js')
            },
            parent: window.Electron.currentWindow
        });
        var setUrl = node_path.join('file://' + DIR_PATH, './../set/set.html');
        setWindow.loadURL(setUrl);
        setWindow.once('ready-to-show', () => {
            setWindow.show();
        })
    });

    // 最小化按钮
    $('.minButton').click(function() {
        //window.Electron.currentWindow.hide();
        window.Electron.currentWindow.minimize();
    });
    // 关闭按钮
    $('.closeButton').click(function() {
        if (isLoginSuccess) {
            quitFromOa();
            window.Electron.ipcRenderer.send('quit-app');
        } else {
            window.Electron.currentWindow.close();
        }
    });

    //输入框的事件
    $('input[name="oaAddress"]').focus(function() {
        $('input[name="oaAddress"]').val($('input[name="oaAddress"]').val().trim() === '' ? '' : $('input[name="oaAddress"]').val().trim());
        distroyValidateTip($(this));
    }).blur(function() {
        setUserHeadImgLocal();
        isUserNeedOtherKey();
    });
    $('input[name="username"]').focus(function() {
        $('input[name="username"]').val($('input[name="username"]').val().trim() === '' ? '' : $('input[name="username"]').val().trim());
        distroyValidateTip($(this));
    }).blur(function() {
        setUserHeadImgLocal();
        isUserNeedOtherKey();
    });
    $('input[name="userPassword"]').focus(function() {
        distroyValidateTip($(this));
    });
    $('input[name="islanguid"]').click(function() {
        distroyValidateTip($(this));
    });

    $('input[name="tokenpass"]').live('focus', function() {
        distroyValidateTip($(this));
    });

    // 记住密码 复选框
    // 1、记住密码不一定自动登陆； 2、不记住密码一定不自动登陆；
    $('#rememberPassword').click(function() {
        if (!$(this).is(':checked')) {
            var $al = $('#automaticlanding');
            if ($al.is(':checked')) {
                $al.prop('checked', false);
            }
        }
    });
    // 自动登陆 复选框
    // 1、自动登陆一定记住密码；2、不自动登陆也可以只记住密码；
    $('#automaticlanding').click(function() {
        if ($(this).is(':checked')) {
            var rp = $('#rememberPassword');
            if (!rp.is(':checked')) {
                rp.prop('checked', true);
            }
        }
    });

    // 提交按钮
    $('.submitButton').click(function() {
        if (GLOBAL_IS_ONLINE) {
            errotTipUtils.closeErrorTip(); // 关闭错误提示
            var valid = validateForm();
            if (valid) {
                setToLogingView();
                errotTipUtils.showInfoWithoutImg(i18n.t('Logining'));
                // ajax登陆
                nowLoging();
            }
        }
    });
    // 取消按钮
    $('.cancelButton').click(function(event) {
        if (loginAjaxObj !== null) {
            /*
            var flag = false;
            if(!isLoginSuccess) {
                flag = window.Electron.ipcRenderer.sendSync('cancel-mainChatWindow');
            }
            if(!isLoginSuccess || flag) {
                setToNommonView();
                // 终止ajax
                loginAjaxObj.abort();
                loginAjaxObj = null;

                isLoginSuccess = false;  // 重置登陆成功状态
            }
            */
            if (!isLoginSuccess) {
                // 终止ajax
                loginAjaxObj.abort();
                loginAjaxObj = null;

                isLoginSuccess = false; // 重置登陆成功状态
            }
        }
        setToNommonView();
        if (event.originalEvent) {
            errotTipUtils.closeErrorTip();
        }

    });

    qrCode = passwordBuilder(qrcodeMaxLength);
    // 二维码
    $('#qrcodeImg').qrcode({
        render: 'div',
        text: 'ecologylogin:' + qrCode,
        size: 125,
        background: 'none',
        fill: '#424345'
    });
    $('#backbtn').click(function() {
        clearTimeout(qrcodeLoginHandle);
        qrcodeLoginHandle = null;
        qrCodeGetCount = 0;
        $('#qrcodeLogin').hide();
        $('#qrcodeOaAddress').html('');
        $('#openQrcodeDiv').show();
    });
    $('#openQrcodeDiv').click(function() {
        //把错误提示去掉
        errotTipUtils.closeErrorTip('');
        if (validateOaAddress()) {
            var submitUrls = getSubmitUrl();
            $('#qrcodeOaAddress').html(submitUrls.prefix);
            $(this).hide();
            $('#qrcodeLogin').show();
            //取消提示 遮盖二维码
            distroyValidateTip($("input[name='username']"));
            distroyValidateTip($("input[name='userPassword']"));
            distroyValidateTip($("input[name='tokenpass']"));
            qrcodeLoginTask();
        }
    });

    // 初始化页面展示
    localconfig.getLogoutSet(function(flag) {
        if (flag) { // 如果是注销后进入，设置自动登陆为false
            localconfig.setLogout(false);
            loginDbUtils.setAutoLoginFalse(function() {
                initPageView();
            });
        } else {
            localconfig.get({
                    currentHost: $('input[name="oaAddress"]').val().trim(),
                    loginId: $('input[name="username"]').val()
                },
                function(err, config) {
                    try {
                        if (config.login.autoLogin) {
                            loginDbUtils.setAutoLoginTrue($('input[name="oaAddress"]').val(), $('input[name="username"]').val(), function() {
                                initPageView();
                            });
                        } else {
                            loginDbUtils.setAutoLoginFalse(function() {
                                initPageView();
                            });
                        }
                    } catch (err) {
                        loginDbUtils.setAutoLoginFalse(function() {
                            initPageView();
                        });
                    }
                }
            );
        }
    });

    // 初始化OA地址选择
    initOaAddressSelect();

    window.Electron.ipcRenderer.send('tray-offlineStatus');
    window.Electron.ipcRenderer.send('tray-setToolTip', 'e-message\r\n未登陆');

    //如果服务端
    window.Electron.ipcRenderer.on('chatWin-load-error', function(event, args) {
        chatWinLoadError();
    });

    // 初始化完成，展示
    setTimeout(function() {
        var win = window.Electron.currentWindow;
        win.show();
        win.focus();
    }, 200);
    var lngVal = localStorage.getItem('languageid') || 7;
    // 加载国际化
    var i18nOption = {
        lng: LngMapping[lngVal],
        ns: 'login',
        resGetPath: '../../locales/__lng__/__ns__.json'
    };
    i18n.init(i18nOption, function(err, t) {
        // translate nav
        $(".container").i18n();
    });
});

/**
 * 错误提示工具
 * @type {{$errorTip_: (*|jQuery|HTMLElement), $errorTipMsg_: (*|jQuery|HTMLElement), showErrorTip: Function, closeErrorTip: Function}}
 */
var errotTipUtils = {
    $errorTip_: $('.errorTip'),
    $errorMsg_: $('.errorMsg'),
    showErrorTip: function(errorMsg) {
        this.$errorTip_.css('visibility', 'visible');
        this.$errorTip_.find('img').show();
        this.$errorMsg_.html(errorMsg).attr('title', errorMsg);
    },
    closeErrorTip: function() {
        this.$errorTip_.css('visibility', 'hidden');
        this.$errorMsg_.html('').removeAttr('title');
    },
    showInfoWithoutImg: function(msg) {
        this.$errorTip_.css('visibility', 'visible');
        this.$errorTip_.find('img').hide();
        this.$errorMsg_.html(msg).attr('title', msg);
    }
};

/**
 * 设置界面为普通样式
 */
function setToNommonView() {
    $('.loginDiv').show();
    $('.loging').hide();
    $('.otherTool').css('visibility', 'visible');
    $('.cancelButton').hide();
    $('.submitButton').show();
}

/**
 * 设置界面为  登陆中。。。  样式
 */
function setToLogingView() {
    $('.loginDiv').hide();
    $('.loging').show();
    $('.otherTool').css('visibility', 'hidden');
    $('.submitButton').hide();
    $('.cancelButton').show();
}

/**
 * 登陆相关
 */
var loginAjaxObj = null; //登陆ajax对象
var isLoginSuccess = false; // 登陆是否成功
function nowLoging() {
    var submitUrl = getSubmitUrl();
    var formdata = {
        method: 'login',
        loginid: $('input[name="username"]').val(),
        password: $('input[name="userPassword"]').val(),
        language: $('input[name="islanguid"]').val()
    };
    if ($('input[name="tokenpass"]').length > 0) {
        formdata.tokenpass = $('input[name="tokenpass"]').val();
    }
    if ($('input[name="dynapass"]').length > 0) {
        formdata.dynapass = $('input[name="dynapass"]').val();
    }
    loginAjaxObj = $.ajax({
        cache: false,
        type: 'GET',
        url: submitUrl.postUrl,
        data: formdata,
        timeout: 1000 * 60,
        dataType: 'json',
        success: function(data) {
            //兼容低版本服务端
            var bv = pcUtils.getBuildVersion();
            var lowversion = false;
            //字符串不要直接比较，会出问题
            if ((platform.Windows && data.hasOwnProperty('buildversion') && parseInt(data.buildversion) < parseInt(bv.buildVersion)) ||
                (platform.OSX && data.hasOwnProperty('osxBuildVersion') && parseInt(data.osxBuildVersion) < parseInt(bv.osxBuildVersion))) {
                lowversion = true;
            }

            if (lowversion || $('input[name="username"]').val() === 'sysadmin' || parseInt(data.status) !== parseInt(1)) {
                afterLoginSuccess(data, submitUrl, 1);
                return;
            }
            var sessionKey = data.sessionkey;
            var pardata = {
                loginid: $('input[name="username"]').val().trim(),
                sessionKey: sessionKey,
                method: 'checkPwd'
            };
            loginAjaxObj = null;
            loginAjaxObj = $.ajax({
                cache: false,
                type: 'GET',
                url: submitUrl.postUrl,
                data: pardata,
                timeout: 1000 * 60,
                dataType: 'json',
                success: function(returnData) {
                    checkUserPwd(returnData, data, submitUrl);
                },
                error: function(XMLHttpRequest, textStatus, errorThrown) {
                    pcUtils.error('=====nowLoging==login===XMLHttpRequest====status=======' + $.trim(XMLHttpRequest.status));
                    pcUtils.error('=====nowLoging==login===XMLHttpRequest====responseText========' + $.trim(XMLHttpRequest.responseText));
                    pcUtils.error('=====nowLoging==login===XMLHttpRequest====statusText=======' + $.trim(XMLHttpRequest.statusText));
                    if ('timeout' === textStatus) {
                        errotTipUtils.showErrorTip('登陆超时');
                    } else {
                        errotTipUtils.showErrorTip('OA地址错误或服务器异常');
                    }
                    // 取消登陆
                    $('.cancelButton').click();

                    // 先取消再重置ajax对象为null！！！
                    loginAjaxObj = null;
                }
            });
        },
        error: function(XMLHttpRequest, textStatus, errorThrown) {
            pcUtils.error('=====nowLoging==login===XMLHttpRequest====status=======' + $.trim(XMLHttpRequest.status));
            pcUtils.error('=====nowLoging==login===XMLHttpRequest====responseText========' + $.trim(XMLHttpRequest.responseText));
            pcUtils.error('=====nowLoging==login===XMLHttpRequest====statusText=======' + $.trim(XMLHttpRequest.statusText));
            if ('timeout' == textStatus) {
                errotTipUtils.showErrorTip('登陆超时');
            } else {
                errotTipUtils.showErrorTip('OA地址错误或服务器异常');
            }
            // 取消登陆
            $('.cancelButton').click();

            // 先取消再重置ajax对象为null！！！
            loginAjaxObj = null;
        }
    });
}


window.Electron.ipcRenderer.on('quit-checkPwdWin-left', function(event) {
    $('.cancelButton').click();
    errotTipUtils.showInfoWithoutImg('');
    setToNommonView();
});

window.Electron.ipcRenderer.on('quit-checkPwdWin-continue', function(event, args) {
    var data = args.data;
    var submitUrl = args.submitUrl;
    afterLoginSuccess(data, submitUrl, 1);
});

window.Electron.ipcRenderer.on('change-mainwin', function(event) {
    $('.cancelButton').hide();
});

function showClientTip(title, message, sessionKey, type, extData) {
    var ipcRenderer = window.Electron.ipcRenderer;
    var args = {
        "title": title,
        "message": message,
        "type": type,
        "oaHost": $('input[name="oaAddress"]').val(),
        "language": $('input[name="islanguid"]').val(),
        "sessionkey": sessionKey,
        "extData": extData
    };
    ipcRenderer.send('init-checkPwdWindow', args);
}

//检测强制修改密码
function checkUserPwd(returnData, data, submitUrl) {
    try {
        // returnData.isUpPswd = "0";
        // returnData.passwdReminder = "1";
        // returnData.passwdelse = "1";
        // returnData.canpass = "1";
        // returnData.canremind = "1";
        // returnData.isAdmin = "0";
        // returnData.isAdaccount = "0";
        var extData = {
            'data': data,
            'submitUrl': submitUrl
        };
        var flag = false;
        if (returnData.isAdmin === "0") {
            if (returnData.isAdaccount === "0") {
                if (returnData.isUpPswd === "1") {
                    showClientTip('密码修改提示', '首次登录请修改密码!', data.sessionkey, 'alert', extData);
                } else {
                    if (returnData.passwdReminder === "1") {
                        if (returnData.canpass === "1") {
                            if (returnData.canremind === "1") {
                                showClientTip('密码修改提示', '您的密码还有' + returnData.passwdelse + '天过期，是否现在修改？', data.sessionkey, 'comfirm', extData);
                            } else {
                                flag = true;
                            }
                        } else {
                            showClientTip('密码修改提示', '您的密码已经过期，请修改！', data.sessionkey, 'alert', extData);
                        }
                    } else {
                        flag = true;
                    }
                }
            } else {
                flag = true;
            }
        } else {
            flag = true;
        }
    } catch (err) {

    }
    if (flag) {
        afterLoginSuccess(data, submitUrl, 1);
    }

}

// 检测客户端是否需要升级
function afterLoginSuccess(data, submitUrl, loginType) {
    var ipcRenderer = window.Electron.ipcRenderer;

    // 启动自动更新监听器
    ipcRenderer.send('init-autoUpdate', submitUrl.prefix);
    // 校验是否需要升级
    if (data.hasOwnProperty('buildversion') || data.hasOwnProperty('osxBuildVersion')) {
        var bv = { buildVersion: data.buildversion, osxBuildVersion: data.osxBuildVersion, runtimeVersion: data.runtimeVersion };
        ipcRenderer.send('global-setNewBuildVersion', bv);
    }
    var bv = pcUtils.getBuildVersion();
    //兼容旧版本，当服务端runtimeVersion字段没有的情况下不提示升级
    if (data.hasOwnProperty('runtimeVersion') && data.runtimeVersion !== '' && data.runtimeVersion !== '-1' && data.runtimeVersion !== bv.runtimeVersion) {
        // if ((platform.Windows && data.hasOwnProperty('buildversion') && data.buildversion !== bv.buildVersion) ||
        //     (platform.OSX && data.hasOwnProperty('osxBuildVersion') && data.osxBuildVersion !== bv.osxBuildVersion)) {
        ipcRenderer.send('global-setHost', submitUrl.prefix);
        errotTipUtils.showInfoWithoutImg('客户端需要升级');
        setToNommonView();
        ipcRenderer.send('init-updateWindow');
    } else {
        if (data.status === 1) {
            if (loginType === 1) {
                isLoginSuccess = true;
                $('.cancelButton').hide();
                errotTipUtils.closeErrorTip();
                dynapassControl._clearRealStartInterval();
                // 系统设置按钮置灰
                $('.setButton').addClass('disabled').parent().css('cursor', 'not-allowed');
            }

            errotTipUtils.showInfoWithoutImg(i18n.t('LoginSuccess'));
            // 登陆成功才设置本地数据,保存user_token为密文
            if (data.user_token === undefined || data.user_token === "") {
                setRememberPassword(submitUrl.prefix, "");
            } else {
                setRememberPassword(submitUrl.prefix, data.user_token);
            }

            // 更新头像
            loginDbUtils.updateHeadImg($('input[name="oaAddress"]').val().trim(), $('input[name="username"]').val(), submitUrl.prefix + data.userHead);
            validateChatWin(submitUrl.indexUrl, data.sessionkey,
                function() {
                    //记录用户密码，后续验证登陆需要
                    var userInfos = {
                        currentHost: submitUrl.prefix,
                        loginId: $('input[name="username"]').val(),
                        userName: data.userName,
                        sessionKey: data.sessionkey,
                        language: $('input[name="islanguid"]').val(),
                        password: $('input[name="userPassword"]').val(),
                        loginTime: new Date().getTime()
                    };
                    ipcRenderer.send('global-setUserInfos', userInfos);
                    // 记录用户的OA地址
                    ipcRenderer.send('global-setHost', submitUrl.prefix);
                    // 记录用户的sessionkey
                    ipcRenderer.send('global-setSessionKey', data.sessionkey);

                    var config = ipcRenderer.sendSync('global-getUserConifg');
                    config.login.autoLogin = $('#automaticlanding').is(':checked');
                    //首次登录生成guid
                    localconfig.get({
                            currentHost: $('input[name="oaAddress"]').val(),
                            loginId: $('input[name="username"]').val()
                        },
                        function(err, userconfig) {
                            //修复卡在登录页面的bug
                            try {
                                config.guid = userconfig.guid;
                            } catch (err) {
                                config.guid = "";
                                pcUtils.error("localconfig====首次登录生成guid===err" + err);
                            }
                        }
                    );
                    if (config.guid === null || config.guid === undefined || config.guid === '' || config.guid === 'undefined') {
                        var uuid = window.Electron.require('node-uuid');
                        config.guid = uuid.v4();
                    }

                    ipcRenderer.send('global-setUserConifg', { config: config });
                    setTimeout(function() {
                        errotTipUtils.showInfoWithoutImg(i18n.t('Initalizing'));
                        var indexUrl = '';
                        try {
                            //新开关和旧开关同时判断
                            if (data.isNew == 1 && data.isAllowNewWin == 1) {
                                var config = data.config;
                                if (platform.Windows && config.status == 1 && config.winConfig != '') {
                                    var winCon = config.winConfig;
                                    if (winCon.isWinDepart) {
                                        indexUrl = submitUrl.indexNewUrl + '&sessionkey=' + data.sessionkey + '&isAllowNewWin=' + 1;
                                    } else {
                                        indexUrl = submitUrl.indexUrl + '&sessionkey=' + data.sessionkey;
                                    }
                                } else if (platform.OSX && config.status == 1 && config.osxConfig != '') {
                                    var winCon = config.osxConfig;
                                    if (winCon.isWinDepart) {
                                        indexUrl = submitUrl.indexNewUrl + '&sessionkey=' + data.sessionkey + '&isAllowNewWin=' + 1;
                                    } else {
                                        indexUrl = submitUrl.indexUrl + '&sessionkey=' + data.sessionkey;
                                    }
                                } else {
                                    indexUrl = submitUrl.indexUrl + '&sessionkey=' + data.sessionkey;
                                }
                            } else {
                                indexUrl = submitUrl.indexUrl + '&sessionkey=' + data.sessionkey;
                            }
                        } catch (err) {
                            indexUrl = submitUrl.indexUrl + '&sessionkey=' + data.sessionkey;
                        }
                        //修复自动登录多语言设置不生效问题
                        indexUrl = indexUrl + '&language=' + userInfos.language;
                        ipcRenderer.send('init-mainChatWindow', indexUrl);
                        if (loginType === 1) {
                            $('.cancelButton').hide();
                            dynapassControl._clearRealStartInterval();
                        }
                    }, 200);
                },
                function() {
                    chatWinLoadError();
                }
            );
        } else {
            if (data.status === -2) {
                const dialog = window.Electron.remote.dialog;
                dialog.showMessageBox(window.Electron.currentWindow, { type: 'warning', message: data.errorMsg, buttons: [] }, function() {
                    setToNommonView();
                    errotTipUtils.closeErrorTip();
                    const BrowserWindow = window.Electron.remote.BrowserWindow;
                    var resetPassWin = new BrowserWindow({
                        title: '密码设置 - e-message',
                        show: true,
                        width: 640,
                        height: 460,
                        resizable: true,
                        frame: true,
                        transparent: false,
                        'webPreferences': {
                            'preload': node_path.join(__dirname, '../../preload.js')
                        }
                    });
                    resetPassWin.loadURL(submitUrl.prefix + data.url);
                    resetPassWin.on('closed', function() {
                        $.ajax({
                            url: submitUrl.prefix + '/social/im/ServerStatus.jsp?p=logout',
                            data: {
                                from: 'pc',
                                sessionkey: data.sessionkey
                            }
                        });
                    });
                });
            } else {
                var errorMsg = data.errorMsg;
                if (data.status === 0 || data.status === 6) {
                    var $otherKey_dd = $('#otherKey');
                    var $dynapass_div = $('#dynapass_div');
                    $otherKey_dd.show();
                    $dynapass_div.html("<label>动态密码：</label><input type='text' _text='动态密码' name='dynapass'/>");
                    $dynapass_div.show();
                    $('input[name="userPassword"]').closest('dd').height(0).hide();
                    dynapassControl._startInterval(errorMsg);
                } else {
                    errotTipUtils.showErrorTip(errorMsg);
                }
                // 取消登陆
                $('.cancelButton').click();
            }
        }
        if (loginType === 1) {
            loginAjaxObj = null;
        }
    }
}

function validateChatWin(chatUrl, sessionKey, onSuccess, onError) {
    typeof onSuccess === 'function' && onSuccess();
    /*
    //首次验证服务端是否正常
    // 暂时屏蔽
    $.ajax({
        type : 'post',
        url : chatUrl,
        data : {
            from : 'pc',
            sessionKey : sessionKey
        },
        complete : function(XMLHttpRequest, textStatus){
            if(XMLHttpRequest.status == 200) {
                typeof onSuccess === 'function' && onSuccess();
            } else {
                pcUtils.writeLog('请求主窗口地址错误，状态码：' + XMLHttpRequest.status);
                typeof onError === 'function' && onError();
            }
        }
    });
    */
}

// 退出OA系统
function quitFromOa() {
    var ipcRenderer = window.Electron.ipcRenderer;
    $.ajax({
        async: false,
        url: ipcRenderer.sendSync('global-getHost') + '/social/im/ServerStatus.jsp?p=logout',
        data: {
            from: 'pc',
            sessionkey: ipcRenderer.sendSync('global-getSessionKey')
        },
        timeout: 200
    });
}

// 主聊天页面加载错误处理
function chatWinLoadError() {
    console.info('chatWin-load-error');
    if (loginAjaxObj) {
        loginAjaxObj.abort();
        loginAjaxObj = null;
    }
    isLoginSuccess = false; // 重置登陆成功状态
    quitFromOa();

    setToNommonView();
    errotTipUtils.showErrorTip('服务器错误，请稍候重试');
}

function getSubmitUrl() {
    var urls = {};
    var oaAddress = $('input[name="oaAddress"]').val().trim();
    urls.prefix = oaAddress;
    if (oaAddress.substr(0, 4) !== 'http') {
        urls.prefix = 'http://' + oaAddress;
    }
    urls.postUrl = urls.prefix + '/social/SocialVerifyLogin.jsp';
    urls.indexUrl = urls.prefix + '/social/im/SocialIMMain.jsp?frommain=yes&from=pc&isAero=' + window.Electron.ipcRenderer.sendSync('global-getIsAeroGlassEnabled') + '&pcOS=' + getOsString();
    urls.indexNewUrl = urls.prefix + '/social/im/newChatWin/SocialIMMain-ncr.jsp?frommain=yes&from=pc&isAero=' + window.Electron.ipcRenderer.sendSync('global-getIsAeroGlassEnabled') + '&pcOS=' + getOsString();
    urls.qrcodeUrl = urls.prefix + '/mobile/plugin/login/QCLoginStatus.jsp?loginkey=' + qrCode;
    urls.checkpwdUrl = urls.prefix + '/social/SocialCheckPwd.jsp';

    // var serverIp = localStorage.getItem('emessage_server_ip');
    // var serverIpOn = localStorage.getItem('serverIpOn');
    // call read function to reload db resources
    db.read();
    var serverIpSet = db.get('serveripset').chain().find({ id: 0 }).value();
    if (serverIpSet) {
        var serverIp = serverIpSet.serverIp;
        var serverIpOn = serverIpSet.serverIpOn;
        if (serverIpOn && serverIp) {
            urls.indexUrl += ("&serverIp=" + serverIp);
            urls.indexNewUrl += ("&serverIp=" + serverIp);
        }
    }
    return urls;
}

var LanguageArray = [
    { value: 7, text: '简体中文' },
    { value: 8, text: 'English' },
    { value: 9, text: '繁體中文' }
];
/**
 * 点击选择语言，弹出语言选项div
 */
function choiceLanguage() {
    event.stopPropagation();
    var $selectLanguage = $('#selectLanguage');
    var $inputLanguage = $('#languageInput');

    var nowlanguage = $('input[name="islanguid"]').val();
    var $dl = $selectLanguage.find('dl');
    $dl.html('');
    for (var i = 0; i < LanguageArray.length; i++) {
        if (nowlanguage !== LanguageArray[i].value) {
            $dl.append('<dd value="' + LanguageArray[i].value + '" onclick="clickDD(this)">' + LanguageArray[i].text + '</dd>');
        }
    }

    if ($selectLanguage.css('display') === 'block') {
        $inputLanguage.removeClass('languageInput-click').addClass('languageInput-common');
    } else {
        $inputLanguage.removeClass('languageInput-common').addClass('languageInput-click');
    }
    $selectLanguage.toggle();
}

/**
 * 选择某个语言
 * @param fromDD
 */
function clickDD(fromDD) {
    var $selectLanguage = $('#selectLanguage');
    var $inputLanguage = $('#languageInput');
    $selectLanguage.hide();

    $inputLanguage.html($(fromDD).html());
    var langValue = $(fromDD).attr('value');
    $('input[name="islanguid"]').val(langValue);

    $inputLanguage.removeClass('languageInput-click').addClass('languageInput-common');

    refreshI18n(langValue);
}

function refreshI18n(langValue) {
    i18n.setLng(LngMapping[langValue], {
        ns: 'login',
        resGetPath: '../../locales/__lng__/__ns__.json'
    }, function() {
        $(".container").i18n();
        localStorage.setItem('languageid', langValue);
    });
}

/**
 * 初始化页面展示
 */
function initPageView(oaAddress, username) {
    var oaAddress = oaAddress || $('input[name="oaAddress"]').val().trim();
    var username = username || $('input[name="username"]').val();
    loginDbUtils.initLastView(oaAddress, username, function(row) {
        $('input[name="oaAddress"]').val(row.oaAddress);
        $('input[name="username"]').val(row.username);
        $('input[name="userPassword"]').val(row.rememberPassword ? row.password : '');
        $('input[name="islanguid"]').val(row.userLanguage);
        $('#languageInput').html(row.languageInputCommon);
        $('#rememberPassword').prop('checked', row.rememberPassword === 1);
        $('#automaticlanding').prop('checked', row.automaticlanding === 1);

        // 如果网络通畅才展示网络头像 和 自动登陆
        if (GLOBAL_IS_ONLINE) {
            if (row.headImgUrl) {
                $('#headImg').attr('src', row.headImgUrl)
            } else {
                $('#headImg').attr('src', '../images/loginhead.jpg')
            }

            isUserNeedOtherKey(); // 动态令牌

            // sql是异步处理的！！！
            if ($('#automaticlanding').is(':checked')) {
                $('.submitButton').click();
            }
        }

        // 国际化
        refreshI18n(row.userLanguage);
    });
}

/**
 * 设置记住密码功能
 */
function setRememberPassword(oaAddress, user_token) {
    //这个字段一直保存
    localStorage.setItem("emessage-oaAddress", oaAddress);
    localStorage.setItem("emessage-username", $('input[name="username"]').val());
    var pwd = '';
    if (user_token !== '') {
        pwd = user_token;
    } else {
        pwd = $('input[name="userPassword"]').val();
    }
    // 记录到数据库
    loginDbUtils.insertOrUpdateLoginInfo(
        oaAddress,
        $('input[name="username"]').val(), pwd,
        $('input[name="islanguid"]').val(),
        $('#languageInput').html(),
        $('#rememberPassword').is(':checked') ? 1 : 0,
        $('#automaticlanding').is(':checked') ? 1 : 0,
        new Date().getTime()
    );
}

/**
 * 查找本地数据展示用户头像
 */
function setUserHeadImgLocal() {
    if (GLOBAL_IS_ONLINE) {
        var oaAddress = $('input[name="oaAddress"]').val().trim();
        var username = $('input[name="username"]').val();
        if (oaAddress !== '' && username !== '') {
            loginDbUtils.getHeadImgAndSet(oaAddress, username, function(imgUrl) {
                if (imgUrl) {
                    $('#headImg').attr('src', imgUrl);
                } else {
                    $('#headImg').attr('src', '../images/loginhead.jpg');
                }
            });
        }
    }
}

function showClose(obj) {
    //$(obj).append('<div class = "imageClose"></div>');
    $(obj).find('.imageClose').css('display', 'block');
    //$(obj).find('p').addClass('textDiv');
}

function noClose(obj) {
    $(obj).find('.imageClose').css('display', 'none');
    //$(obj).find('p').removeClass('textDiv');
}

function changeBg(obj) {
    $(obj).css("background", "url(../images/close4.png) left center no-repeat");
}

function returnBg(obj) {
    $(obj).css("background", "url(../images/close3.png) left center no-repeat");
}

function removeHistory(obj) {
    var $object = $(obj).parent().closest('div');
    var url = $object.attr('title');
    var username = $object.attr('_username');
    loginDbUtils.deleteLoginRecord(url, username, function(rows) {
        var $oaAdressSelect = $('.oaAdressSelect');
        $object.remove();
        var length = $oaAdressSelect.find('.textBlock').length;
        if (length < 4) {
            var html = '<div class="textBlock"></div>';
            $oaAdressSelect.append(html);
        }
        $oaAdressSelect.perfectScrollbar('update');
    });
    event.stopPropagation();
}

/**
 * 初始化oa下拉菜单
 */
function initOaAddressSelect() {
    var $oaAddress = $('input[name="oaAddress"]');
    var $oaAdressImg = $('.oaAdressImg');
    loginDbUtils.getExistOaAddress(function(rows) {
        if (rows.length > 0) {
            var $oaAdressSelect = $('.oaAdressSelect');
            var html = '';
            for (var i = 0; i < rows.length; i++) {
                html += '<div class="textBlock" onmouseover=showClose(this) onmouseleave=noClose(this) onclick=clickSelectOaAddress(this) _username="' + rows[i].username + '" title="' + rows[i].oaAddress + '"><table><tr><th class="first"><p class="textDiv">' + rows[i].oaAddress + '</p></th>';
                html += '<th><div class="imageClose" onmouseover=changeBg(this) onclick="removeHistory(this);return false;" onmouseleave=returnBg(this)></div></th></tr></table></div>';
            }
            if (rows.length < 4) {
                for (var i = 0; i < 4 - rows.length; i++) {
                    html += '<div class="textBlock"></div>';
                }
            }

            $oaAdressSelect.append(html);

            $oaAddress.addClass('oaAdressInput');
            $oaAdressImg.show();

            $oaAdressImg.click(function(event) {
                event.stopPropagation();
                if ($oaAdressSelect.is(":hidden")) {
                    $oaAdressSelect.show();
                    $oaAdressImg.addClass('oaAdressImg-click');
                    $oaAdressSelect.perfectScrollbar('update');
                } else {
                    $oaAdressSelect.hide();
                    $oaAdressImg.removeClass('oaAdressImg-click');
                }
            });

            // 设置oa地址滚动条样式
            $oaAdressSelect.perfectScrollbar();
        }
    });
}

/**
 * 选择oa地址
 * @param obj
 */
function clickSelectOaAddress(obj) {
    loginDbUtils.setAutoLoginFalse(function() {
        initPageView($(obj).find('p').html(), $(obj).attr('_username'));

        $('.oaAdressImg').removeClass('oaAdressImg-click');
        $('.oaAdressSelect').hide();
    });
}
/**
 * 动态密码登录函数
 */
var dynapassControl = {
        _isStart: false, //是否开启
        _realStartInterval: null,
        _dynapassMsg: '',
        _startInterval: function(msg) {
            var _this = this;
            var time = 200;
            _this._dynapassMsg = msg;
            if (!_this._isStart) {
                _this._realStartInterval = setInterval(function() {
                    errotTipUtils.showErrorTip(_this._dynapassMsg + '(' + time + ')');
                    time--;
                    if (time === 0) isUserNeedOtherKey();
                }, 1000);
                _this._isStart = true;
            }
        },
        _clearRealStartInterval: function(data) {
            if (this._realStartInterval !== null) clearInterval(this._realStartInterval);
            this._realStartInterval = null;
            this._isStart = false;
        }
    }
    /**
     * 校验登陆表单
     * @returns {boolean}
     */
function validateForm() {
    //return validateOaAddress() && validateUsername() && validatePassword() && validateLanguage();
    //isUserNeedOtherKey();
    //检验顺序应为从上到下
    return validateOaAddress() && validateUsername() && validatePassword() && validateOtherKey();
}

/**
 * 校验oa地址必填
 * @returns {boolean}
 */
function validateOaAddress() {
    var $oaAddress = $('input[name="oaAddress"]');
    var address = $oaAddress.val().trim();
    distroyValidateTip($oaAddress);
    if (address.length == 0) {
        showValidateTip($oaAddress, i18n.t('CredError2'));
        return false;
    } else {

        var strRegex = "^((https?)\:\/\/)?" +
            "(((2[0-4][0-9]|25[0-5]|[01]?[0-9][0-9]?)\.){3}(2[0-4][0-9]|25[0-5]|[01]?[0-9][0-9]?)" +
            "|" +
            "([0-9a-z_!~*'()-]+\.)*" +
            "([0-9a-z][0-9a-z-]{0,61})?[0-9a-z]\." +
            "[a-z]{2,6})" +
            "(:[0-9]{1,5})?" +
            "((/?)|" +
            "(/[0-9a-z_!~*'().;?:@&=+$,%#-]+)+/?)$";
        var re = new RegExp(strRegex);

        //var strRegex = "^(https?)://[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]$";
        //var re = new RegExp(strRegex);
        if (!re.test(address)) {
            showValidateTip($oaAddress, i18n.t('CredError3'));
            return false;
        }
    }
    if (address.indexOf('https') !== -1) {
        if (address.indexOf('https://')) {
            showValidateTip($oaAddress, i18n.t('CredError4'));
            return false;
        }
    } else if (address.indexOf('http') !== -1) {
        if (address.indexOf('http://')) {
            showValidateTip($oaAddress, i18n.t('CredError4'));
            return false;
        }
    }
    return true;
}

/**
 * 校验用户名必填
 * @returns {boolean}
 */
function validateUsername() {
    var $username = $('input[name="username"]');
    distroyValidateTip($username);
    if ($.trim($username.val()).length == 0) {
        showValidateTip($username, i18n.t('CredError1'));
        return false;
    }
    return true;
}

/**
 * 校验密码必填
 * @returns {boolean}
 */
function validatePassword() {
    var $userPassword = $('input[name="userPassword"]');
    distroyValidateTip($userPassword);
    if ($.trim($userPassword.val()).length == 0) {
        showValidateTip($userPassword, i18n.t('CredError0'));
        return false;
    }
    return true;
}

/**
 * 校验语言选择必填
 * @returns {boolean}
 */
function validateLanguage() {
    var $islanguid = $('input[name="islanguid"]');
    distroyValidateTip($islanguid);
    if ($.trim($islanguid.val()).length == 0) {
        showValidateTip($islanguid, i18n.t('CredError'));
        return false;
    }
    return true;
}

// 校验动态令牌
function validateOtherKey() {
    var $tokenpass = $("input[name='tokenpass']");
    var tokennum = $.trim($tokenpass.val());
    $tokenpass.val(tokennum);
    if ($tokenpass.length > 0) {
        distroyValidateTip($tokenpass);
        if (tokennum.length == 0) {
            showValidateTip($tokenpass, i18n.t('Enter') + i18n.t('DynaPass0'));
            return false;
        } else if (!isdigit(tokennum)) {
            showValidateTip($tokenpass, i18n.t('DynaPass0') + i18n.t('KeyError0'));
            return false;
        } else if (tokennum.length != 6) {
            showValidateTip($tokenpass, i18n.t('DynaPass0') + i18n.t('KeyError'));
            return false;
        }
    }
    return true;
}

function isdigit(s) {
    var r, re;
    re = /\d*/i; //\d表示数字,*表示匹配多个数字
    r = s.match(re);
    return (r == s) ? true : false;
}

/**
 * 新建表单验证提示
 * @param $selector
 * @param content
 */
function showValidateTip($selector, content) {
    //$selector.focus();
    $selector.poshytip({
        className: 'tip-yellowsimple',
        content: content,
        showOn: 'none',
        alignTo: 'target',
        alignX: 'inner-left',
        alignY: 'bottom',
        offsetY: 5
    });
    // 设置小箭头指到输入框左侧固定位置。
    //$('.tip-yellowsimple .tip-arrow-top').css('left', $selector.offset().left - 82);
    $selector.poshytip('show');
}

/**
 * 销毁提示
 * @param $selector
 */
function distroyValidateTip($selector) {
    $selector.poshytip('destroy');
}

/**
 * 获得当前操作系统类型,Windows,OSX,Linux
 * @returns {string}
 */
function getOsString() {
    const platform = window.Electron.ipcRenderer.sendSync('global-getPlatform');
    var os = 'Windows';
    if (platform.OSX) {
        os = 'OSX';
    } else if (platform.Linux) {
        os = 'Linux';
    }
    return os;
}

var LocolConfigUtils = {
    get: function(args) {
        return window.Electron.ipcRenderer.sendSync(args, 'global-getUserConifg');
    }
};


function isUserNeedOtherKey() {
    var oaAddress = $('input[name="oaAddress"]').val().trim();
    var username = $('input[name="username"]').val().trim();
    var $otherKey_dd = $('#otherKey');
    var $otherKey_div = $('#otherKey_div');
    var $dynapass_div = $('#dynapass_div');
    if (dynapassControl._isStart) {
        dynapassControl._clearRealStartInterval();
        $('input[name="userPassword"]').closest('dd').removeAttr('style');
        errotTipUtils.closeErrorTip();
    }
    if (oaAddress && username) {
        var userUsbType = '0';
        var loginid = encodeURIComponent(username);
        //根据填写的用户名检查是否启用动态口令
        $.ajax({
            // async : false,
            url: getSubmitUrl().prefix + '/login/LoginOperation.jsp?method=checkTokenKey',
            data: {
                'loginid': loginid
            },
            success: function(data) {
                userUsbType = $.trim(data);
                if (!$dynapass_div.is(':hidden')) {
                    $dynapass_div.hide();
                }
                if (userUsbType == '3') {
                    if ($otherKey_dd.is(':hidden')) {
                        $otherKey_div.html('<label data-i18n="DynaPass">' + i18n.t('DynaPass') + '</label><input type="text" data-i18n="[_text]DynaPass0]" name="tokenpass"/>');
                        $otherKey_dd.show();
                    }
                } else {
                    if (!$otherKey_dd.is(':hidden')) {
                        distroyValidateTip($('input[name="tokenpass"]'));
                        $otherKey_dd.hide();
                        $otherKey_div.html('');
                    }
                }
            },
            error: function(XMLHttpRequest, textStatus, errorThrown) {
                if (!$dynapass_div.is(':hidden')) {
                    $dynapass_div.hide();
                }
                if (!$otherKey_dd.is(':hidden')) {
                    distroyValidateTip($('input[name="tokenpass"]'));
                    $otherKey_dd.hide();
                    $otherKey_div.html('');
                }
            }
        });
    } else {
        if (!$otherKey_dd.is(':hidden')) {
            distroyValidateTip($('input[name="tokenpass"]'));
            $otherKey_dd.hide();
            $otherKey_div.html('');
        }
    }
}
//扫码登录定时器
function qrcodeLoginTask(submitUrls) {
    qrcodeLoginHandle = setTimeout(() => {
        getloginstatus(getSubmitUrl());
    }, 1000);
}
// 检测扫码登陆结果
function getloginstatus(submitUrl) {
    var langid = $('[name="islanguid"]').val();
    if (!$("#qrcodeLogin").is(":hidden")) {
        qrCodeGetCount++;
        if (qrCodeGetCount >= 60) {
            $('#backbtn').click();
            return;
        }
        jQuery.ajax({
            url: submitUrl.qrcodeUrl + '&langid=' + langid + '&rdm=' + new Date().getTime(),
            dataType: 'text',
            contentType: 'charset=UTF-8',
            error: function(ajaxrequest) { qrcodeLoginTask(); },
            success: function(content) {
                content = $.trim(content);
                if (content !== '0' && content !== '9') {
                    //alert('login successfully');
                    setToLogingView();
                    $('.cancelButton').hide();
                    $('#backbtn').click();
                    errotTipUtils.showInfoWithoutImg(i18n.t("Logining"));
                    // 发送请求获得sessionkey等信息
                    $.post(submitUrl.postUrl, { method: 'afterQRLogin' }, function(data) {
                        afterLoginSuccess(data, submitUrl, 2);
                    });
                } else {
                    qrcodeLoginTask();
                }
            }
        });
    }
}
// 生成随机二维码
function passwordBuilder(length) {
    var str = '';
    var arr = [
        "2", "3", "4", "5", "6", "7", "8", "9",
        "a", "d", "e", "f", "g", "h", "i", "j",
        "m", "n", "r", "t", "u", "y",
        "A", "B", "D", "E", "F", "G", "H", "J",
        "L", "M", "N", "Q", "R", "T", "Y"
    ];
    while (str.length < length) {
        var temp = arr[getRandomInt(0, 37)];
        if (str.indexOf(temp) == -1) {
            str += temp;
        }
    }
    return str;
}
// 获得min到max之间的随机整数
function getRandomInt(min, max) {
    return parseInt(Math.random() * max + min, 10);
}