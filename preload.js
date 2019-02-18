/**Renderer:
 * remote:通过渲染过程使用主进程模块。
 * ipcRenderer:从渲染进程到主进程的异步通信
 * Main:
 * Menu:创建本机应用程序菜单和上下文菜单
 * MenuItem:将选项添加到本机应用程序菜单和上下文菜单
 * Both:
 * clipboard:执行复制和粘贴操作在系统剪贴板上
 * */
//var electron = require('electron');
var { remote } = require('electron');
var currentWindow = remote.getCurrentWindow();
var { ipcRenderer } = require('electron');
var { Menu, MenuItem } = remote;
var { clipboard } = require('electron');
//把客户端日志接口暴露给jsp使用
const pcUtils = require('./pcUtils.js');

window.Electron = {
    currentWindow: currentWindow,
    require: require,
    remote: remote,
    Menu: Menu,
    MenuItem: MenuItem,
    clipboard: clipboard,
    ipcRenderer: ipcRenderer,
    pcUtils: pcUtils
};
delete global.require;
delete global.exports;
delete global.module;