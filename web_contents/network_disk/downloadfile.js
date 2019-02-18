'use strict';
const node_path = require('path');
const fs = require('fs');
const http = require('http');
const urlparse = require('url').parse;
const exec = require('child_process').exec;  
const spawn = require('child_process').spawn;  
var reqMap = {};

exports.syncdownfiles =  function(item,choosed){
	
	downloadSizeCount = parseInt(downloadSizeCount) + parseInt(item.filesize);
	syncdownfile(item,choosed);
};



exports.getFileTempSize =  function(path){
	if(fs.existsSync(path)){
		var fileStat = uploadfiles_button.getFilefileStat(path);
		return fileStat.size;
	}
	else{
		return 0;
	}
}


function syncdownfile(item,localpath){ 

	var file_url = userInfos.currentHost+'/weaver/weaver.file.NetworkDiskFileDownload';
	var urlinfo = urlparse(file_url);
	var DOWNLOAD_DIRPATH = localpath+'\\'+item.filename;
	var DOWNLOAD_DIRPATH_TEMP = DOWNLOAD_DIRPATH+"_"+item.id;
	var filestart = 0;
	
	if(fs.existsSync(DOWNLOAD_DIRPATH_TEMP)){
		var fileStat = fs.statSync(DOWNLOAD_DIRPATH_TEMP);
		filestart = fileStat.size;
	}
	var options = {
		method: 'GET',
		host: urlinfo.hostname,
		path: urlinfo.pathname,
		headers: {
			'start':  filestart,
			'imagefileid': item.uid,
		}
	};
	if(urlinfo.port) {
		options.port = urlinfo.port;
	}
	if(urlinfo.search) {
		options.path += urlinfo.search;
		}
	var req = http.request(options, function(res) {
		res.on('data', function(data) {
			fs.appendFileSync(DOWNLOAD_DIRPATH_TEMP,data);
			filestart += data.length;
			var filepr =  Math.round(filestart / (item.filesize) * 10000) / 100.00;
			if(filepr > 99)
			{
				filepr = 99;
			}
			
			if(filestart == item.filesize)
			{
				fs.renameSync(DOWNLOAD_DIRPATH_TEMP, DOWNLOAD_DIRPATH);
				filepr = 100;
			}
			fillProgressBar(item.id,filepr);
			
			downloadedSizeCount = parseInt(downloadedSizeCount) + parseInt(filestart);
			
			var fileprFull =  Math.round(filestart / (downloadSizeCount) * 10000) / 100.00;
			if(fileprFull > 99)
			{
				fileprFull = 99;
			}
			fillFullProcess(fileprFull,'download');
			
			
		}).on('end', function() {
			deleteDownloadTemp(item.id);
		});
	});
	reqMap[item.id] = req;
	req.end();
};


function deleteDownloadTemp(downloaduid)
{
	var file_url = userInfos.currentHost+'/docs/networkdisk/deleteDownloadFileTemp.jsp';
	var urlinfo = urlparse(file_url);
	
	var options = {
		method: 'GET',
		host: urlinfo.hostname,
		path: urlinfo.pathname,
		headers: {
			'downloaduid': downloaduid,
			'clientguid' : userInfos.guid
		}
	};
	if(urlinfo.port) {
		options.port = urlinfo.port;
	}
	if(urlinfo.search) {
		options.path += urlinfo.search;
	}
	var req = http.request(options, function(res) {
		var chunks = [], length = 0;
			res.on('data', function(chunk) {
				length += chunk.length;
				chunks.push(chunk);
			});
			res.on('end', function() {
				if(res.statusCode == '200')
				{
					if(res.headers.deletestatus == '1')
					{
						
					}
					else
					{	
						
					}
				}
			});
	});
	req.end();
}


exports.pauseUpload =  function(uploadfile_uid){
	reqMap[uploadfile_uid].destroy();
};



exports.resumeUpload =  function(item,localpath){
	syncdownfile(item,localpath);
};