var mongoose = require('mongoose'),  
    Schema = mongoose.Schema,  
    ObjectId = Schema.ObjectId;
var config = require("../server.config") || {};
var SERVER_DB = config.server_db_info || "";
//console.log(SERVER_DB);
mongoose.connect(SERVER_DB);  
// 将参数继续暴露给后续的进行引用，减少require代码
exports.mongoose = mongoose;
exports.Schema = Schema;
exports.ObjectId = ObjectId;