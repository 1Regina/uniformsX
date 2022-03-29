import express from "express";
import methodOverride from "method-override";

import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import jsSHA from "jssha";
import path from "path";
import dotenv from "dotenv";
import pool from "./initPool.js";
import { updateMembership } from "./helper_functions.js";

const envFilePath = "uniforms.env";
dotenv.config({ path: path.normalize(envFilePath) });
// initialize salt as a global constant
const theSalt = process.env.MY_ENV_VAR;
console.log(theSalt);

const app = express();
app.use(express.static("public"));
// Configure Express to parse request body data into request.body
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(bodyParser.json());
// Override POST requests with query param ?_method=PUT to be PUT requests
app.use(methodOverride("_method"));
// Set view engine
app.set("view engine", "ejs");
const port = 3004;

// 3 POCE6 User Auth
app.get("/signup", (request, response) => {
  response.render("signup");
});

app.post("/signup", async (request, response) => {
  const { name, email, phone } = request.body;
  console.log(request.body);
  const member = request.body.membership;

  console.log(member);
  // initialise the SHA object
  const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
  const input = request.body.password;
  // add salt to password
  const unhashedString = `${input}-${theSalt}`;

  // input the password with salt from the request to the SHA object
  shaObj.update(unhashedString);
  // get the hashed password as output from the SHA object
  const hashedPassword = shaObj.getHash("HEX");

  const values = [name, email, hashedPassword, phone];
  const rv = await pool.query(
    `INSERT INTO users (name, email, password, phone) VALUES ($1, $2, $3, $4) returning id`,
    values
  );
  // console.log(`ahaeat`, rv)
  const id = rv.rows[0].id;
  // const updRv = await updateMembership(member, id);
  // if (!updRv) return "ok";
  await updateMembership(member, id);
  response.send("sign success");
});

app.get("/login", (request, response) => {
  response.render("loginForm");
});

app.post("/login", (request, response) => {
  // retrieve the user entry using their email
  const values = [request.body.email];
  pool.query("SELECT * from users WHERE email=$1", values, (error, result) => {
    // return if there is a query error
    if (error) {
      console.log("Error executing query", error.stack);
      response.status(503).send(result.rows);
      return;
    }

    // we didnt find a user with that email
    if (result.rows.length === 0) {
      // the error for incorrect email and incorrect password are the same for security reasons.
      // This is to prevent detection of whether a user has an account for a given service.
      response.status(403).send("login failed!");
      return;
    }

    // get user record from results
    const user = result.rows[0];
    // initialise SHA object
    const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
    const input = request.body.password;
    // add salt to password
    const unhashedString = `${input}-${theSalt}`;

    // input the password from the request to the SHA object
    shaObj.update(unhashedString);
    // get the hashed value as output from the SHA object
    const hashedPassword = shaObj.getHash("HEX");

    // If the user's hashed password in the database does not match the hashed input password, login fails
    if (user.password !== hashedPassword) {
      // the error for incorrect email and incorrect password are the same for security reasons.
      // This is to prevent detection of whether a user has an account for a given service.
      response.status(403).send("login failed! Password is incorrect");
      return;
    }

    // The user's password hash matches that in the DB and we authenticate the user.
    const d = new Date();
    d.setTime(d.getTime() + 1 * 24 * 60 * 60 * 1000);
    let expires = d.toUTCString();
    response.setHeader("Set-Cookie", [
      `userEmail=${user.email}; expires=${expires}; path=/`,
    ]);
    response.cookie("loggedIn", true);
    response.redirect(`/`);
  });
});

// LOG OUT clear cookie
app.get("/logout", (request, response) => {
  response.clearCookie("userEmail");
  response.clearCookie("loggedIn");
  response.redirect(`/`);
});

// set port to listen
app.listen(port);
