import express from 'express';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import jsSHA from 'jssha';
import path from 'path';
import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';

import {
  pool,
  dynamicAscSort,
  dynamicDescSort,
  sortDonations,
  sortRequests,
} from './helper_sorts.js';
import {
  updateMembership,
  getSchoolsList,
  singleFileUpload,
  updateAndInsert,
  findDonorDetails,
  sendAnEmail,
} from './helper_functions.js';

const envFilePath = 'uniforms.env';
dotenv.config({ path: path.normalize(envFilePath) });
// initialize salt as a global constant
const theSalt = process.env.MY_ENV_VAR;
console.log(theSalt);

const app = express();
app.use(express.static('public'));
// Configure Express to parse request body data into request.body
// app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
// Override POST requests with query param ?_method=PUT to be PUT requests
app.use(methodOverride('_method'));
// folder to hold photos of users
app.use(express.static('uploads'));

// Set view engine
app.set('view engine', 'ejs');
const port = 3004;

app.get('/', (request, response) => {
  response.render('home');
});
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
  // response.send('sign success');

  const data = {};
  data.message = 'You have signed up successfully and can donate or request uniforms';
  const d = new Date();
  d.setTime(d.getTime() + 1 * 24 * 60 * 60 * 1000);
  const expires = d.toUTCString();
  response.setHeader('Set-Cookie', [
    `userEmail=${email}; expires=${expires}; path=/`,
  ]);
  response.cookie('userID', `${id}`);
  response.cookie('loggedIn', true);

  return response.redirect('/my_profile');
  // response.render('null', { data });
});

app.get('/add_photo', (request, response) => {
  response.render('uploadPhoto');
});

// add multer middleware
app.post('/add_photo', singleFileUpload, (request, response) => {
  console.log(request.file);
  const { userEmail, userID, loggedIn } = request.cookies;

  // get the photo column value from request.file
  const photo = request.file.originalname;
  const photoName = `${userEmail}_${photo}`;
  const sqlQuery = `UPDATE users SET photo = '${photoName}' WHERE id = ${userID} RETURNING *`;

  // Query using pg.Pool instead of pg.Client
  pool.query(sqlQuery, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send('Something went wrong');
      return;
    }
    // response.send(result.rows[0]);
    response.redirect('/my_profile');
  });
});

app.get('/login', (request, response) => {
  const data = {};
  data.isLogin = '';
  response.render('loginForm', { data });
});

app.post('/login', (request, response) => {
  // retrieve the user entry using their email
  const values = [request.body.email];
  pool
    .query('SELECT * from users WHERE email=$1', values)
    .then((userResult) => {
      // get user record from results
      const user = userResult.rows[0];
      return user;
    })
    .then((user) => {
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
      return response.redirect('/my_profile');
    });
});

app.get('/faq', (request, response) => {
  response.render('faq');
});

app.get('/my_profile', async (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  const data = {};
  if (loggedIn === 'true') {
    const userInfoQuery = `SELECT * FROM users WHERE id = ${userID}`;
    const myInfo = await pool.query(userInfoQuery);
    const data = myInfo.rows[0];
    data.message = 'My Profile';
    response.render('profile', { data });
  } else {
    data.isLogin = false;
    response.render('loginForm', { data });
  }
});

app.get('/edit_profile', (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  let data = {};
  const getUserQuery = `SELECT * FROM users WHERE id = ${userID}`;
  pool.query(getUserQuery).then((userInfo) => {
    data = userInfo.rows[0];
    data.message = `Hi ${data.name}, You can edit your profile info`;
    console.log(data);
    response.render('editUser', { data });
  });
});

app.put('/edit_profile', async (request, response) => {
  const { name, phone, photo } = request.body;
  const { userEmail, userID, loggedIn } = request.cookies;
  const updateQuery = `UPDATE users 
                        SET name = '${name}', phone = '${phone}'
                        WHERE id = ${userID} RETURNING *`;
  await pool.query(updateQuery);
  response.redirect('/my_profile');
});

// LOG OUT clear cookie
app.get('/logout', (request, response) => {
  response.clearCookie('userID');
  response.clearCookie('userEmail');
  response.clearCookie('loggedIn');
  response.redirect('/');
});
// school_id, school_name, schools.school_code,
app.get('/primary_school', (request, response) => {
  const allSchoolQuery = "SELECT * FROM schools WHERE school_code LIKE 'P_%'";
  pool.query(allSchoolQuery).then((allSchools) => {
    const data = allSchools.rows;
    // console.log(data);
    response.render('allSchools', { data });
  });
});

