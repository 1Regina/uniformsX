const randomMiddleware = async (req, res, next) => {
  console.log('this is a random middleware');
  next();
};

const authLogin = async (err, req, res, next) => {
  const data = {};
  const { userEmail, userID, loggedIn } = req.cookies;
  if (loggedIn === 'true') {
    next();
  } else {
    data.isLogin = false;
    res.render('loginForm', { data });
    console.error(err.stack);
    // res.status(500).send('Something broke!');
  }
};
export { randomMiddleware, authLogin };
