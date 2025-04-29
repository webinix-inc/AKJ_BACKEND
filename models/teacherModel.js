const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
    {
        user: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: "User", 
            required: true,
            unique: true,
        },
        courses: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
          }] 
    },
    { timestamps: true },
   
);
const Teacher = mongoose.model("Teacher", teacherSchema);

module.exports =Teacher;