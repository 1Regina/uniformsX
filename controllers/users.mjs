/* eslint-disable no-case-declarations */
// import the object we created with everything in it from index.mjs
// eslint-disable-next-line import/extensions
import db from './db/models/index.model.mjs';

// todo: initUsersModel how do i put it in order to export it ?

class UsersController {
  constructor(db) {
    this.db = db;
  }

 const getUsers = async (req, res, next) => {
    try {
      const { userEmail, userID, loggedIn } = req.cookies;
      const user = await this.db.Users.findAll({
        where : {
          id: [userID]
        }, 
        limit: 1,
      })
         console.log(this.getUser)
    const data = getUsers.get({ plain: true });
    console.log(myInfo.rows[0]);
    data.message = 'My Profile';
    res.render('profile', { data });
    } catch (err) {
      console.error(err);
      next({
        code: 30001,
        param: 'Something went wrong...',
        message: err.message, // ie. item does not exist
      });
    }
  } ; 


}

export {}