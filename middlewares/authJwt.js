const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const authConfig = require("../configs/auth.config");

const verifyToken = (req, res, next) => {
  const token =
    req.get("Authorization")?.split("Bearer ")[1] ||
    req.headers["x-access-token"];
  if (!token) {
    return res.status(403).send({
      message: "no token provided! Access prohibited",
    });
  }

  // console.log("token provided :", token);

  jwt.verify(token, authConfig.secret, async (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({
        message: "UnAuthorised !",
      });
    }
    const user = await User.findOne({ _id: decoded.id });
    if (!user) {
      return res.status(401).send({
        message: "Invalid or expired session. Please log in again.",
      });
    }
    req.user = user;
    next();
  });
};
const isAdmin = (req, res, next) => {
  const token =
    req.headers["x-access-token"] ||
    req.get("Authorization")?.split("Bearer ")[1];

  if (!token) {
    return res.status(403).send({
      message: "no token provided! Access prohibited",
    });
  }

  jwt.verify(token, authConfig.secret, async (err, decoded) => {
    if (err) {
      return res.status(401).send({
        message: "UnAuthorised ! Admin role is required! ",
      });
    }

    const user = await User.findOne({ email: decoded.id });

    if (!user) {
      return res.status(400).send({
        message: "The admin that this  token belongs to does not exist",
      });
    }
    req.user = user;

    next();
  });
};

module.exports = {
  verifyToken,
  isAdmin,
};
