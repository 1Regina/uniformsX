import db from './.db/models/index.model.mjs';

// import the controller
import initUsersController from './controllers/users.mjs';
import initSchoolsController from './controllers/schools.mjs';
import initUniformsController from './controllers/uniforms.mjs';
import initInventoryController from './controllers/inventory.mjs';
import initDonationRequestController from './controllers/donation_request.mjs';

function bindRouteSignup(app) {
  const signupController = initUsersController(db);
  app.post('/signup', signupController.index);
}
function bindRouteEditProfile(app) {
  const usersController = initUsersController(db);
  app.post('/edit_profile', usersController.index);
}

function bindRouteMyProfile(app) {
  const usersController = initUsersController(db);
  app.post('/my_profile', usersController.index);
}

function bindRouteLogin(app) {
  const usersController = initUsersController(db);
  app.post('/login', usersController.index);
}

// TODO: This affect a few tables n could be array or object depending on number of items-- doesnt matter. Think of the table that would be affected for naming goal
function bindRouteRequest(app) {
  const donationRequestController = initInventoryController(db);
  app.post('/request', donationRequestController.index);
}

function bindRouteDonate(app) {
  const donateController = initInventoryController(db);
  app.post('/donate', donateController.index);
}

export {
  bindRouteSignup, bindRouteEditProfile, bindRouteMyProfile, bindRouteLogin, bindRouteRequest,
  bindRouteDonate,
};
