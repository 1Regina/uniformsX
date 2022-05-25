export default function initDonationRequestModel(sequelize, DataTypes) {
  return sequelize.define(
    'donation_request',
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      recipient_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      inventory_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        references: {
          model: 'inventory',
          key: 'id',
        },
      },
      reserved_date: {
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
