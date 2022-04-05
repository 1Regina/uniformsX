import pg from 'pg';
// Initialise DB connection
const { Pool } = pg;
const pgConnectionConfigs = {
  user: 'regina',
  host: 'localhost',
  database: 'uniforms',
  port: 5432, // Postgres server always runs on this port by default
};
const pool = new Pool(pgConnectionConfigs);

const whenQueryDone = (error, result) => {
  // this error is anything that goes wrong with the query
  if (error) {
    console.log('Error executing query', error.stack);
  } else if (result.rows.length === 0) {
    console.log('empty results!');
  }
};

const updateMembership = async (input, id) => {
  let updateQuery;
  if (input === 'Donor') {
    updateQuery = `UPDATE users SET is_donor = 't' WHERE id = '${id}'`;
  } else if (input === 'Recipient') {
    updateQuery = `UPDATE users SET is_recipient = 't' WHERE id = '${id}'`;
  } else {
    updateQuery = `UPDATE users SET is_donor = 't', is_recipient = 't' WHERE id = '${id}'`;
  }
  try {
    await pool.query(updateQuery);
    return null;
  } catch (e) {
    return e.toString();
  }
};

const getSchoolsList = (queryArray) => {
  const schoolsArray = [];
  queryArray.forEach((element) => {
    schoolsArray.push(element.school_name);
  });
  return schoolsArray;
};
export { whenQueryDone, updateMembership, getSchoolsList };