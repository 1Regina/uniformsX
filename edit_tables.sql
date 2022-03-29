CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT,
  password TEXT,
  phone VARCHAR(8),
  is_donor BOOLEAN,
  is_recipient BOOLEAN,
  created_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schools (
  school_id SERIAL PRIMARY KEY,
  school_name TEXT,
  school_code TEXT
);

CREATE TABLE IF NOT EXISTS uniforms (
  id SERIAL PRIMARY KEY,
  school_code TEXT ,
  type TEXT,
  size INTEGER
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  donor_id INTEGER REFERENCES users(id),
  uniform_id INTEGER  REFERENCES uniforms(id),
  created_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT -- REFERENCES donation_request (collected) -- [available, reserved, accept, gone]
);

CREATE TABLE IF NOT EXISTS donation_request (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER REFERENCES users(id),
  inventory_id INTEGER REFERENCES inventory(id),
  reserved_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- ,
  -- collected BOOLEAN
);

