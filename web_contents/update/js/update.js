const node_path = window.Electron.require('path');
const fs = window.Electron.require('fs');
const fse = window.Electron.require('fs-extra');
const getHomePath =  window.Electron.require('home-path');
const platform = window.Electron.ipcRenderer.sendSync('global-getPlatform');

var isDownloading = false;
var download_success = false;
var dlObj = null;

$(function(){
    if(window.Electron.ipcRenderer.sendSync('global-getIsAeroGlassEnabled')) {
        $('body').addClass('canAero-body');
        $('.container').addClass('canAero-container');
    }

    var host = window.Electron.ipcRenderer.sendSync('global-getHost');
    var buildVersion = window.Electron.ipcRenderer.sendSync('global-getNewBuildVersion');

    const DIR_PATH = __dirname;
    const PAK_PATH = node_path.join(getHomePath(), './.e-message/install');
    var pcUtils = window.Electron.require(node_path.join(DIR_PATH, './../../pcUtils.js'));
    fse.ensureDirSync(PAK_PATH);
    var FilePath = '';
    if(platform.Windows) {
        FilePath = node_path.join(PAK_PATH, 'e-message-v' + pcUtils.getVersion() + '.' + buildVersion.buildVersion + '.exe');
    } else if(platform.OSX) {
        FilePath = node_path.join(PAK_PATH, 'e-message-v' + pcUtils.getVersion() + '.' + buildVersion.osxBuildVersion + '.dmg');
    }

    // 最小化按钮
    $(".minButton").click(function(){
        window.Electron.currentWindow.minimize();
    });
    // 关闭按钮
    $(".closeButton").click(function(){
        setCancelButton(FilePath);
    });
    $('.cancel').click(function(){
        setCancelButton(FilePath);
    });

    window.Electron.ipcRenderer.on('updateWin-quit', function(){
        setCancelButton(FilePath);
    });

    try {
        if(!fs.existsSync(PAK_PATH)) {
            fs.mkdirSync(PAK_PATH);
        }

        if(buildVersion.buildVersion == -1 || buildVersion.osxBuildVersion == -1) {
            if(fs.existsSync(FilePath)) {
                fs.unlinkSync(FilePath);
            }
        }

        var $promsg = $('.promsg');
        var $progressBar = $('.progress-bar');

        // if(fs.existsSync(FilePath)) {
        //     // 版本文件已存在
        //     console.info('文件已存在');
        //     download_success = true;
        //     $progressBar.width('100%');
        //     $promsg.html('安装包下载完成');
        //     setInstallButton(FilePath);
        // }
        // else {
            // 不存在，下载
            var eDownload = window.Electron.require('ding-download').Download;
            var dlUrl = null;
            if(platform.Windows) {
                dlUrl = window.Electron.ipcRenderer.sendSync('global-getHost') + '/social/im/resources/e-message.exe';
            } else if(platform.OSX) {
                dlUrl = window.Electron.ipcRenderer.sendSync('global-getHost') + '/social/im/resources/e-message.dmg';
            }

            var newDlObj = new eDownload(dlUrl, FilePath);
            dlObj = newDlObj;
            //newDlObj.contentSize = getfileSize();

            newDlObj.on('info', function(arg1){
                //console.info('info = ' + arg1);
            });
            newDlObj.on('progress', function(arg1, arg2, arg3){
                isDownloading = true;
                //console.info('progress = ' + arg1 + '   ' + arg2 + '  ' + arg3);
                $progressBar.width((arg1.toFixed(2) * 100) + '%');
                if(arg1 == 1) {
                    isDownloading = false;
                    download_success = true;
                    $promsg.html('安装包下载完成');
                    setInstallButton(FilePath);
                }
            });
            newDlObj.on('finish', function(arg1, arg2, arg3){
                //console.info('finish');
            });
            newDlObj.on('error', function(error){
                //console.info('error');
                isDownloading = false;
                download_success = false;
                $promsg.html('安装包下载失败');
                $progressBar.width('0%');
                // 清除下载临时文件
                clearTmpFile(FilePath);
            });
        // }
    } catch (e) {
        pcUtils.handleError(e);
        console.error(e);
    }
});

// 设置安装按钮
function setInstallButton(filePath) {
    $('.install').show().click(function(){
        const shell = window.Electron.remote.shell;
        shell.openItem(filePath);

        quitFromOa();
    });
}

// 关闭窗口
function setCancelButton(filePath) {
    if(isDownloading) {
        if(dlObj) dlObj.pause();
        Dialog.confirm('正在下载资源，确定要退出？', function(){
            if(dlObj) dlObj.abort();
            clearTmpFile(filePath);
            quitFromOa();
        }, function(){
            if(dlObj) dlObj.resume();
        });
    } else {
        if(dlObj) dlObj.abort();
        clearTmpFile(filePath);
        quitFromOa();
    }
}

// 退出OA系统
function quitFromOa() {
    var ipcRenderer = window.Electron.ipcRenderer;
    var sessionkey = ipcRenderer.sendSync('global-getSessionKey');
    if(sessionkey) {
        $.ajax({
            async: false,
            url : ipcRenderer.sendSync('global-getHost') + '/social/im/ServerStatus.jsp?p=logout',
            data : {
                from: 'pc',
                sessionkey : ipcRenderer.sendSync('global-getSessionKey')
            },
            timeout : 200
        });
    }
    ipcRenderer.send('quit-app');
}

// 清理下载临时文件
function clearTmpFile(filePath) {
    var tmpPath = filePath + '.edownload';
    fs.exists(tmpPath, function(exists){
        if(exists){
            fs.unlink(tmpPath, function(error){
                if(error) {
                    console.error('删除临时文件失败');
                    console.error(error);
                }
                console.info('删除临时文件成功');
            })
        }
    });
}