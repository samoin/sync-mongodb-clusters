var mongoose = require('mongoose'),  
    Schema = mongoose.Schema,  
    ObjectId = Schema.ObjectId;  
var OplogSchema = new mongoose.Schema({
	ts : {type : Schema.Types.Mixed},
	h : {type : Number},
	op : {type : String},
	ns : {type : String},
	o : {type : Schema.Types.Mixed},
	o2 : {type : Schema.Types.Mixed}
});
var modelName = "oplog.rs",
        collName = "oplog.rs";
mongoose.model(modelName,OplogSchema,collName);
var Model = mongoose.model(modelName,collName);
exports.dao = Model;
// 将参数继续暴露给后续的进行引用，减少require代码
exports.mongouris = "";
exports.schema = OplogSchema;
exports.modelName = modelName;
exports.collName = collName;
exports.mongoose = mongoose;