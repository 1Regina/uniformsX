import express from 'express';
import methodOverride from 'method-override';

import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import jsSHA from 'jssha';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import sgMail from '@sendgrid/mail';
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
        data.message = `There are no available stock for ${theSchool}`;
        response.render('null', { data });
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
      }
      await Promise.all(sqls);
      response.send('donating');
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
                               COUNT(inventory.school_id), size, status, DATE(created_on)
                        FROM schools
                        INNER JOIN inventory
                        ON schools.school_id = inventory.school_id
                        INNER JOIN uniforms
                        ON uniforms.id=inventory.uniform_id
                        WHERE donor_id = ${userID}
                        GROUP BY school_name, type, size , status, date`;

    // const donatQuery = `SELECT COUNT(*) FROM inventory WHERE donor_id = ${userID}`;

    const results = await pool.query(donatQuery);
    const data = results.rows;
    console.log(data);
    response.render('showMyDonations', { data });
  } else {
    const data = {};
    data.message = 'please login to see what you have donated';
    response.render('null', { data });
  }
});

app.get('/request', async (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  const data = {};

  if (loggedIn === 'true') {
    try {
      const schoolQuery = 'SELECT * FROM schools';
      const schoolResult = await pool.query(schoolQuery);
      data.schools = schoolResult.rows;
      const uniformQuery = 'SELECT * FROM uniforms';
      const uniformResult = await pool.query(uniformQuery);
      data.uniforms = uniformResult.rows;
      response.render('request', { data });
    }
    catch (err) {
      console.error(err.message);
      response.send('Cannot connect');
    }
  } else {
    response.send('You need to login in');
  }
});

app.post('/request', async (request, response) => {
  const data = {};
  if (request.cookies.loggedIn === 'true') {
    const { userEmail, userID, loggedIn } = request.cookies;
    const {
      school, type, quantity,
    } = request.body;
    const sizing = request.body.size;
    const size = (String(sizing).replace(/ /g, '_').toUpperCase());

    try {
      const findReqQtyQuery = `SELECT COUNT (inventory_id) 
                               FROM donation_request
                               WHERE recipient_id = ${userID} `;
      const findRecipTot = await pool.query(findReqQtyQuery);
      const recipientTotal = findRecipTot.rows[0].count;
      if ((recipientTotal + quantity) >= 20) {
        // alert('you have exceeded 20 pieces of inventory items. Please find a donor with less quantity to request to stay within your quota for the year');
        data.message = 'you have exceeded 20 pieces of inventory items. Please find a donor with less quantity to request to stay within your quota for the year';
        response.render('null', { data });
      }

      const infoQuery = `SELECT school_id FROM schools WHERE school_name = '${school}'`;
      const schoolid = await pool.query(infoQuery);
      const schoolID = schoolid.rows[0].school_id;
      const findUniId = `SELECT id FROM uniforms WHERE type = '${type}'`;
      const uniID = await pool.query(findUniId);
      const uID = uniID.rows[0].id;
      const findPotentialsQuery = `SELECT donor_id, COUNT(status) 
                                   FROM inventory WHERE status = 'available' 
                                   AND school_id = ${schoolID} 
                                   AND uniform_id = ${uID} 
                                   AND size = '${size}' 
                                   GROUP BY donor_id 
                                   HAVING COUNT(status) = ${quantity} 
                                   ORDER BY donor_id`;
      const findDonor = await pool.query(findPotentialsQuery);

      if (findDonor.rows.length === 0) {
        data.message = 'Check the inventory page for stocks. You might need to adjust your inventory to match those available by donors';
        // todo: check why alert is not working
        // alert('you need to adjust your qty');
        response.render('null', { data });
      }
      const donorFound = findDonor.rows[0].donor_id;
      console.log(donorFound);

      const sqls = [];
      const requestIds = [];
      for (let i = 0; i < quantity; i += 1) {
        const updateQuery = `UPDATE inventory SET status = 'reserved' 
                             WHERE donor_id = ${donorFound}
                             AND school_id = ${schoolID}
                             AND uniform_id = ${uID}
                             AND size = '${size}' RETURNING id`;
        sqls.push(pool.query(updateQuery));
      }

      const rvs = await Promise.all(sqls);

      // rvs.forEach((rv, idx) => {
      //   console.log(`Result: ${idx}`, rv.rows);
      // });
      const insertSQLs = [];
      const idObjArray = rvs[0].rows;
      console.log('11111111111', idObjArray);
      for (let j = 0; j < idObjArray.length; j += 1) {
        const ind = idObjArray[j].id;
        requestIds.push(ind);
        const requestTBQuery = `INSERT INTO donation_request (recipient_id, inventory_id) VALUES (${userID}, ${ind})`;
        insertSQLs.push(pool.query(requestTBQuery));
      }
      console.log(insertSQLs);
      await Promise.all(insertSQLs);
      // find and alert donor
      const findDonorQuery = `SELECT email, name, COUNT(reserved_date), 
                                 school_name, type, size
                          FROM users 
                          INNER JOIN inventory 
                          ON users.id = donor_id
                          INNER JOIN donation_request
                          ON inventory.id=inventory_id
                          INNER JOIN schools
                          ON schools.school_id = inventory.school_id
                          INNER JOIN uniforms
                          ON uniforms.id = uniform_id
                          WHERE reserved_date::date = now()::date
                          GROUP BY email, name, school_name, type, size`;
      const resultDonor = await pool.query(findDonorQuery);
      const num = resultDonor.rows.length;
      const lastReq = resultDonor.rows[num - 1];
      console.log(lastReq);
      response.send(lastReq);

      // const sgMail = require('@sendgrid/mail')();

      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const msg = {
        // to: [{'1reginacheong@gmail.com'},{}], // Change to your recipient
        to: [
          {
            email: '1reginacheong@gmail.com',
          },
          {
            email: `${lastReq.email}`,
          }],
        from: 'regina_cheong@hotmail.com', // Change to your verified sender
        subject: `There is a request for your donated ${lastReq.school_name} uniforms`,
        text: `There is a request for the ${lastReq.count} ${lastReq.school_name} ${lastReq.type} of size ${lastReq.size}. lalala `,
        html: `<strong>There is a request for your ${lastReq.count} piece(s) of ${lastReq.school_name} ${lastReq.type} of size ${lastReq.size}.</strong>`,
      };
      sgMail
        .send(msg)
        .then(() => {
          console.log('Email sent');
        })
        .catch((error) => {
          console.error(error);
        });
      data.message = 'Request Successful and the donor is notified via email';
      response.render('null', { data });
    } catch (err) {
      console.error(err.message); // wont break
    }
  } else {
    data.message = 'Only members can request';
    response.render('null', { data });
  }
});

app.get('/my_requests', async (request, response) => {
  if (request.cookies.loggedIn === 'true') {
    const { userEmail, userID, loggedIn } = request.cookies;
    const sqlQuery = `SELECT school_name, 
                               type,
                               COUNT(inventory.school_id), size, status, DATE(reserved_date)
                        FROM schools
                        INNER JOIN inventory
                        ON schools.school_id = inventory.school_id
                        INNER JOIN uniforms
                        ON uniforms.id=inventory.uniform_id
                        INNER JOIN donation_request
                        ON inventory_id = inventory.id
                        WHERE recipient_id = ${userID}
                        GROUP BY school_name, type, size , status, date`;

    // const donatQuery = `SELECT COUNT(*) FROM inventory WHERE donor_id = ${userID}`;

    const results = await pool.query(sqlQuery);
    const data = results.rows;
    console.log(data);
    response.render('showMyDonations', { data });
  } else {
    const data = {};
    data.message = 'please login to see what you have requested';
    response.render('null', { data });
  }
});

app.get('/test', async (request, response) => {
  const findDonorQuery = `SELECT email, name, COUNT(reserved_date), 
                                 school_name, type, size
                          FROM users 
                          INNER JOIN inventory 
                          ON users.id = donor_id
                          INNER JOIN donation_request
                          ON inventory.id=inventory_id
                          INNER JOIN schools
                          ON schools.school_id = inventory.school_id
                          INNER JOIN uniforms
                          ON uniforms.id = uniform_id
                          WHERE reserved_date::date = now()::date
                          GROUP BY email, name, school_name, type, size
                          `;
  const resultDonor = await pool.query(findDonorQuery);
  const num = resultDonor.rows.length;
  const lastReq = resultDonor.rows[num - 1];
  console.log(lastReq);
  response.send(lastReq);

  // const sgMail = require('@sendgrid/mail')();

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const msg = {
    // to: [{'1reginacheong@gmail.com'},{}], // Change to your recipient
    to: [
      {
        email: '1reginacheong@gmail.com',
      },
      {
        email: `${lastReq.email}`,
      }],
    from: 'regina_cheong@hotmail.com', // Change to your verified sender
    subject: `There is a request for your donated ${lastReq.school_name} uniforms`,
    text: `There is a request for the ${lastReq.count} ${lastReq.school_name} ${lastReq.type} of size ${lastReq.size}. lalala `,
    html: `<strong>There is a request for your ${lastReq.count} piece(s) of ${lastReq.school_name} ${lastReq.type} of size ${lastReq.size}.</strong>`,
  };
  sgMail
    .send(msg)
    .then(() => {
      console.log('Email sent');
    })
    .catch((error) => {
      console.error(error);
    });

    // weather
  const options = {
    method: 'GET',
    url: 'https://aerisweather1.p.rapidapi.com/forecasts/singapore,%20orchard',
    params: {
      from: '2022-04-02', plimit: '30', filter: 'day', to: '2022-05-02',
    },
    headers: {
      'X-RapidAPI-Host': 'aerisweather1.p.rapidapi.com',
      'X-RapidAPI-Key': 'a574bc63e8msh394553ea4434071p1acb83jsn221fa4a5d9cc',
    },
  };

  axios.request(options).then((response) => {
    console.log(response.data);
  }).catch((error) => {
    console.error(error);
  });
});

// set port to listen
app.listen(port);
