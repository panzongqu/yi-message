'use strict';

var loginDbUtils = {
    _initDb: function() {
        //创建数据库
        webSql.openDatabase("emessagedb", "1.0", "web message db", 10 * 1024 * 1024);

        webSql.query('select rowid, oaAddress from im_login_info where oaAddress like ?', ['%/'], function(result) {
            for (var i = 0; i < result.rows.length; i++) {
                var rowdata = result.rows[i];
                var rowid = rowdata.rowid;
                var oaAddress = rowdata.oaAddress;
                oaAddress = oaAddress.substring(0, oaAddress.length - 1);
                webSql.update('update im_login_info set oaAddress = ? where rowid = ?', [oaAddress, rowid]);
            }
        });

        webSql.update('update im_login_info set userLanguage = ? where userLanguage = ? or userLanguage = ?', ['7', 'zh', '']);
        webSql.update('update im_login_info set userLanguage = ? where userLanguage = ?', ['8', 'en']);

        sleep(200);

        webSql.exeDll('alter table im_login_info add column loginTime INTEGER');

        //创建登陆页面需要的表
        webSql.createTable("create table if not exists im_login_info(oaAddress TEXT, username TEXT, password TEXT, userLanguage TEXT, languageInputCommon TEXT, rememberPassword INTEGER, automaticlanding INTEGER, headImgUrl TEXT, nmIsLast INTEGER, loginTime)");
    },

    // 记录或更新登陆用户信息
    insertOrUpdateLoginInfo: function(oaAddress, username, password, userLanguage, languageInputCommon, rememberPassword, automaticlanding, loginTime) {
        if (automaticlanding == 1) {
            webSql.update('update im_login_info set automaticlanding = ?', [0]);
        }
        /*
        // 配合能设置自动登陆，密码一直保存
        if(rememberPassword == 0) {
            password = '';
        }
        */

        webSql.update('update im_login_info set nmIsLast = ? where oaAddress = ?', [0, oaAddress], function(result) {
            var nmIsLast = 1;
            var selectSql = 'select username from im_login_info where oaAddress=? and username=?';
            var selectValuse = [oaAddress, username];
            webSql.query(selectSql, selectValuse, function(result) {
                if (result.rows.length > 0) {
                    var updateSql = 'update im_login_info set password=?, userLanguage=?, languageInputCommon=?, rememberPassword=?, automaticlanding=?, nmIsLast = ?, loginTime = ? where oaAddress = ? and username = ?';
                    var updateValuse = [password, userLanguage, languageInputCommon, rememberPassword, automaticlanding, nmIsLast, loginTime, oaAddress, username];
                    webSql.update(updateSql, updateValuse);
                } else {
                    var insertSql = 'insert into im_login_info(oaAddress, username, password, userLanguage, languageInputCommon, rememberPassword, automaticlanding, nmIsLast, loginTime) values (?,?,?,?,?,?,?,?, ?)';
                    var insertValuses = [oaAddress, username, password, userLanguage, languageInputCommon, rememberPassword, automaticlanding, nmIsLast, loginTime];
                    webSql.insert(insertSql, insertValuses);
                }
            });
        });
    },

    // 初始化页面时，设置登录页内容。
    // 1、如果有自动登陆填内容自动登陆。
    // 2、如果没有自动登陆，查找最后一次成功登陆的账户设置。
    initLastView: function(oaAddress, username, callback) {
        if (oaAddress != '') {
            var sql = 'select * from im_login_info where automaticlanding = ? order by loginTime desc';
            webSql.query(sql, [1], function(result) {
                if (result.rows.length > 0) {
                    typeof callback === 'function' && callback(result.rows[0]);
                } else {
                    sql = 'select * from im_login_info where oaAddress=? and username=?';
                    webSql.query(sql, [oaAddress, username], function(result) {
                        if (result.rows.length > 0) {
                            typeof callback === 'function' && callback(result.rows[0]);
                        }
                    });
                }
            });
        }
    },

    // 获得已记录的OA地址，去掉重复的记录，只获取时间戳最大的一条
    getExistOaAddress: function(callback) {
        //var sql = 'select * from im_login_info where nmIsLast = ? order by loginTime desc';
        var sql = 'select * from im_login_info where loginTime in (select max(loginTime) from im_login_info where nmIsLast = ? group by oaAddress,username) order by loginTime desc'
        webSql.query(sql, [1], function(result) {
            typeof callback === 'function' && callback(result.rows);
        });
    },

    // 登陆成功后，设置用户头像路径
    updateHeadImg: function(oaAddress, username, headImgUrl) {
        var sql = 'update im_login_info set headImgUrl = ? where oaAddress = ? and username = ?';
        var values = [headImgUrl, oaAddress, username];
        webSql.update(sql, values);
    },

    // 根据用户输入的oaAddress 和 username，设置用户头像
    getHeadImgAndSet: function(oaAddress, username, callback) {
        var sql = 'select headImgUrl from im_login_info where oaAddress = ? and username = ?';
        var values = [oaAddress, username];
        webSql.query(sql, values, function(result) {
            if (result.rows.length > 0) {
                typeof callback === 'function' && callback(result.rows[0].headImgUrl);
            } else {
                typeof callback === 'function' && callback(null);
            }
        });
    },

    // 取消所有自动登陆
    setAutoLoginFalse: function(callback) {
        webSql.update('update im_login_info set automaticlanding = ?', [0], callback);
    },

    // 设置自动登陆
    setAutoLoginTrue: function(oaAddress, username, callback) {
        webSql.update('update im_login_info set automaticlanding = ?, rememberPassword = ? where oaAddress = ? and username = ?', [1, 1, oaAddress, username], callback);
    },

    //删除登陆记录
    deleteLoginRecord: function(oaAddress, username, callback) {
        webSql.update('delete from im_login_info where oaAddress = ? and username = ?', [oaAddress, username], callback);
    }
};

function sleep(numberMillis) {
    var now = new Date();
    var exitTime = now.getTime() + numberMillis;
    while (true) {
        now = new Date();
        if (now.getTime() > exitTime) return;
    }
}

// 初始化
loginDbUtils._initDb();