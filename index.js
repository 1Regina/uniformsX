import express from "express";
import methodOverride from "method-override";
import pg from "pg";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import jsSHA from "jssha";
import path from "path";
import dotenv from "dotenv";

const envFilePath = "uniform.env";
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


// Initialise DB connection
const { Pool } = pg;
const pgConnectionConfigs = {
  user: "regina",
  host: "localhost",
  database: "uniforms",
  port: 5432, // Postgres server always runs on this port by default
};
const pool = new Pool(pgConnectionConfigs);







// set port to listen
app.listen(port);
