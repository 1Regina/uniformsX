import sequelizePackage from 'sequelize';
import allConfig from '../../config/config.js';

import initUsersModel from './users.mjs';
import initUniformsModel from './uniforms.mjs';
import initSchoolsModel from './schools.mjs';
import initInventoryModel from './inventory.mjs';
import initDonationRequestModel from './donation_request.mjs';

const { Sequelize } = sequelizePackage;
const env = process.env.NODE_ENV || 'development';
// in this case, "env" will be development, as we have in our config.js file
// this is the same as saying :
// const config = allConfig['development']
const config = allConfig[env];
const db = {};

// initiate a new instance of Sequelize
// note similarity to pool.query
const sequelize = new Sequelize(
  // database settings from config.js
  config.database,
  config.username,
  config.password,
  config,
);

// putting the imported models into the placeholder object "db"
db.Users = initUsersModel(sequelize, Sequelize.DataTypes);
db.Uniforms = initUniformsModel(sequelize, Sequelize.DataTypes);
db.Schools = initSchoolsModel(sequelize, Sequelize.DataTypes);
db.Inventory = initInventoryModel(sequelize, Sequelize.DataTypes);
db.Donation_Request = initDonationRequestModel(sequelize, Sequelize.DataTypes);

// Associations:
// TODO: define the integrated relations. But what about inventory which is connected. It will have several associations
// TODO: Is there any Many To Many: no many to many
db.Users.hasMany(db.Inventory, { as: 'donor_id' });
db.Uniforms.hasMany(db.Inventory);
db.Schools.hasMany(db.Inventory);
db.Inventory.belongsTo(db.Users);
db.Inventory.belongsTo(db.Uniforms);
db.Inventory.belongsTo(db.Schools);

db.Donation_Request.hasOne(db.Inventory); // dont need to specify bcos field is inventory_id
db.Donation_Request.hasMany(db.Users);
db.Users.hasMany(db.Donation_Request, { as: 'recipient_id' });
db.Inventory.belongsTo(db.Donation_Request);

db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;
