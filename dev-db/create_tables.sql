CREATE TABLE accounts (
	user_id serial PRIMARY KEY,
	username VARCHAR ( 50 ) UNIQUE,
	password VARCHAR ( 50 ),
	email VARCHAR ( 255 ) UNIQUE NOT NULL,
	created_on TIMESTAMP
);
