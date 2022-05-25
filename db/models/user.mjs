export default function initUsersModel(sequelize, DataTypes) {
  return sequelize.define(
    'users',
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      name: {
        allowNull: false,
        type: DataTypes.STRING,
      },
      email: {
        allowNull: false,
        type: DataTypes.STRING,
      },
      password: {
        allowNull: false,
        type: DataTypes.STRING,
      },
      phone: {
        allowNull: false,
        type: DataTypes.INTEGER,
      },
      is_donor: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
      },
      is_recipient: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
      },
      created_on: {
        allowNull: false,
        type: DataTypes.DATE,
      },
    },

    {
      // The underscored option makes Sequelize reference snake_case names in the DB.
      underscored: true,
      timestamps: false, // deactivate the requirement for inserting timestamp fields
    },
  );
}