app.post('/find_school', async (request, response) => {
  const { schoolProxy } = request.body;
  console.log('aaa', schoolProxy);
  // const school = schoolProxy[0].toUpperCase() + schoolProxy.slice(1);
  const splitStr = schoolProxy.toLowerCase().split(' ');
  for (let i = 0; i < splitStr.length; i += 1) {
    splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);
  }
  const school = splitStr.join(' ');
  const possibilityQuery = `SELECT * FROM schools WHERE school_name LIKE '%${school}%'`;
  const possiblitlies = await pool.query(possibilityQuery);
  const data = possiblitlies.rows;
  if (data.length === 0) {
    data.message = 'There is no school matching your search. Please try another school';
    // response.render('allSchools_filtered', { data });
  }
  data.message = `There is/are ${data.length} school(s) that match(es) your search.`;
  response.render('allSchools', { data });
});

app.get('/secondary_school', (request, response) => {
  const allSchoolQuery = "SELECT * FROM schools WHERE school_code LIKE 'S_%'";
  pool.query(allSchoolQuery).then((allSchools) => {
    const data = allSchools.rows;
    console.log(data);
    response.render('allSchools', { data });
  });
});

app.get('/:school/uniform', async (request, response) => {
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
  pool
    .query(sqlQuery)
    .then((summaryCount) => {
      const data = summaryCount.rows;
      if (data.length === 0) {
        data.message = `There are no available stock for ${theSchool}`;
        response.render('null', { data });
      } else if (request.cookies.loggedIn === 'true') {
        // console.log(data);
        response.render('showInventoryMember', { data });
      } else {
        response.render('showInventory', { data });
      }
    })
    .catch((err) => {
      console.error(err.message); // wont break
    });
});

// with quota
// app.post('/request', async (request, response) => {
//   const { userEmail, userID, loggedIn } = request.cookies;
//   const { requestInfo } = request.body;
//   const data = {};

//   console.log(typeof requestInfo);
//   try {
//     const accumQuery = `SELECT COUNT(inventory_id) FROM donation_request WHERE recipient_id = ${userID}`;
//     const accum = await pool.query(accumQuery);
//     const accumCurrent = accum.rows[0].count;

//     if (typeof requestInfo === 'string') {
//       const info = requestInfo.split(', ');
//       const donorID = info[0];
//       const schoolID = info[1];
//       const uniformID = info[2];
//       const size = String(info[3]).trim().replace(/ /g, '_').toUpperCase();
//       const quantity = info[4];

//       // eslint-disable-next-line max-len
//       await updateAndInsert(
//         donorID,
//         schoolID,
//         uniformID,
//         size,
//         userID,
//         quantity,
//       );

//       response.redirect('/my_requests');
//       // find and alert Donor
//       const lastReq = await findDonorDetails();
//       sendAnEmail(
//         lastReq.email,
//         lastReq.school_name,
//         lastReq.count,
//         lastReq.size,
//         lastReq.type,
//       );
//     // response.render('null', { data });
//     // } else {
//     //   data.message = 'Only members can request';
//     //   response.render('null', { data });
//     } else if (typeof requestInfo === 'object') {
//       for (let i = 0; i < requestInfo.length; i += 1) {
//         const info = requestInfo[i].split(', ');
//         const donorID = info[0];
//         const schoolID = info[1];
//         const uniformID = info[2];
//         const size = info[3];
//         const quantity = info[4];
//         console.log(info);

//         // eslint-disable-next-line max-len
//         const doUpdateAndInsert = await updateAndInsert(
//           donorID,
//           schoolID,
//           uniformID,
//           size,
//           userID,
//           quantity,
//         );
//         console.log(doUpdateAndInsert);
//         const lastReq = await findDonorDetails();
//         sendAnEmail(
//           lastReq.email,
//           lastReq.school_name,
//           lastReq.count,
//           lastReq.size,
//           lastReq.type,
//         );
//       }
//       response.redirect('/my_requests');
//     } else {
//       data.isLogin = false;

//       response.render('loginForm', { data });
//     }
//   } catch (err) {
//     console.error(err.message); // wont break
//   }
// });

