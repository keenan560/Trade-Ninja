const express = require('express');
const path = require("path");
const views = path.join(__dirname, 'views');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const bcrypt = require("bcrypt");
const hbs = require('express-handlebars');
const moment = require('moment');
const axios = require('axios').default;
const nodemailer = require('nodemailer');
require('dotenv').config();


const two_hours = 1000 * 60 * 60 * 2;
const {
    PORT,
    DB_USER,
    DB_PASSWORD,
    DB,
    HOST,
    NODE_ENV,
    SESS_NAME,
    SESS_SECRET,
    SESS_LIFETIME = two_hours,
    API_KEY,
    EMAIL_ACCOUNT,
    EMAIL_PASSWORD
} = process.env

const mysql = require('mysql');
const connection = mysql.createConnection({
    host: HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB,
    dateStrings: true
});



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
    function formatNumber(num) {
        return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
    }
function currencyFormat(num) {
    return '$' + num.toString().toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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

// Emails
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_ACCOUNT,
        pass: EMAIL_PASSWORD
    }
});



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

app.get("/contact", (req, res) => {
    res.render('contact');
});

app.get("/dashboard", redirectLogin, (req, res) => {
    const { user } = res.locals;
    console.log(res.locals.email_address)
    let fName = user.first_name;
    let capFname = fName.charAt(0).toUpperCase() + fName.substring(1);
    let now = moment().format("h:mm a");
    res.render('dashboard', { firstName: capFname, date: now });

});

app.get("/about", (req, res) => {
    res.render('about');
});


app.get("/forget_username", (req, res) => {
    res.render('forget_username');
})


app.get("/forget_password", (req, res) => {
    res.render('forget_password');
})

