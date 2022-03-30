import express, { response } from 'express';
import methodOverride from 'method-override';

import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import jsSHA from 'jssha';
import path from 'path';
import dotenv from 'dotenv';
import { request } from 'http';
import pool from './initPool.js';
import { updateMembership } from './helper_functions.js';

const envFilePath = 'uniforms.env';
dotenv.config({ path: path.normalize(envFilePath) });
// initialize salt as a global constant
const theSalt = process.env.MY_ENV_VAR;
console.log(theSalt);

const app = express();
app.use(express.static('public'));
// Configure Express to parse request body data into request.body
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(bodyParser.json());
// Override POST requests with query param ?_method=PUT to be PUT requests
app.use(methodOverride('_method'));
// Set view engine
app.set('view engine', 'ejs');
const port = 3004;

// 3 POCE6 User Auth
app.get('/signup', (request, response) => {
  response.render('signup');
});

app.post('/signup', async (request, response) => {
  const { name, email, phone } = request.body;
  console.log(request.body);
  const member = request.body.membership;

  console.log(member);
  // initialise the SHA object
  const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
  const input = request.body.password;
  // add salt to password
  const unhashedString = `${input}-${theSalt}`;

  // input the password with salt from the request to the SHA object
  shaObj.update(unhashedString);
  // get the hashed password as output from the SHA object
  const hashedPassword = shaObj.getHash('HEX');

  const values = [name, email, hashedPassword, phone];
  const rv = await pool.query(
    'INSERT INTO users (name, email, password, phone) VALUES ($1, $2, $3, $4) returning id',
    values,
  );
  // console.log(`ahaeat`, rv)
  const { id } = rv.rows[0];
  // const updRv = await updateMembership(member, id);
  // if (!updRv) return "ok";
  await updateMembership(member, id);
  response.send('sign success');
});

app.get('/login', (request, response) => {
  response.render('loginForm');
});

app.post('/login', (request, response) => {
  // retrieve the user entry using their email
  const values = [request.body.email];
  pool.query('SELECT * from users WHERE email=$1', values)
    .then((userResult) => {
      // get user record from results
      const user = userResult.rows[0];
      return user;
    }).then((user) => {
      console.log(user.password);
      // initialise SHA object
      // eslint-disable-next-line new-cap
      const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
      const input = request.body.password;
      // add salt to password
      const unhashedString = `${input}-${theSalt}`;

      // input the password from the request to the SHA object
      shaObj.update(unhashedString);
      // get the hashed value as output from the SHA object
      const hashedPassword = shaObj.getHash('HEX');
      // If the user's hashed password in the database does not match
      // the hashed input password, login fails
      if (user.password !== hashedPassword) {
      // the error for incorrect email and incorrect password are the same for security reasons.
      // This is to prevent detection of whether a user has an account for a given service.
        return response.status(403).send('login failed! Password is incorrect');
      }
      // The user's password hash matches that in the DB and we authenticate the user.
      const d = new Date();
      d.setTime(d.getTime() + 1 * 24 * 60 * 60 * 1000);
      const expires = d.toUTCString();
      response.setHeader('Set-Cookie', [
        `userEmail=${user.email}; expires=${expires}; path=/`,
      ]);
      response.setHeader('Set-Cookie', [
        `userID=${user.id}; expires=${expires}; path=/`,
      ]);
      response.cookie('loggedIn', true);
      return response.redirect('/signup');
    });
});

// LOG OUT clear cookie
app.get('/logout', (request, response) => {
  response.clearCookie('userEmail');
  response.clearCookie('loggedIn');
  response.redirect('/signup');
});
// school_id, school_name, schools.school_code,
app.get('/primary_school', (request, response) => {
  const allSchoolQuery = 'SELECT * FROM schools WHERE school_code LIKE \'P_%\'';
  pool.query(allSchoolQuery)
    .then((allSchools) => {
      const data = allSchools.rows;
      console.log(data);
      response.render('allSchools', { data });
    });
});

app.get('/secondary_school', (request, response) => {
  const allSchoolQuery = 'SELECT * FROM schools WHERE school_code LIKE \'S_%\'';
  pool.query(allSchoolQuery)
    .then((allSchools) => {
      const data = allSchools.rows;
      console.log(data);
      response.render('allSchools', { data });
    });
});

app.get('/:school/uniform', (request, response) => {
  const theSchool = request.params.school;
  console.log(theSchool);
  const sqlQuery = `SELECT school_name, schools.school_code,
                           uniforms.id AS uniforms_id, uniforms.school_code, type, size,
                           uniform_id, donor_id, COUNT(status)
                    FROM schools
                    INNER JOIN uniforms
                    ON schools.school_code = uniforms.school_code
                    INNER JOIN inventory
                    ON uniforms.id = inventory.uniform_id
                    WHERE STATUS = 'available' AND school_name='${theSchool}'
                    GROUP BY school_name, schools.school_code,
                             uniforms_id, uniforms.school_code, type, size,
                             uniform_id, donor_id
                    ORDER BY type, size`;
  pool.query(sqlQuery)
    .then((summaryCount) => {
      const data = summaryCount.rows;
      if (data.length === 0) {
        response.render('null', { theSchool });
      } else {
        console.log(data);
        response.render('showInventory', { data });
      }
    })
    .catch((err) => {
      console.error(err.message); // wont break
    });
});

app.get('/donate', (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  if (loggedIn === 'true') {
    const uniformQuery = `SELECT school_name, schools.school_code, 
                             uniforms.id AS uniforms_id,uniforms.school_code, type, size 
                      FROM schools
                      INNER JOIN uniforms 
                      ON schools.school_code = uniforms.school_code`;
    pool.query(uniformQuery)
      .then((uniformResult) => {
        const data = uniformResult.rows;
        response.render('donate', { data, userid: userID });
      }).catch((err) => {
        console.error(err.message);
      });
  } else {
    response.send('You need to login in');
  }
});
// set port to listen
app.listen(port);