app.post('/request', async (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  const { requestInfo } = request.body;
  const data = {};

  console.log(typeof requestInfo);

  if (typeof requestInfo === 'string') {
    console.log('String', requestInfo);
    const info = requestInfo.split(', ');
    const donorID = info[0];
    const schoolID = info[1];
    const uniformID = info[2];
    const size = String(info[3]).trim().replace(/ /g, '_').toUpperCase();
    const quantity = info[4];

    // eslint-disable-next-line max-len
    const doUpdateAndInsert = await updateAndInsert(
      donorID,
      schoolID,
      uniformID,
      size,
      userID,
      quantity,
    );

    // find and alert Donor
    const lastReq = await findDonorDetails(
      donorID,
      schoolID,
      uniformID,
      size,
    );

    await sendAnEmail(
      lastReq.email,
      lastReq.school_name,
      // lastReq.count,
      quantity,
      lastReq.size,
      lastReq.type,
    );
    response.redirect('/my_requests');
    // response.render('null', { data });
    // } else {
    //   data.message = 'Only members can request';
    //   response.render('null', { data });
  } else if (typeof requestInfo === 'object') {
    for (let i = 0; i < requestInfo.length; i += 1) {
      const info = requestInfo[i].split(', ');
      const donorID = info[0];
      const schoolID = info[1];
      const uniformID = info[2];
      const size = info[3];
      const quantity = info[4];
      console.log('OBJECT', info);

      // eslint-disable-next-line max-len
      const doUpdateAndInsert = await updateAndInsert(
        donorID,
        schoolID,
        uniformID,
        size,
        userID,
        quantity,
      );
      console.log(doUpdateAndInsert);
      const lastReq = await findDonorDetails(
        donorID,
        schoolID,
        uniformID,
        size,
        userID,
        quantity,
      );
      sendAnEmail(
        lastReq.email,
        lastReq.school_name,
        quantity,
        // lastReq.count,
        lastReq.size,
        lastReq.type,
      );
    }
    response.redirect('/my_requests');
  } else {
    data.isLogin = false;
    console.log('asda');
    response.render('loginForm', { data });
  }
});

app.get('/donate', async (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  const data = {};

  if (loggedIn === 'true') {
    const schoolQuery = 'SELECT * FROM schools';
    pool
      .query(schoolQuery)
      .then((schoolResult) => {
        data.schools = schoolResult.rows;
      })
      .then(() => {
        const uniformQuery = 'SELECT * FROM uniforms';
        pool.query(uniformQuery).then((uniformResult) => {
          data.uniforms = uniformResult.rows;
          response.render('donateDynamic', { data });
        });
      })
      .catch((err) => {
        console.error(err.message);
      });
  } else {
    data.isLogin = false;
    response.render('loginForm', { data });
    // data.message = 'You need to be a member to donate uniforms. Please go to SignUp to be a member or Login';
    // response.render('null', { data });
  }
});

app.post('/donate', async (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  const results = request.body;
  console.log(results);
  const sqls = [];
  try {
    if (results.uniformID.length === 1) {
      results.reSize = results.size.trim().replace(/ /g, '_').toUpperCase();
      for (let i = 0; i < results.quantity; i += 1) {
        const insertQuery = `INSERT INTO inventory (donor_id, school_id, uniform_id, size) VALUES (${userID}, ${results.schoolID}, ${results.uniformID},'${results.reSize}')`;
        sqls.push(pool.query(insertQuery));
      }
      await Promise.all(sqls);
    } else {
      results.reSize = results.size.map((x) => x.trim().replace(/ /g, '_').toUpperCase());

      for (let i = 0; i < results.schoolID.length; i += 1) {
        for (let j = 0; j < results.quantity[i]; j += 1) {
          const insertQuery = `INSERT INTO inventory (donor_id, school_id, uniform_id, size) VALUES (${userID}, ${results.schoolID[i]}, ${results.uniformID[i]},'${results.reSize[i]}')`;
          console.log(insertQuery);
          sqls.push(pool.query(insertQuery));
        }
      }
      await Promise.all(sqls);
    }
    response.redirect('/my_donations');
  } catch (err) {
    console.error(err.message); // wont break
  }
});

app.get('/my_donations', async (request, response) => {
  if (request.cookies.loggedIn === 'true') {
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
    const results = await pool.query(donatQuery);
    const data = results.rows;
    data.email = userEmail;
    // console.log(data);
    response.render('showMyDonations', { data });
  } else {
    const data = {};
    // data.message = 'Please sign in to see what you have donated';
    // response.render('null', { data });
    data.isLogin = false;
    response.render('loginForm', { data });
  }
});

app.get('/my_donations-sortby/:parameter/:sortHow', sortDonations);

