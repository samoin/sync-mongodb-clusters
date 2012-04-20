var mongoose = require('mongoose'),  
    Schema = mongoose.Schema,  
    ObjectId = Schema.ObjectId;
var config = require("../server.config") || {};
var SERVER_DB = config.server_db_info || "";
mongoose.connect(SERVER_DB);  
exports.mongoose = mongoose;
exports.Schema = Schema;
exports.ObjectId = ObjectId;