app.get("/portfolio", redirectLogin, (req, res) => {
    const { user } = res.locals;
    let stmt = `select user_name, id, ticker, description, price_acquired, quantity, total, DATE(date_acquired) from holdings  WHERE user_name = '${user.user_name}'`;
    connection.query(stmt, (err, results) => {
        if (err) throw err;
        let portVal = 0;
        let formattedResults = [];
        results.forEach(order => portVal += order.total);

        for (let i = 0; i < results.length; i++) {

            let order = {
                user_name: results[i].user_name,
                id: results[i].id,
                ticker: results[i].ticker,
                description: results[i].description,
                price_acquired: numberWithCommas(results[i].price_acquired),
                quantity: formatNumber(results[i].quantity),
                total: formatNumber(results[i].total),
                date_acquired: results[i]['DATE(date_acquired)']
            }

            formattedResults.push(order);
        }
        let adjHoldings = formattedResults.filter(stock => stock.quantity > 0);



        connection.query(`SELECT * FROM holdings WHERE user_name ='${user.user_name}'`, (err, results) => {
            if (err) throw err;
            let portVal = 0;

            results.forEach(order => portVal += order.total);

            res.render('portfolio', { title: "Holdings", userName: user.user_name, holdings: adjHoldings, portVal: formatNumber(portVal) });

        })

    })

})
function currentPrice(ticker) {
    const apiURL = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${API_KEY}`;

    return axios.get(apiURL).then(data => {
        try {
            return data.data["Global Quote"]["05. price"];
        }
        catch (error) {
            console.log(error);
            throw error;
        }
    });
}


const analyze = (price1, price2) => {
    let delta = parseFloat(price2) - parseFloat(price1);
    let deltaPercent = delta / parseFloat(price1);
    switch (true) {
        case delta < 0:
            return 'SELL';
            break;
        case delta === 0:
            return 'HOLD';
            break;
        case deltaPercent >= 0.10:
            return 'SELL';
            break;h
        case deltaPercent <= 0.05:
            return 'BUY';
            break

    }
    return 'WAIT'
}

app.get("/refresh", redirectLogin, (req, res) => {
    const { user } = res.locals;
    connection.query(`SELECT * FROM holdings WHERE user_name = '${user.user_name}' AND quantity > 0`, async (err, results) => {
        if (err) {
            console.log(err);
            res.sendStatus(500);
            return;
        }

        try {
            const array = [];
            for (let holding of results) {

                let data = await currentPrice(holding.ticker);
                let delta = parseFloat(data) - holding.price_acquired;
                let recommendation = analyze(holding.price_acquired, data);

                let updatedTicker = {
                    ticker: holding.ticker,
                    description: holding.description,
                    price_acquired: formatNumber(holding.price_acquired),
                    market_price: formatNumber(parseFloat(data)),
                    delta: delta,
                    recommend: recommendation,
                    quantity: formatNumber(holding.quantity),
                    trade_date: holding.date_acquired,
                    id: holding.id

                }
                array.push(updatedTicker);
            }
            res.json(array);
        } catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    });
});



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
    let stmt = `select user_name, id, trans_type,ticker, description, price, quantity, total, DATE(trade_date) from trades WHERE user_name = '${user.user_name}' ORDER BY trade_date DESC`;
    connection.query(stmt, (err, results) => {
        if (err) throw err;
        console.log(results);
        let portVal = 0
        let formattedResults = [];
        results.forEach(order => portVal += order.total);

        for (let i = 0; i < results.length; i++) {

            let order = {
                user_name: results[i].user_name,
                id: results[i].id,
                trans_type: results[i].trans_type,
                ticker: results[i].ticker,
                description: results[i].description,
                price: formatNumber(results[i].price),
                quantity: formatNumber(results[i].quantity),
                total: formatNumber(results[i].total),
                trade_date: results[i]['DATE(trade_date)']
            }

            formattedResults.push(order);
        }

        res.render('history', { title: 'History', history: formattedResults, portVal: numFormat(portVal) });
    })

});

app.get("/trade", redirectLogin, (req, res) => {
    const { user } = res.locals;
    connection.query(`SELECT * FROM CASH WHERE user_name = '${user.user_name}'`, (err, results) => {
        if (err) throw err;
        // console.log(results)

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
    connection.query(`select user_name, trans_type, count(trans_type) as count, sum(total) * -1 as trans_total from trades where trans_type = 'Buy' group by user_name order by count(trans_type) desc`, (err, buy_results) => {
        if (err) throw err;
        console.log(buy_results);

        connection.query(`select user_name, trans_type, count(trans_type) as count, sum(total) as trans_total from trades where trans_type = 'Sell' group by user_name order by count(trans_type) desc`, (err, sell_results) => {
            if (err) throw err;
            console.log(sell_results);

            connection.query(`select ticker, count(trans_type) as count, sum(total) * -1 as total from trades where trans_type = 'Buy' group by ticker order by count(trans_type) desc`, (err, ticker_buys) => {
                if (err) throw err;
                console.log(ticker_buys);
                connection.query(`select ticker, count(trans_type) as count, sum(total) as total from trades where trans_type = 'Sell' group by ticker order by count(trans_type) desc`, (err, ticker_sells) => {
                    if (err) throw err;
                    console.log(ticker_sells);

                    res.render('leaders', { title: "Leaderboard", userName: user.user_name, buy_results: buy_results, sell_results: sell_results, ticker_buys: ticker_buys, ticker_sells: ticker_sells });
                })
            })

        })
    })

});

app.get("/password_reset", (req, res) => {
    res.render('reset');
})


app.post("/change_password", async (req, res) => {
    const { username } = req.body;
    const { password1 } = req.body;

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password1, salt);
        let stmt = `UPDATE users SET password = '${hashedPassword}' WHERE user_name = '${username}'`
        connection.query(stmt, (err, results) => {
            if (err) throw err;
            console.log(results);

            res.send("Password changed successfully!")
        })
    } catch {
        res.send('Password change failed!');
    }

})

app.post("/forget_username", (req, res) => {
    const { email } = req.body;
    console.log(email)
    let stmt = `SELECT * FROM users WHERE email_address ='${email}'`;
    connection.query(stmt, (err, results) => {
        if (err) throw err;
        console.log(results);
        if (results.length === 0) {
            res.send('Email not found');
        }

        if (results.length > 0) {

            const forgotUsername = {
                from: EMAIL_ACCOUNT,
                to: `${email}`,
                subject: 'Username Recovery',
                text:
                    `Kon'nichiwa Ninja,

                 Please see your username below:

                 ${results[0].user_name}

                 Regards,

                 Trade Ninja Support
                `
            };

            transporter.sendMail(forgotUsername, (error, info) => {
                if (error) {
                    console.log(error)
                } else {
                    console.log('Email sent' + info.response);
                    res.send('Email success!');
                }
            })


        }
    })
})

app.post("/forget_password", (req, res) => {
    const { email } = req.body;
    console.log(email);
    let stmt = `SELECT * FROM users WHERE email_address ='${email}'`;
    connection.query(stmt, (err, results) => {
        if (err) throw err;
        console.log(results);
        if (results.length === 0) {
            res.send('Email not found');
        }

        if (results.length > 0) {

            const forgotPassword = {
                from: EMAIL_ACCOUNT,
                to: `${email}`,
                subject: 'Password Reset',
                text:
                    `Kon'nichiwa Ninja,

                Please click the link below to reset your password.
                
                http://localhost:3000/password_reset
                 

                Regards,

                Trade Ninja Support
                `
            };

            transporter.sendMail(forgotPassword, (error, info) => {
                if (error) {
                    console.log(error)
                } else {
                    console.log('Email sent' + info.response);
                    res.send('Email success!');
                }
            })


        }
    })
})


app.post("/users/holdings", redirectLogin, (req, res) => {
    const { user } = res.locals;
    console.log(req.body.ticker)
    connection.query(`SELECT quantity FROM holdings WHERE user_name = '${user.user_name}' and ticker ='${req.body.ticker}'`, (err, results) => {
        if (err) throw err;
        console.log(results.length);
        console.log(results);

        if (results.length === 0) {
            res.send("Not found!");
        } else {
            res.send(results);
        }
    })
})

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
    const { user } = res.locals;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);
        let stmt = `INSERT INTO users (first_name, last_name, email_address, user_name, password) VALUES (?)`
        let values = [req.body.firstName, req.body.lastName, req.body.emailAddress, req.body.userName, hashedPassword]
        connection.query(stmt, [values], (err, results) => {
            if (err) {
                return console.error(err.message);
            }
            const welcomeMessage = {
                from: EMAIL_ACCOUNT,
                to: `${req.body.emailAddress}`,
                subject: 'Welcome to Trade Ninja!',
                text:
                    `Kon'nichiwa ${req.body.firstName},

                    Thank you for creating your free account with Trade Ninja! We are excited that you have chosen to
                    begin your journey to be the trade ninja master.

                    Regards,

                    Trade Ninja Support
                    `
            };

            transporter.sendMail(welcomeMessage, (error, info) => {
                if (error) {
                    console.log(error)
                } else {
                    console.log('Email sent' + info.response);
                }
            })
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

app.post('/sell', redirectLogin, (req, res) => {
    const { user } = res.locals;

    let stmt = `UPDATE holdings SET quantity = quantity - ${req.body.quantity} WHERE user_name = '${user.user_name}' AND ticker ='${req.body.ticker}'`;
    connection.query(stmt, (err, results) => {
        if (err) throw err;
        console.log(results);

        connection.query(`DELETE FROM holdings WHERE quantity = 0 AND user_name = '${user.user_name}'`, (err, results) => {
            if (err) throw err;
            console.log(results);
            res.send('Your holdings were adjsuted!');
        })

    });


});

app.post('/sell/cash', (req, res) => {
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


app.post('/portval', redirectLogin, (req, res) => {
    const { user } = res.locals;
    connection.query(`SELECT * FROM holdings WHERE user_name = '${user.user_name}' AND quantity > 0`, (err, results) => {
        if (err) throw err;
        console.log(results);
        res.send(results);
    })
})

app.post('/logout', redirectLogin, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect("/dashboard");
        }

        res.clearCookie(SESS_NAME);
        res.send("Ninja vanish!");
    })
})



app.listen(PORT, console.log(`Listening on http://localhost:${PORT}`));