// overcome get with post to display items details to edit
app.post('/my_donations_available/:setId/edit', async (request, response) => {
  const {
    schoolName, type, size, status, quantity, date,
  } = request.body;
  const { userEmail, userID, loggedIn } = request.cookies;
  const { setId } = request.params;
  const data = {};
  data.itemsSchool = schoolName;
  data.uniformType = type;
  const formatDate = date.toString().substring(4, 15);
  try {
    const findSchoolIdQuery = `SELECT school_id 
                              FROM schools 
                              WHERE school_name LIKE '${schoolName}%' `;
    const aSchool = await pool.query(findSchoolIdQuery);
    const theSchool = aSchool.rows[0];

    const findUnifIdQuery = `SELECT id 
                              FROM uniforms
                              WHERE type = '${type}' `;
    const aUniform = await pool.query(findUnifIdQuery);
    const theUniform = aUniform.rows[0];

    const findItemQuery = `SELECT id, donor_id, school_id, uniform_id, size, DATE(created_on), status FROM inventory 
                           WHERE donor_id = ${userID}
                           AND school_id = ${theSchool.school_id}      
                           AND uniform_id = ${theUniform.id}
                           AND size = '${size}'
                           AND status = '${status}'`;
    //  AND date LIKE '${formatDate}%'`;

    const findItems = await pool.query(findItemQuery);
    const itemsFound = findItems.rows;
    data.item = itemsFound;
    const schoolQuery = 'SELECT * FROM schools';
    const schoolResult = await pool.query(schoolQuery);
    data.schools = schoolResult.rows;
    const uniformQuery = 'SELECT * FROM uniforms';
    const uniformResult = await pool.query(uniformQuery);
    data.uniforms = uniformResult.rows;
    // console.log(data);
    response.render('editItem', { data });

    // response.send(data);
  } catch (err) {
    console.error(err.message);
    response.send('Cannot connect');
  }
});

app.post('/my_donations_available/post_changes', async (request, response) => {
  const {
    inventoryId, school_id, uniform_id, size, op,
  } = request.body;
  // console.log('aaaaa', request.body.length);
  console.log(op, inventoryId, school_id, uniform_id, size);
  const sqls = [];
  if (op === 'Delete') {
    console.log('delete');
    for (let i = 0; i < uniform_id.length; i += 1) {
      const deleteQuery = `DELETE FROM inventory
                         WHERE id = ${inventoryId[i]}`;

      sqls.push(pool.query(deleteQuery));
    }
    await Promise.all(sqls);
    // response.redirect('/my_donations');
  } else if (op === 'Update') {
    console.log('uppdate');

    console.log(request.body);

    if (uniform_id.length === 1) {
      const sizeMod = String(size).replace(/ /g, '_').toUpperCase();
      const updateInventoryQuery = `UPDATE inventory
                                      SET school_id = ${school_id},
                                          uniform_id = ${uniform_id},
                                          size = '${sizeMod}'
                                      WHERE id = ${inventoryId}`;
      pool.query(updateInventoryQuery);
    } else if (uniform_id.length > 1) {
      for (let i = 0; i < uniform_id.length; i += 1) {
        const sizeMod = String(size[i]).replace(/ /g, '_').toUpperCase();
        // console.log('aaaa', sizeMod);
        const updateInventoryQuery = `UPDATE inventory
                                      SET school_id = ${school_id[i]},
                                          uniform_id = ${uniform_id[i]},
                                          size = '${sizeMod}'
                                      WHERE id = ${inventoryId[i]}`;
        console.log(updateInventoryQuery);
        sqls.push(pool.query(updateInventoryQuery));
      }
    }
    try {
      await Promise.all(sqls);
    } catch (err) {
      console.error(err.message);
    }
  } else {
    console.log('nothing yet');
  }
  response.redirect('/my_donations');
});

app.post('/reserved_collected', async (request, response) => {
  const {
    schoolName, type, size, status, quantity, date,
  } = request.body;
  console.log(schoolName, type, size, status, quantity, date);
  const { userEmail, userID, loggedIn } = request.cookies;
  const formatDate = date.toString().substring(4, 15);
  try {
    const findSchoolIdQuery = `SELECT school_id 
                              FROM schools 
                              WHERE school_name = '${schoolName}' `;
    const aSchool = await pool.query(findSchoolIdQuery);
    const theSchool = aSchool.rows[0];
    console.log(`school, ${theSchool}`);

    const findUnifIdQuery = `SELECT id 
                              FROM uniforms
                              WHERE type = '${type}' `;
    const aUniform = await pool.query(findUnifIdQuery);
    const theUniform = aUniform.rows[0];
    console.log(`theUniform, ${theUniform}`);
    const updateItemQuery = `UPDATE inventory 
                           SET status = 'collected' 
                           WHERE donor_id = ${userID}
                           AND school_id = ${theSchool.school_id}      
                           AND uniform_id = ${theUniform.id}
                           AND size = '${size}'`;
    //  AND date LIKE '${formatDate}%'`;

    await pool.query(updateItemQuery);
    response.redirect('/my_donations');
  } catch (err) {
    console.error(err.message);
    response.send('Cannot connect');
  }
});

