'use strict';
const node_path = require('path');
const fs = require('fs');
const http = require('http');
const urlparse = require('url').parse;
const crypto = require('crypto'); 
var reqMap = {};
/**
* 上传
* categoryid:目录ID，filePath:文档路径，fileStat:文档信息，userInfos:用户信息，uid：文件唯一值
*/
exports.uploadFile = function (filePath,fileStat,fileMd5,uploadfileguid,comefrom) {
	if(fileStat.size == 0)
	{
		uploadError(uploadfileguid);
	}
	else
	{
		if(comefrom == '1')
		{
			uploadSizeCount += fileStat.size;
		}
		uploadFileTemp(filePath,fileStat.size,0,fileMd5,uploadfileguid,comefrom);
	}
};

/**
* 上传缓存文件，以1M为一个单位上传
*/
function uploadFileTemp(filePath,filesize,startsize,fileMd5,uploadfileguid,comefrom)
{
	// 计算分块单位
	var itemsize = 0;
	var endsize = parseInt(startsize) + (1024*1024);
	// 如果结束位置大于文件大小，结束位置取文件大小
	if(endsize >= filesize)
	{
		endsize = filesize -1;
	}
	// 上传到服务器
	upload_file(filePath,filesize,parseInt(startsize),endsize,fileMd5,uploadfileguid,comefrom);
}

function upload_file(filePath,filesize,startsize,endsize,fileMd5,uploadfileguid,comefrom)
{
		var urlinfo = urlparse(userInfos.currentHost+"/docs/networkdisk/uploadFiles_temp.jsp");
		var options = {
			method: 'POST',
			host: urlinfo.hostname,
			part: urlinfo.port,
			path: urlinfo.pathname,
			headers: {
				'loginid': userInfos.loginId,
				'uploadfileguid': uploadfileguid,
				'filepathmd5': fileMd5,
				'filesize' : filesize
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
					if(res.headers.returnstatus == '1')
					{
						uploadFileTemp(filePath,filesize,res.headers.startsize,fileMd5 ,uploadfileguid,comefrom);
						
					}
					else
					{	
						if(comefrom == '1')
						{
							fillProgressBar(uploadfileguid,100);
						}
					}
				}
			});
		});
		if(comefrom == '1')
		{
			reqMap[uploadfileguid] = req;
		}

	var readstream  = fs.createReadStream(filePath,{start: startsize, end: endsize });
	
	readstream.on('data', function(chunk) {
		req.write(chunk);
	});
	// 读取结束
	readstream.on('end',function(){
		var filepr =  Math.round(endsize / (filesize) * 10000) / 100.00;
				if(filepr > 99)
				{
					filepr = 99;
				}
		if(comefrom == '1')
		{
			fillProgressBar(uploadfileguid,filepr);
		}
		req.end();
		if(comefrom == '1')
		{
			uploadedSizeCount += (endsize - startsize);
		}
		var fileprFull =  Math.round(uploadedSizeCount / (uploadSizeCount) * 10000) / 100.00;
		if(fileprFull > 99)
		{
			fileprFull = 99;
		}
		if(comefrom == '1')
		{
			fillFullProcess(fileprFull,'upload');
		}
	});
}

/**
* 获取文件信息
*/
exports.getFilefileStat =  function(pathname){
	var fileStat = fs.statSync(pathname);
	return fileStat;
};
/**
* 取消上传
*/
exports.cancelUpload =  function(uploadfile_uid){
	reqMap[uploadfile_uid].destroy();
};

/**
* 暂停上传
*/
exports.pauseUpload =  function(uploadfile_uid){
	reqMap[uploadfile_uid].destroy();
};



/**
* 重新上传
*/
exports.resumeUpload =  function(diskPath,totalSize,size,fileMd5,uploadfileguid){
	var _endsize = parseInt(size) + (1024*1024);
	if(_endsize >= totalSize)
	{
		_endsize = totalSize;
	}
	upload_file(diskPath,totalSize,parseInt(size),_endsize - 1,fileMd5,uploadfileguid);
};



/**
* 全部取消上传
*/
exports.cancelAllUpload =  function(){
	//reqMap.destroy();
	for(var key in reqMap)  
	reqMap[key].destroy();
};

/**
* 全部暂停上传
*/
exports.pauseAllUpload =  function(){
	//reqMap.destroy();
	for(var key in reqMap)  
	reqMap[key].destroy();
};

/**
* 全部重新上传
*/
exports.resumeAllUpload =  function(itemMap){
	for(var key in reqMap)  {
		var file=reqMap[key];
		resumeUpload(file.diskPath,file.totalSize,file.size,file.fileMd5,file.uploadfileguid);
	}
};
