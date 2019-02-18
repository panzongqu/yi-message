$(function(){
    if(window.Electron.ipcRenderer.sendSync('global-getIsAeroGlassEnabled')) {
        $('body').addClass('canAero-body');
        $('.remind').addClass('canAero-remind');
    }

    var _win = window.Electron.currentWindow;   
    //处理到达的消息
    function handleTip(data){      
        var quenueLength = AppTipWindowUtil._pushInQueue(data)-1;
        if($(".bottom-ul li").length<10){
           $(".bottom-ul").append("<li id='li"+quenueLength+"' onclick='AppTipWindowUtil._liAction("+quenueLength+")'></li>");           
        }        
        if(quenueLength>=1){
          showOrhideCarousel(true);  
        }else if(quenueLength==0){
            $(".next").attr("title", "下一条");
            var _thisulli= $("#li0");
            if(typeof _thisulli==="object" && _thisulli.length>0 ){
                 $(".bottom-ul li").removeClass("active");
                 $(_thisulli).addClass("active");
            }
            clearRemindView();
            setRemindView(data);
            showOrhideCarousel(false);
        }else{
            showOrhideCarousel(false);
        }
            var data = $(".bottom-ul li.active").attr("id");
            data = data.substring(2);
            data = Number(data);
            if(data==0){
                 $(".prev").hide() 
            }            
        AppTipWindowUtil._startInterval();//开启定时器  
		var localconfig = window.Electron.ipcRenderer.sendSync('global-getUserConifg');
		var popWinAutoCloseSec = localconfig.msgAndRemind.popWinAutoCloseSec;
		if(popWinAutoCloseSec && !isNaN(popWinAutoCloseSec) && popWinAutoCloseSec != '0') {
			try{
				setTimeout(function() {
					AppTipWindowUtil._messageQueue =new Array();
					window.Electron.currentWindow.close();
					clearRemindView();
				},1000 * (typeof popWinAutoCloseSec == 'number'? popWinAutoCloseSec: parseInt(popWinAutoCloseSec)));
			}catch(e){}
		}
    }
    $('.remind-close').click(function(event){
        _win.close();
    })
    $(".prev").click(function(){
        AppTipWindowUtil._checkMessage(false);
    })
    $(".next").click(function(){
        AppTipWindowUtil._checkMessage(true);
    })
    $('.center').hover(function(){
       if(AppTipWindowUtil._winTimeOut!=null){
                clearTimeout(this._winTimeOut);
                this._winTimeOut = null;  
       }
    }, function(){
        if(AppTipWindowUtil._winTimeOut == null){
			var localconfig = window.Electron.ipcRenderer.sendSync('global-getUserConifg');
			var popWinAutoCloseSec = localconfig.msgAndRemind.popWinAutoCloseSec;
			if(popWinAutoCloseSec && !isNaN(popWinAutoCloseSec) && popWinAutoCloseSec != '0') {
				try{
					AppTipWindowUtil._winTimeOut = setTimeout(function() {
						window.Electron.currentWindow.close();
						clearRemindView();
					},1000 * (typeof popWinAutoCloseSec == 'number'? popWinAutoCloseSec: parseInt(popWinAutoCloseSec)));
				}catch(e){}
			}
        }
    });
    // 注册一个页面级信息通道，接收主进程发送来的提醒消息。
    window.Electron.ipcRenderer.on('plugin-remind-htmlFile', function(event, args){        
        _win.showInactive();  // 顶层展示窗口且不获得焦点
        handleTip(args);
    });
});
 //处理接收的消息
    var AppTipWindowUtil = {
        _carouselInterval: null,//轮播定时器
        _winTimeOut:null,
        _messageQueue : new Array(),  // 提醒消息队列
        _markReadmessageQueue :{},//标识已读
        _slicelength : 10, //默认取前10条
        _flag:0,            //标识当前展示的位置
        _pushInQueue : function(args){ //加到队列尾部
            return this._messageQueue.push(args);
        },
        _sliceFromQueue : function(star){
            return this._messageQueue.slice(star,star+this._slicelength);
        },
        _checkMessage:function(flag){
            var data = $(".bottom-ul li.active").attr("id");
            data = data.substring(2);
            data = Number(data);
             var _this  =this;
             if(flag){ //true 下一条或者下一页消息,
                if(data%10 == 9){//下一页
                  var _tempMessage= _this._sliceFromQueue(_this._flag+1); 
                  $(".bottom-ul li").remove();
                  for(var i =data+1;i<= _tempMessage.length+data;i++){
                        if(i == data+1){
                            $(".bottom-ul").append("<li id='li"+i+"' class='active' onclick='AppTipWindowUtil._liAction("+i+")'></li>"); 
                        }else{
                             $(".bottom-ul").append("<li id='li"+i+"' onclick='AppTipWindowUtil._liAction("+i+")'></li>"); 
                        }      
                    }               
                }
                _this._liAction(data+1);
             }else{//false 上一条或者上一页
                 if(data%10 ==0){ //上一页
                  $(".bottom-ul li").remove();
                  for(var i =data-10;i< data;i++){
                        if(i == data){
                            $(".bottom-ul").append("<li id='li"+i+"' class='active' onclick='AppTipWindowUtil._liAction("+i+")'></li>"); 
                        }else{
                            $(".bottom-ul").append("<li id='li"+i+"' onclick='AppTipWindowUtil._liAction("+i+")'></li>"); 
                        }         
                    } 
                 }
                 _this._liAction(data-1);
             }
        },
        _liAction:function(data){//分页的标识
            AppTipWindowUtil._startInterval();
            data = Number(data);
            this._flag = data;
            var _thisulli= $("#li"+data);
            if(typeof _thisulli==="object" && _thisulli.length>0 ){                
                 $(".bottom-ul li").removeClass("active");
                 $(_thisulli).addClass("active");
                 clearRemindView();
                 setRemindView(AppTipWindowUtil._messageQueue[data]);
            }
            if(data%10 == 0){//如果是当前页一条数据，就显示上一页
                 $(".prev").attr("title", "上一页");
              }else{
                   $(".prev").attr("title", "上一条");
              }
              if(data%10 ==9){//如果是当前页最后一条数据，就显示下一页
                 $(".next").attr("title", "下一页");                  
              }else{
                  $(".next").attr("title", "下一条");  
              } 
              if(data+1 >= AppTipWindowUtil._messageQueue.length){//如果是最后一条数据，就隐藏
                 $(".next").hide();
               }else{
                 $(".next").show();
               }
                if(data ==0){//如果是第一条数据，就隐藏
                  $(".prev").hide();
                } else{
                  $(".prev").show();
                }              
        },
        _startInterval: function(){
            var _this = this;
            if(this._carouselInterval==null){
                    _this._carouselInterval = setInterval(function(){                                
                                    if(AppTipWindowUtil._flag+1 == AppTipWindowUtil._messageQueue.length){
                                        AppTipWindowUtil._clearInterval();
						}else{
							AppTipWindowUtil._checkMessage(true);
						}              
					},1000*5); 
            }
             if(this._winTimeOut!=null){
                clearTimeout(this._winTimeOut);
                this._winTimeOut = null;
            }           
        },
        _clearInterval:function(){
            if(this._carouselInterval!=null){
                clearInterval(this._carouselInterval);
                 this._carouselInterval = null;
            }
            if(this._winTimeOut!=null){
                clearTimeout(this._winTimeOut);
                this._winTimeOut = null;
            }
          
        }      
    }

