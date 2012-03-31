var mongoose = require('mongoose'),  
    Schema = mongoose.Schema,  
    ObjectId = Schema.ObjectId;  
var TestSchema = new mongoose.Schema({
	age : {type : Number},
	birth : {type : Date},
	name : {type : String}
});
var modelName = "test",
        collName = "test";
mongoose.model(modelName,TestSchema,collName);
var Model = mongoose.model(modelName,collName);
exports.dao = Model;
// 将参数继续暴露给后续的进行引用，减少require代码
exports.mongouris = "";
exports.schema = TestSchema;
exports.modelName = modelName;
exports.collName = collName;
exports.mongoose = mongoose;