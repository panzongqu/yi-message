const node_path = window.Electron.require('path');
const fs = window.Electron.require('fs');
const fse = window.Electron.require('fs-extra');
const getHomePath = window.Electron.require('home-path');
const platform = window.Electron.ipcRenderer.sendSync('global-getPlatform');
const netScan = window.Electron.require('net-scan');
const low = window.Electron.require('lowdb');
const FileSync = window.Electron.require('lowdb/adapters/FileSync');
const adapter = new FileSync(node_path.join(__dirname, './../../db.json'));
const db = low(adapter);
var exec = window.Electron.require('node-cmd');



var LngMapping = {
    "7": "zh_CN",
    "8": "en",
    "9": "zh_TW"
};
$(function() {
    // 最小化按钮
    $(".minButton").click(function() {
        window.Electron.currentWindow.minimize();
    });
    // 关闭按钮
    $(".closeButton").click(function() {
        setCancelButton(getIpText());
    });
    $('.cancel').click(function() {
        setCancelButton(getIpText());
    });
    $('.confirm').click(function() {
        setConfirmButton(getIpText(), getCheckStatus());
    });
    $('#ipSetSw').change(function() {
        setInputEnable(this.checked);
    });
    $('#testBtn').click(function() {
        testIp(getIpText(), function(isTestPass) {
            setTestRst(isTestPass);
        });
    });

    $('#checkDragBtn').click(function() {
        if (platform.Windows) {
            exec.get('CHCP 65001 & reg add HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\policies\\system \/v EnableLUA \/t REG_DWORD \/d 0x0 \/f',
                function(error, data, stderr) {
                    if (!error) {
                        setExecRst(true);
                    } else {
                        setExecRst(false);
                        var fileName = "OpenDragFunction.cmd";
                        var sourceFile = node_path.join(node_path.resolve(__dirname, '../../'), "script", fileName);
                        var destPath = node_path.join(getHomePath(), "desktop", fileName);
                        try {
                            var readStream = fs.createReadStream(sourceFile);
                            var writeStream = fs.createWriteStream(destPath);
                            readStream.pipe(writeStream);
                            setExecRst(false, i18n.t('RunScript'));
                        } catch (err) {
                            setExecRst(false, i18n.t('RunEmessage'));
                        }
                    }
                });
        } else {
            setExecRst(false, i18n.t('MacNotSupport'));
        }
    });

    $('.contentTitle').click(function() {
        var $this = $(this);
        $this.parent().find('.contentInfo').toggle();
        $this.find('.fa-chevron').toggleClass('arrow-right').toggleClass('arrow-down');
    });

    // 美化滚动条
    $('.center').perfectScrollbar();
    // 读取初始化值
    setInitValue();
    // 加载国际化
    var lngVal = localStorage.getItem('languageid') || 7;
    var i18nOption = {
        lng: LngMapping[lngVal],
        ns: 'set',
        resGetPath: '../../locales/__lng__/__ns__.json'
    };
    i18n.init(i18nOption, function(err, t) {
        $(".container").i18n();
    });

});

function setInitValue() {
    // var isChecked = localStorage.getItem("serverIpOn");
    // var serverIp = localStorage.getItem('emessage_server_ip');
    var serverIpOn, serverIp;
    var serverIpSet = db.get('serveripset').find({ id: 0 }).value();
    if (serverIpSet) {
        serverIp = serverIpSet.serverIp;
        serverIpOn = !!serverIpSet.serverIpOn;
    }
    $('#ipText').val(serverIp);
    if (serverIpOn) {
        $('#ipSetSw').attr('checked', 'checked');
    } else {
        $('#ipSetSw').removeAttr('checked');
    }

    setInputEnable(serverIpOn);
}

function setTestRst(isPass, rstText) {
    var testRstLable = $("#testRst");
    if (isPass) {
        testRstLable.text(rstText ? rstText : i18n.t('TestSuccess')).removeClass('testFail').addClass('testSuc');
    } else {
        testRstLable.text(rstText ? rstText : i18n.t('IpAcessError')).removeClass('testSuc').addClass('testFail');
    }
    testRstLable.show();
}

