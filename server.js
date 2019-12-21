const express = require('express');
const Port = process.env.port || 3000;
const path = require("path");
const public = path.join(__dirname, 'public');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const bcrypt = require("bcrypt");


const mysql = require('mysql');
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1Barbuda',
    database: 'trade_ninja_db'
});

connection.connect();

const app = express();

app.use('/', express.static(public));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({ secret: 'Ninja secret!' }));


app.get("/", (req, res) => {

    res.sendFile(path.join(public, 'login.html'));
})

app.get("/login", (req, res) => {
    res.sendFile(path.join(public, 'login.html'));
});

app.get("/register", (req, res) => {
    res.sendFile(path.join(public, 'register.html'));
});

app.post("/users/email", (req, res) => {
    let email = req.body.email;
    console.log(req.body.email)
    let stmt = `SELECT * FROM users WHERE email_address = '${email}'`;
    connection.query(stmt, (err, results) => {
        if (err) throw err;
        console.log(results)
        if (results.length === 0) {
            res.send("Okay to use.")
        } else {
            res.send("Cannot use this email.")
        }
    })
});

app.post("/users/username", (req, res) => {
    let userName = req.body.username;
    let stmt = `SELECT * FROM users WHERE user_name = '${userName}'`;
    connection.query(stmt, (err, results) => {
        if (err) throw err;

        if (results.length !== 0) {
            res.send("Username exists!");
        } else {
            res.send("Okay to use!");
        }
    })
});


app.post("/users", async (req, res) => {

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);
        let stmt = `INSERT INTO users (first_name, last_name, email_address, user_name, password) VALUES (?)`
        let values = [req.body.firstName, req.body.lastName, req.body.emailAddress, req.body.userName, hashedPassword]
        connection.query(stmt, [values], (err, results) => {
            if (err) {
                return console.error(err.message);
            }

            res.send("Ninja add successful!");


        });
    } catch {
        res.send("Ninja add fail!");
    }


});

app.post("/auth", async (req, res) => {

    connection.query(`SELECT * FROM users WHERE user_name = '${req.body.username}'`, async (err, results) => {
        if (err) throw err;

        console.log(results);

        if (results.length === 0) {
            return res.send('Username does not exist');
        } 

        if (results.length > 0) {
            try {
                if (await bcrypt.compare(req.body.password, results[0].password)) {
                    
                    res.send("Login successful!");
                } else {

                    res.send("Invalid credentials!");
                }
            }
            catch {
                res.sendStatus(500);
            }
        }


    });




})




app.listen(Port, console.log(`Listening on http://localhost:${Port}`));