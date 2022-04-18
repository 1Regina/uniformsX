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
} from './sorts.js';
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

// app.get('/:school/uniform0', (request, response) => {
//   const theSchool = request.params.school;
//   console.log(theSchool);
//   const sqlQuery = `SELECT school_name, school_code,
//                            uniforms.id AS uniforms_id, type,
//                            donor_id, inventory.school_id, uniform_id, size, COUNT(status)
//                     FROM schools
//                     INNER JOIN inventory
//                     ON schools.school_id = inventory.school_id
//                     INNER JOIN uniforms
//                     ON uniforms.id = inventory.uniform_id
//                     WHERE STATUS = 'available' AND school_name='${theSchool}'
//                     GROUP BY school_name, school_code,
//                            uniforms_id, type,
//                            donor_id, inventory.school_id, uniform_id, size
//                     ORDER BY type, size`;
//   pool
//     .query(sqlQuery)
//     .then((summaryCount) => {
//       const data = summaryCount.rows;
//       if (data.length === 0) {
//         data.message = `There are no available stock for ${theSchool}`;
//         response.render('null', { data });
//       } else {
//         console.log(data);
//         response.render('showInventory', { data });
//       }
//     })
//     .catch((err) => {
//       console.error(err.message); // wont break
//     });
// });

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
        console.log(data);
        response.render('showInventoryMember', { data });
      } else {
        response.render('showInventory', { data });
      }
    })
    .catch((err) => {
      console.error(err.message); // wont break
    });
});

app.post('/request', async (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  const { requestInfo } = request.body;
  const data = {};

  console.log(typeof requestInfo);

  if (typeof requestInfo === 'string') {
    const info = requestInfo.split(', ');
    const donorID = info[0];
    const schoolID = info[1];
    const uniformID = info[2];
    const size = String(info[3]).replace(/ /g, '_').toUpperCase();
    const quantity = info[4];

    // eslint-disable-next-line max-len
    const doUpdateAndInsert = await updateAndInsert(donorID, schoolID, uniformID, size, userID, quantity);

    response.redirect('/my_requests');
    // find and alert Donor
    const lastReq = await findDonorDetails();
    sendAnEmail(lastReq.email, lastReq.school_name, lastReq.count, lastReq.size, lastReq.type);
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
      console.log(info);

      // eslint-disable-next-line max-len
      const doUpdateAndInsert = await updateAndInsert(donorID, schoolID, uniformID, size, userID, quantity);
      console.log(doUpdateAndInsert);
      const lastReq = await findDonorDetails();
      sendAnEmail(lastReq.email, lastReq.school_name, lastReq.count, lastReq.size, lastReq.type);
    } response.redirect('/my_requests');
  } else {
    data.isLogin = false;
    console.log('asda');
    response.render('loginForm', { data });
  }
});

app.get('/donate', (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  const data = {};
  // let schoolList
  let schools;
  if (loggedIn === 'true') {
    const schoolQuery = 'SELECT * FROM schools';
    pool
      .query(schoolQuery)
      .then((schoolResult) => {
        data.schools = schoolResult.rows;
        // console.log(schools);
        // schoolList = getSchoolsList(schools);
        // console.log(schoolList);
      })
      .then(() => {
        const uniformQuery = 'SELECT * FROM uniforms';
        pool.query(uniformQuery).then((uniformResult) => {
          // console.log(uniformResult.rows);
          data.uniforms = uniformResult.rows;

          response.render('donate', { data });
        });
      })
      .catch((err) => {
        console.error(err.message);
      });
  } else {
    // response.send('You need to login in');
    data.message = 'You need to be a member to donate uniforms. Please go to SignUp to be a member or Login';
    response.render('null', { data });
  }
});