// 清除提醒消息
function clearRemindView() {
    $('#remindTitle').html('');
    $('.remind-content').html('').removeAttr('title');
    $('.remind-details').html('');
    $('.remind-content').html('');
}
//如果只有一条的话就隐藏轮播,有多条就显示出来
function showOrhideCarousel(flag){
    if(flag){//flag =true 就显示
        $(".prev").show();
        $(".next").show();
        $(".bottom-left").show()
    }else{  //flag =false 就隐藏
        $(".prev").hide();
        $(".next").hide();
        $(".bottom-left").hide()
    }
}
// 设置提醒消息内容
function setRemindView(infos) {
    var userOaAddress = window.Electron.ipcRenderer.sendSync('global-getHost');
    var url = infos.url;
    var urlType = infos.urltype;
    var title = infos.title;
    var subject = infos.requesttitle;
    var details = infos.requestdetails;
    clearRemindView();
    $('#remindTitle').html(title);
    $('.remind-content').html(subject).attr('title', subject);
    $('.remind-details').html(details);
    $('.remind-content').unbind('click').click(function(){
        openUrlLocal(url, urlType);
        if(AppTipWindowUtil._messageQueue.length == 1){
            window.Electron.currentWindow.close();
        }
    });
}

function formatDate(dateStr) {
    return dateStr.substring(0, 10) + '&nbsp;&nbsp;' + dateStr.substring(10);
}

// 外部链接：首页、邮件、博客等的打开（调用本地浏览器打开url）
function openUrlLocal(url, urlType) {
    var args = {
        event : 'open-url-local',
        args : { url : url, urlType : urlType }
    };
    window.Electron.ipcRenderer.send('send-to-mainChatWin', args);
}
// 打开弹窗设置页面
function opensetWindow(url, urlType) {
    var args = {
        event : 'open-window-set',
        args : { url : url, urlType : urlType }
    };
    window.Electron.ipcRenderer.send('send-to-mainChatWin', args);
}
