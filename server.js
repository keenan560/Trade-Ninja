const express = require('express');
const path = require("path");
const views = path.join(__dirname, 'views');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const bcrypt = require("bcrypt");
const hbs = require('express-handlebars');



const mysql = require('mysql');
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1Barbuda',
    database: 'trade_ninja_db'
});

const two_hours = 1000 * 60 * 60 * 2;
const {
    Port = 3000,
    NODE_ENV = 'development',
    SESS_NAME = 'sid',
    SESS_SECRET = 'ninja',
    SESS_LIFETIME = two_hours
} = process.env

connection.connect();

const IN_PROD = NODE_ENV === 'production';
const app = express();

app.use('/', express.static(views));
app.use(bodyParser.json());
app.use(session(
    {
        name: SESS_NAME,
        resave: false,
        secret: SESS_SECRET,
        saveUninitialized: false,
        cookie: {
            maxAge: two_hours,
            sameSite: true,
            secure: IN_PROD
        }
    }
));

const redirectLogin = (req, res, next) => {
    if (!req.session.user) {
        res.redirect('/login');
    } else {
        next();
    }
}

const redirectHome = (req, res, next) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        next();
    }
}

app.use((req, res, next) => {
    const { user } = req.session;
    if (user) {

        res.locals.user = req.session.user;
    }
    next();
})
app.engine('handlebars', hbs());
app.set('view engine', 'handlebars');

const numFormat = num => {

    return '$' + num.toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}

// ***** ROUTES ******
app.get("/", redirectHome, (req, res) => {
    const { user } = req.session;
    console.log(user);
    res.render('login');
})

app.get("/login", redirectHome, (req, res) => {
    res.render('login')

});

app.get("/register", redirectHome, (req, res) => {
    res.render('register');

});

app.get("/dashboard", redirectLogin, (req, res) => {
    const { user } = res.locals;
    // console.log(req.session)
    res.render('dashboard', { firstName: user.first_name });

});

app.get("/about", (req, res) => {
    res.render('about');
});

app.get("/portfolio", redirectLogin, (req, res) => {
    const { user } = res.locals;
    connection.query(`SELECT * FROM holdings WHERE user_name = '${user.user_name}'`, (err, results) => {
        if (err) throw err;
        let holdings = results;


        connection.query(`SELECT * FROM trades WHERE user_name ='${user.user_name}'`, (err, results) => {
            if (err) throw err;
            let portVal = 0;

            results.forEach(order => portVal += order.total);

            res.render('portfolio', { title: "Holdings", userName: user.user_name, holdings: holdings, portVal: numFormat(portVal) });

        })

    })

})

app.get("/cash", redirectLogin, (req, res) => {
    const { user } = res.locals;
    connection.query(`SELECT * FROM CASH WHERE user_name = '${user.user_name}'`, (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            res.render('cash', { title: 'Cash', userName: user.user_name, balance: '$0.00' });
        }

        if (results.length > 0) {
            let bal = 0;
            results.forEach(trans => {
                bal += trans.amount;
            })
            res.render('cash', { title: 'Cash', userName: user.user_name, balance: numFormat(bal) });

        }

    })

});

app.get("/cash/users", redirectLogin, (req, res) => {
    const { user } = res.locals;
    connection.query(`SELECT * FROM CASH WHERE user_name = '${user.user_name}'`, (err, results) => {
        if (err) throw err;
        res.send(results);
    })

});

app.get("/history", redirectLogin, (req, res) => {
    const { user } = res.locals;
    connection.query(`SELECT * FROM trades WHERE user_name = '${user.user_name}'`, (err, results) => {
        if (err) throw err;
        console.log(results);
        let portVal = 0

        results.forEach(order => portVal += order.total);

        res.render('history', { title: 'History', history: results, portVal: numFormat(portVal) });
    })

});

app.get("/trade", redirectLogin, (req, res) => {
    const { user } = res.locals;
    connection.query(`SELECT * FROM CASH WHERE user_name = '${user.user_name}'`, (err, results) => {
        if (err) throw err;
        console.log(results)

        if (results.length === 0) {
            res.render('trade', { title: 'Trade', balance: '$0.00' });
        }


        if (results.length > 0) {
            let currBal = 0;
            results.forEach(trans => currBal += trans.amount);
            console.log(currBal)
            res.render('trade', { title: 'Trade', balance: numFormat(currBal) });
        }

    })

});