app.post('/donate', async (request, response) => {
  // if (request.cookies.loggedIn === 'true') {
  const { userEmail, userID, loggedIn } = request.cookies;
  const { school, type, quantity } = request.body;
  const sizing = request.body.size;
  const size = String(sizing).replace(/ /g, '_').toUpperCase();
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
    response.redirect('/my_donations');
  } catch (err) {
    console.error(err.message); // wont break
  }
  // } else {
  //   // response.send('Only members can donate');

  // }
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
    console.log(data);
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
    try { await Promise.all(sqls); }
    catch (err) {
      console.error(err.message);
    }
  } else {
    console.log('nothing yet');
  }
  response.redirect('/my_donations');
});

app.post('/reserved_collected', async (request, response) => {
  console.log('inside now');

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

// app.get('/request0', async (request, response) => {
//   const { userEmail, userID, loggedIn } = request.cookies;
//   const data = {};

//   if (loggedIn === 'true') {
//     try {
//       const schoolQuery = 'SELECT * FROM schools';
//       const schoolResult = await pool.query(schoolQuery);
//       data.schools = schoolResult.rows;
//       const uniformQuery = 'SELECT * FROM uniforms';
//       const uniformResult = await pool.query(uniformQuery);
//       data.uniforms = uniformResult.rows;
//       response.render('request', { data });
//     } catch (err) {
//       console.error(err.message);
//       response.send('Cannot connect');
//     }
//   } else {
//     // response.send('You need to login in');

//     data.message = 'You need to be a member to request uniforms. Please go to SignUp to be a member or Login';
//     response.render('null', { data });
//     // data.isLogin = false;
//     // response.render('loginForm', { data });
//   }
// });

// app.post('/request', async (request, response) => {
//   const data = {};
//   // if (request.cookies.loggedIn === 'true') {
//   const { userEmail, userID, loggedIn } = request.cookies;
//   const { school, type, quantity } = request.body;
//   const sizing = request.body.size;
//   const size = String(sizing).replace(/ /g, '_').toUpperCase();

//   try {
//     const findReqQtyQuery = `SELECT COUNT (inventory_id)
//                                FROM donation_request
//                                WHERE recipient_id = ${userID} `;
//     const findRecipTot = await pool.query(findReqQtyQuery);
//     const recipientTotal = findRecipTot.rows[0].count;
//     // if ((recipientTotal + quantity) >= 20) {
//     //   // alert('you have exceeded 20 pieces of inventory items. Please find a donor with less quantity to request to stay within your quota for the year');
//     //   data.message = 'you have exceeded 20 pieces of inventory items. Please find a donor with less quantity to request to stay within your quota for the year';
//     //   response.render('null', { data });
//     // }
//     const infoQuery = `SELECT school_id FROM schools WHERE school_name = '${school}'`;
//     const schoolid = await pool.query(infoQuery);
//     const schoolID = schoolid.rows[0].school_id;
//     const findUniId = `SELECT id FROM uniforms WHERE type = '${type}'`;
//     const uniID = await pool.query(findUniId);
//     const uID = uniID.rows[0].id;
//     const findPotentialsQuery = `SELECT donor_id, COUNT(status)
//                                    FROM inventory WHERE status = 'available'
//                                    AND school_id = ${schoolID}
//                                    AND uniform_id = ${uID}
//                                    AND size = '${size}'
//                                    GROUP BY donor_id
//                                    HAVING COUNT(status) = ${quantity}
//                                    ORDER BY donor_id`;
//     const findDonor = await pool.query(findPotentialsQuery);

//     if (findDonor.rows.length === 0) {
//       data.message = 'Check the inventory page for stocks. You might need to adjust your inventory to match those available by donors';
//       // todo: check why alert is not working
//       // alert('you need to adjust your qty');
//       response.render('null', { data });
//     }
//     const donorFound = findDonor.rows[0].donor_id;
//     console.log(donorFound);

//     const sqls = [];
//     const requestIds = [];
//     for (let i = 0; i < quantity; i += 1) {
//       const updateQuery = `UPDATE inventory SET status = 'reserved'
//                              WHERE donor_id = ${donorFound}
//                              AND school_id = ${schoolID}
//                              AND uniform_id = ${uID}
//                              AND size = '${size}' RETURNING id`;
//       sqls.push(pool.query(updateQuery));
//     }

//     const rvs = await Promise.all(sqls);

//     // rvs.forEach((rv, idx) => {
//     //   console.log(`Result: ${idx}`, rv.rows);
//     // });
//     const insertSQLs = [];
//     const idObjArray = rvs[0].rows;
//     console.log('what is this idObjArray', idObjArray);
//     for (let j = 0; j < idObjArray.length; j += 1) {
//       const ind = idObjArray[j].id;
//       requestIds.push(ind);
//       const requestTBQuery = `INSERT INTO donation_request (recipient_id, inventory_id) VALUES (${userID}, ${ind})`;
//       insertSQLs.push(pool.query(requestTBQuery));
//     }
//     console.log(insertSQLs);
//     await Promise.all(insertSQLs);
//     // find and alert donor
//     const findDonorQuery = `SELECT email, name, COUNT(reserved_date),
//                                  school_name, type, size
//                           FROM users
//                           INNER JOIN inventory
//                           ON users.id = donor_id
//                           INNER JOIN donation_request
//                           ON inventory.id=inventory_id
//                           INNER JOIN schools
//                           ON schools.school_id = inventory.school_id
//                           INNER JOIN uniforms
//                           ON uniforms.id = uniform_id
//                           WHERE reserved_date::date = now()::date
//                           GROUP BY email, name, school_name, type, size`;
//     const resultDonor = await pool.query(findDonorQuery);
//     const num = resultDonor.rows.length;
//     const lastReq = resultDonor.rows[num - 1];
//     console.log(lastReq);

//     response.redirect('/my_requests');

//     // const sgMail = require('@sendgrid/mail')();

//     sgMail.setApiKey(process.env.SENDGRID_API_KEY);
//     const msg = {
//       // to: [{'1reginacheong@gmail.com'},{}], // Change to your recipient
//       to: [
//         {
//           email: '1reginacheong@gmail.com',
//         },
//         {
//           email: `${lastReq.email}`,
//         },
//       ],
//       from: 'regina_cheong@hotmail.com', // Change to your verified sender
//       subject: `There is a request for your donated ${lastReq.school_name} uniforms`,
//       text: `There is a request for the ${lastReq.count} ${lastReq.school_name} ${lastReq.type} of size ${lastReq.size}. lalala `,
//       html: `<strong>There is a request for your ${lastReq.count} piece(s) of ${lastReq.school_name} ${lastReq.type} of size ${lastReq.size}.</strong>`,
//     };
//     sgMail
//       .send(msg)
//       .then(() => {
//         console.log('Email sent');
//       })
//       .catch((error) => {
//         console.error(error);
//       });
//     data.message = 'Request Successful and the donor is notified via email';
//     response.render('null', { data });
//   } catch (err) {
//     console.error(err.message); // wont break
//   }
//   // } else {
//   //   data.message = 'Only members can request';
//   //   response.render('null', { data });
//   // }
// });

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
    console.log(data);
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

app.get('/test', async (request, response) => {
  const { userEmail, userID, loggedIn } = request.cookies;
  const data = {};
  // let schoolList
  let schools;
  if (loggedIn === 'true') {
    const schoolQuery = 'SELECT * FROM schools';
    pool
      .query(schoolQuery)
      .then((schoolResult) => {
        data.schools = schoolResult.rows;
        // console.log(schools);
        // schoolList = getSchoolsList(schools);
        // console.log(schoolList);
      })
      .then(() => {
        const uniformQuery = 'SELECT * FROM uniforms';
        pool.query(uniformQuery).then((uniformResult) => {
          // console.log(uniformResult.rows);
          data.uniforms = uniformResult.rows;

          response.render('donateDynamic', { data });
        });
      })
      .catch((err) => {
        console.error(err.message);
      });
  } else {
    // response.send('You need to login in');
    data.message = 'You need to be a member to donate uniforms. Please go to SignUp to be a member or Login';
    response.render('null', { data });
  }
});
// set port to listen
app.listen(port);
