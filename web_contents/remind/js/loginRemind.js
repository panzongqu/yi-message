const node_path = window.Electron.require('path');
const fs = window.Electron.require('fs');
const fse = window.Electron.require('fs-extra');
const getHomePath = window.Electron.require('home-path');
const platform = window.Electron.ipcRenderer.sendSync('global-getPlatform');
const shell = window.Electron.remote.shell;
const querystring = window.Electron.require('querystring');


$(function() {
    if (window.Electron.ipcRenderer.sendSync('global-getIsAeroGlassEnabled')) {
        $('body').addClass('canAero-body');
        $('.container').addClass('canAero-container');
    }
    var _win = window.Electron.currentWindow;

    var tourl;
    window.Electron.ipcRenderer.on('args', function(event, args) {
        $('#remindTitle').html(args.title);
        $('.remind-content').html(args.message);
        _win.isAlwaysOnTop();
        if (args.type == 'comfirm') {
            tourl = '/hrm/password/commonTab.jsp?fromUrl=hrmResourcePassword&showClose=true&canpass=1&RedirectFile=/wui/main.jsp';
            //tourl = '/hrm/HrmTab.jsp?_fromURL=HrmResourcePassword';
            $('.footer').append("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<input type='button' class='cancel' value='取消'/>")
            $('.footer').css("padding-right", "73px");
        } else {
            tourl = '/hrm/password/commonTab.jsp?fromUrl=hrmResourcePassword&showClose=true&RedirectFile=/wui/main.jsp';
            //tourl = '/hrm/HrmTab.jsp?_fromURL=HrmResourcePassword';
            $('.footer').css("padding-right", "119px");
        }

        var data;
        if (args.type === 'comfirm') {
            data = { 'do': 'continue', 'extData': args.extData };
        } else {
            data = {
                'do': 'left',
                'extData': args.extData
            };
        }

        $('.remind-close').click(function(event) {
            window.Electron.ipcRenderer.send('comfirm-checkPwdWin', data);
            _win.close();
        });


        $('.footer>.comfirm').click(function(event) {
            var url;
            url = args.oaHost + '/social/im/epcforword.jsp?';
            url += 'from=pc&external=true&sessionkey=' + args.sessionkey;
            url += '&language=' + args.language;
            url += '&url=' + querystring.escape(tourl);
            openClientUrl(url);
            var comdata = {
                'do': 'left',
                'extData': args.extData
            };
            window.Electron.ipcRenderer.send('comfirm-checkPwdWin', comdata);
            _win.close();
        });

        $('.footer>.cancel').click(function(event) {
            window.Electron.ipcRenderer.send('comfirm-checkPwdWin', data);
            _win.close();
        });
    });

    window.Electron.ipcRenderer.on('checkPwdWindow-quit', function() {
        _win.close();
    });

    function openClientUrl(url) {
        shell.openExternal(url);
    }
});