import express from 'express';
import methodOverride from 'method-override';

import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import jsSHA from 'jssha';
import path from 'path';
import dotenv from 'dotenv';


import pool from './initPool.js';
import { updateMembership, getSchoolsList } from './helper_functions.js';

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
      response.cookie('userID', `${user.id}`);
      response.cookie('loggedIn', true);
      return response.redirect('/signup');
    });
});

// LOG OUT clear cookie
app.get('/logout', (request, response) => {
  response.clearCookie('userID');
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
  const sqlQuery = `SELECT school_name, school_code,
                           uniforms.id AS uniforms_id, type,
                           donor_id, inventory.school_id, uniform_id, size, COUNT(status)
                    FROM schools
                    INNER JOIN inventory
                    ON schools.school_id = inventory.school_id
                    INNER JOIN uniforms
                    ON uniforms.id = inventory.uniform_id
                    WHERE STATUS = 'available' AND school_name='${theSchool}'
                    GROUP BY school_name, school_code,
                           uniforms_id, type,
                           donor_id, inventory.school_id, uniform_id, size
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
  const data = {};
  // let schoolList
  let schools;
  if (loggedIn === 'true') {
    const schoolQuery = 'SELECT * FROM schools';
    pool.query(schoolQuery)
      .then((schoolResult) => {
        data.schools = schoolResult.rows;
        // console.log(schools);
        // schoolList = getSchoolsList(schools);
        // console.log(schoolList);
      })
      .then(() => {
        const uniformQuery = 'SELECT * FROM uniforms';
        pool.query(uniformQuery)
          .then((uniformResult) => {
            // console.log(uniformResult.rows);
            data.uniforms = uniformResult.rows;

            response.render('donate', { data });
          });
      })
      .catch((err) => {
        console.error(err.message);
      });
  } else {
    response.send('You need to login in');
  }
});

app.post('/donate', async (request, response) => {
  if (request.cookies.loggedIn === 'true') {
    const { userEmail, userID, loggedIn } = request.cookies;
    const {
      school, type, quantity,
    } = request.body;
    const sizing = request.body.size;
    const size = (String(sizing).replace(/ /g, '_').toUpperCase());
    try {
      const infoQuery = `SELECT school_id FROM schools WHERE school_name = '${school}'`;
      const schoolid = await pool.query(infoQuery);
      const schoolID = schoolid.rows[0].school_id;
      const findUniId = `SELECT id FROM uniforms WHERE type = '${type}'`;
      console.log('bbbb', findUniId);
      const uniID = await pool.query(findUniId);
      const uID = uniID.rows[0].id;
      const sqls = [];
      for (let i = 0; i < quantity; i += 1) {
        const insertQuery = `INSERT INTO inventory (donor_id, school_id, uniform_id, size) VALUES (${userID}, ${schoolID}, ${uID},'${size}')`;
        console.log(insertQuery);
        sqls.push(pool.query(insertQuery));
        response.send('donating');
      }
      await Promise.all(sqls);
    } catch (err) {
      console.error(err.message); // wont break
    }
  } else {
    response.send('Only members can donate');
  }
});

app.get('/my_donations', async (request, response) => {
  if (request.cookies.loggedIn === 'true') {
    console.log('aaaaaaaaa');
    const { userEmail, userID, loggedIn } = request.cookies;
    const donatQuery = `SELECT school_name, 
                               type,
                               COUNT(inventory.school_id), size, status
                        FROM schools
                        INNER JOIN inventory
                        ON schools.school_id = inventory.school_id
                        INNER JOIN uniforms
                        ON uniforms.id=inventory.uniform_id
                        WHERE donor_id = ${userID}
                        GROUP BY school_name, type, size , status`;

    // const donatQuery = `SELECT COUNT(*) FROM inventory WHERE donor_id = ${userID}`;

    const results = await pool.query(donatQuery);
    const data = results.rows;
    console.log(data);
    response.render('showMyDonations', { data });
  } else {
    response.send('please login to see what you have donated');
  }
});
// set port to listen
app.listen(port);