app.get('/my_requests', async (request, response) => {
  if (request.cookies.loggedIn === 'true') {
    const { userEmail, userID, loggedIn } = request.cookies;
    const sqlQuery = `SELECT school_name, 
                               type,
                               COUNT(inventory.school_id), size, status, DATE(reserved_date), donor_id
                        FROM schools
                        INNER JOIN inventory
                        ON schools.school_id = inventory.school_id
                        INNER JOIN uniforms
                        ON uniforms.id=inventory.uniform_id
                        INNER JOIN donation_request
                        ON inventory_id = inventory.id
                        WHERE recipient_id = ${userID}
                        GROUP BY school_name, type, size , status, date, donor_id`;

    // const donatQuery = `SELECT COUNT(*) FROM inventory WHERE donor_id = ${userID}`;

    const results = await pool.query(sqlQuery);
    const data = results.rows;
    data.recipient = userID;
    // console.log(data);
    response.render('showMyRequests', { data });
  } else {
    const data = {};
    // data.message = 'please login to see what you have requested';
    // response.render('null', { data });
    data.isLogin = false;
    response.render('loginForm', { data });
  }
});

app.get('/my_requests-sortby/:parameter/:sortHow', sortRequests);

app.post('/test', async (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  const { requestInfo } = request.body;
  const data = {};

  console.log(typeof requestInfo);
  try {
    const accumQuery = `SELECT COUNT(inventory_id) FROM donation_request WHERE recipient_id = ${userID}`;
    const accum = await pool.query(accumQuery);
    const accumCurrent = accum.rows[0].count;
    console.log('existing', accumCurrent);

    if (typeof requestInfo === 'string') {
      const info = requestInfo.split(', ');
      const donorID = info[0];
      const schoolID = info[1];
      const uniformID = info[2];
      const size = String(info[3]).trim().replace(/ /g, '_').toUpperCase();
      const quantity = info[4];

      if ((accumCurrent + quantity) >= 20) {
        data.isOver = true;
        data.accumCurrent = accumCurrent;
        response.redirect('/my_requests');
      } else {
      // eslint-disable-next-line max-len
        await updateAndInsert(
          donorID,
          schoolID,
          uniformID,
          size,
          userID,
          quantity,
        );

        response.redirect('/my_requests');
        // find and alert Donor
        const lastReq = await findDonorDetails();
        sendAnEmail(
          lastReq.email,
          lastReq.school_name,
          lastReq.count,
          lastReq.size,
          lastReq.type,
        ); }
    // response.render('null', { data });
    // } else {
    //   data.message = 'Only members can request';
    //   response.render('null', { data });
    } else if (typeof requestInfo === 'object') {
      let totalNew = 0;
      for (let i = 0; i < requestInfo.length; i += 1) {
        const info = requestInfo[i].split(', ');
        const donorID = info[0];
        const schoolID = info[1];
        const uniformID = info[2];
        const size = info[3];
        const quantity = info[4];
        console.log(info);
        totalNew += quantity;
      }
      if (accumCurrent + totalNew >= 20) {
        data.isOver = true;
        data.accumCurrent = accumCurrent;
        response.redirect('/my_requests');
      } else {
        // eslint-disable-next-line max-len
        const doUpdateAndInsert = await updateAndInsert(
          donorID,
          schoolID,
          uniformID,
          size,
          userID,
          quantity,
        );
        console.log(doUpdateAndInsert);
        const lastReq = await findDonorDetails();
        sendAnEmail(
          lastReq.email,
          lastReq.school_name,
          lastReq.count,
          lastReq.size,
          lastReq.type,
        );
        response.redirect('/my_requests');
      }
    } else {
      data.isLogin = false;

      response.render('loginForm', { data });
    }
  } catch (err) {
    console.error(err.message); // wont break
  }
});

// set port to listen
app.listen(port);
