export default function initInventoryModel(sequelize, DataTypes) {
  return sequelize.define(
    'inventory',
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      donor_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      school_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        references: {
          model: 'schools',
          key: 'school_id',
        },
      },
      uniform_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        references: {
          model: 'uniforms',
          key: 'id',
        },
      },
      size: {
        allowNull: false,
        type: DataTypes.STRING,
      },
      created_on: {
        allowNull: false,
        type: DataTypes.DATE,
      },
      status: {
        allowNull: false,
        type: DataTypes.STRING,
      },
    },
    {
      // The underscored option makes Sequelize reference snake_case names in the DB.
      underscored: true,
      timestamps: false, // deactivate the requirement for inserting timestamp fields
    },

  );
}
