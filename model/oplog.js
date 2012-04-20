var base = require("./base");
OplogSchema = new base.Schema({
	cluster_name : {type : String},
	last_flag : {type : String},
	cluster_ischanged : {type : Boolean}
});
var modelName = "oplog",
collName = "oplog";
base.mongoose.model(modelName,OplogSchema,collName);
var Model = base.mongoose.model(modelName,collName);
exports.dao = Model;
exports.mongoose = base.mongoose;
