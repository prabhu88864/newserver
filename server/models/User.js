import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import bcrypt from "bcryptjs";

const User = sequelize.define("User", {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  phone: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },

  role: {
    type: DataTypes.ENUM("USER", "ADMIN"),
    allowNull: false,
    defaultValue: "USER",
  },

  userType: {
    type: DataTypes.ENUM("TRAINEE_ENTREPRENEUR", "ENTREPRENEUR"),
    allowNull: false,
    defaultValue: "TRAINEE_ENTREPRENEUR",
  },

  profilePic: { type: DataTypes.STRING, allowNull: true },

  userID: { type: DataTypes.STRING(12), allowNull: false, unique: true },

  referralCode: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  sponsorId: { type: DataTypes.INTEGER, allowNull: true },

  leftCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  rightCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  paidPairs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sponsorPaidPairs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  // Bank Details
  bankAccountNumber: { type: DataTypes.STRING, allowNull: true },
  ifscCode: { type: DataTypes.STRING, allowNull: true },
  accountHolderName: { type: DataTypes.STRING, allowNull: true },
  panNumber: { type: DataTypes.STRING, allowNull: true },
  upiId: { type: DataTypes.STRING, allowNull: true },
});

const generateNumericUserID = () => {
  const num = Math.floor(100000 + Math.random() * 900000); // 6 digits
  return `SUN${num}`;
};
// ✅ generate userID BEFORE validation
User.beforeValidate(async (user, options) => {
  if (!user.userID) {
    let isUnique = false;

    while (!isUnique) {
      const tempId = generateNumericUserID();

      const exists = await User.findOne({
        where: { userID: tempId },
        transaction: options?.transaction,
      });

      if (!exists) {
        user.userID = tempId;
        isUnique = true;
      }
    }
  }
});



export default User;