function setExecRst(isPass, rstText) {
    var testRstLable = $("#checkDragRst");
    if (isPass) {
        testRstLable.attr('result', 'true');
        testRstLable.text(rstText ? rstText : i18n.t('GragDoneSuc')).removeClass('testFail').addClass('testSuc');
    } else {
        testRstLable.attr('result', 'false');
        testRstLable.text(rstText ? rstText : i18n.t('GragDoneWrong')).removeClass('testSuc').addClass('testFail');
    }
    testRstLable.show();
}

function setInputEnable(flag) {
    if (flag) {
        $('#ipText,#testBtn').removeAttr('disabled');
    } else {
        $('#ipText,#testBtn').attr('disabled', 'disabled');
        $("#testRst").hide();
    }
}

function getCheckStatus() {
    return $("#ipSetSw").is(':checked')
}

function getIpText() {
    return $("#ipText").val();
}

function setConfirmButton(ip, isChecked) {
    if (isChecked && !checkIpFormat(ip)) {
        return;
    }
    var serverIp = "",
        serverIpOn = "";
    if (checkIpFormat(ip)) {
        // localStorage.setItem('emessage_server_ip', getIpObj(ip).host);
        serverIp = getIpObj(ip).host;
    }
    // localStorage.setItem("serverIpOn", isChecked?1:'');
    serverIpOn = isChecked ? 1 : '';
    db.set('serveripset', [{ id: 0, serverIp: serverIp, serverIpOn: serverIpOn }]).write();

    //重启操作
    var testRstLable = $("#checkDragRst");
    if (testRstLable.attr('result') === 'true') {
        window.Electron.ipcRenderer.send('reboot-system');
    }
    window.Electron.currentWindow.close();
}

function checkIpFormat(ip) {
    var strRegex = "^(http\:\/\/|https\:\/\/)?" +
        "(([0-9]{1,3}\.){3}[0-9]{1,3}" +
        "|" +
        "([0-9a-z_!~*'()-]+\.)*" +
        "([0-9a-z][0-9a-z-]{0,61})?[0-9a-z]\." +
        "[a-z]{2,6})" +
        "(:[0-9]{1,5})?" +
        "((/?)|" +
        "(/[0-9a-z_!~*'().;?:@&=+$,%#-]+)+/?)$";
    var re = new RegExp(strRegex);
    if (!re.test(ip)) {
        setTestRst(false, i18n.t('IpFormatError'));
        return false;
    }
    return true;
}

function normalizeIp(ip) {
    if (typeof ip !== 'string') return ip;
    // 去除首尾空格
    ip = ip.trim();
    // 去除末尾的斜杠
    while (ip.charAt(ip.length - 1) === '/') {
        ip = ip.substring(0, ip.length - 1);
    }
    return ip;
}

function getIpObj(ip) {
    var o = {};
    if (typeof ip !== 'string') return o;
    ip = normalizeIp(ip);
    var i = ip.lastIndexOf(':');
    var j = ip.indexOf('://');
    var t = ip;
    if (i != -1) {
        var port = t.substring(i + 1, t.length);
        o.port = port;
        t = t.substring(0, i);
    }
    if (j != -1) {
        var protocal = t.substring(0, j);
        o.protocal = protocal;
        o.host = t.substring(j + 3, t.length);
    } else {
        o.host = t;
    }
    return o;
}

function testIp(ip, cb) {
    if (checkIpFormat(ip)) {
        // net scan
        var ipObj = getIpObj(ip);
        var portAry = new Array();
        if (ipObj.port) {
            portAry.push(ipObj.port);
        } else {
            portAry.push(7070);
            portAry.push(7443);
        }
        netScan.port({
            host: ipObj.host,
            ports: portAry,
            timeout: 2000
        }, function(err, rst) {
            if (rst.length > 0) {
                typeof cb === 'function' && cb(true);
            } else {
                typeof cb === 'function' && cb(false);
            }
        });
    }
}

function setCancelButton(ip) {
    window.Electron.currentWindow.close();
}