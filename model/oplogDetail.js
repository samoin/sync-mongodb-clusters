var base = require("./base");
OplogSchema = new base.Schema({
	cluster_name : {type : String},
	update_time : {type : Date},
	server_oplog_index_from : {type : Number},
	server_oplog_index_to : {type : Number},
	client_oplog_update_count : {type : Number},
	client_oplog_error_array : {type : String}
});
var modelName = "oplogDetail",
collName = "oplogDetail";
base.mongoose.model(modelName,OplogSchema,collName);
var Model = base.mongoose.model(modelName,collName);
exports.dao = Model;
exports.mongoose = base.mongoose;