app.get("/leaders", redirectLogin, (req, res) => {
    const { user } = res.locals;
    connection.query('SELECT * FROM users', (err, results) => {
        if (err) throw err;
        console.log(results);
        res.render('leaders', { title: "Leaderboard", userName: user.user_name, results: results })
    })

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


app.post("/users", redirectHome, async (req, res) => {

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

        if (results.length === 0) {
            return res.send('Username does not exist');
        }

        if (results.length > 0) {
            try {
                if (await bcrypt.compare(req.body.password, results[0].password)) {
                    req.session.user = results[0];
                    console.log(req.session.user.user_name);
                    res.send("Login Successful!")
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

app.post('/cash', (req, res) => {
    const { user } = res.locals;
    console.log(req.body)
    let stmt = `INSERT INTO cash (user_name, trans_type, amount, account) VALUES (?)`;
    let values = [user.user_name, req.body.transType, req.body.amount, req.body.account];

    connection.query(stmt, [values], (err, results) => {
        if (err) throw err;
        console.log(results);
        connection.query(`SELECT * FROM cash WHERE user_name = '${user.user_name}'`, (err, results) => {
            if (err) throw err;

            if (results.length > 0) {
                let bal = 0;
                results.forEach(trans => {
                    bal += trans.amount;
                })
                res.render('cash', { title: 'Cash', userName: user.user_name, balance: numFormat(bal) });

            }

        })

    })
});

app.post('/trades', redirectLogin, (req, res) => {
    const { user } = res.locals;
    console.log(req.body);
    let stmt = 'INSERT INTO trades (user_name, trans_type, ticker, description, price, quantity, total) VALUES (?)';
    let values = [user.user_name, req.body.transType, req.body.ticker, req.body.desc, req.body.price, req.body.quantity, req.body.total];

    connection.query(stmt, [values], (err, results) => {
        if (err) throw err;
        console.log(results);
        res.sendStatus(200);
    });
});

app.post('/trades/cash', (req, res) => {
    const { user } = res.locals;
    console.log(req.body)
    let stmt = `INSERT INTO cash (user_name, trans_type, amount) VALUES (?)`;
    let values = [user.user_name, req.body.transType, req.body.amount];

    connection.query(stmt, [values], (err, results) => {
        if (err) throw err;
        console.log(results);
        connection.query(`SELECT * FROM cash WHERE user_name = '${user.user_name}'`, (err, results) => {
            if (err) throw err;

            if (results.length > 0) {
                let bal = 0;
                results.forEach(trans => {
                    bal += trans.amount;
                })
                res.render('cash', { title: 'Cash', userName: user.user_name, balance: numFormat(bal) });

            }

        })

    })
});

app.post('/holdings', redirectLogin, (req, res) => {
    const { user } = res.locals;

    connection.query(`SELECT * FROM holdings WHERE user_name ='${user.user_name}' AND ticker = '${req.body.ticker}'`, (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            let stmt = `INSERT INTO holdings(user_name, ticker, description, price_acquired, quantity, total) VALUES(?)`;
            let values = [user.user_name, req.body.ticker, req.body.desc, req.body.price, req.body.quantity, req.body.total];
            connection.query(stmt, [values], (err, results) => {
                if (err) throw err;
                console.log(results);
            });
        } else {
            let stmt = `UPDATE holdings SET quantity = quantity + ${req.body.quantity} WHERE user_name = '${user.user_name}' AND ticker ='${req.body.ticker}'`;
            connection.query(stmt, (err, res) => {
                if (err) throw err;
                console.log(results);
            });
        }
    });


})

app.delete('/sell', redirectLogin, (req, res) => {
    const { user } = res.locals;
    let stmt = `DELETE FROM trades WHERE user_name ='${user.user_name}`
});

app.post('/logout', redirectLogin, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect("/dashboard");
        }

        res.clearCookie(SESS_NAME);
        res.send("Ninja vanish!");
    })
})



app.listen(Port, console.log(`Listening on http://localhost:${Port}`));