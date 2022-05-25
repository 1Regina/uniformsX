export default function initSchoolsModel(sequelize, DataTypes) {
  return sequelize.define(
    'schools',
    {
      school_id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      school_name: {
        allowNull: false,
        type: DataTypes.STRING,
      },
      school_code: {
        allowNull: false,
        type: DataTypes.STRING,
      },
    },
    {
      // The underscored option makes Sequelize reference snake_case names in the DB.
      underscored: true,

    },
  );
}
