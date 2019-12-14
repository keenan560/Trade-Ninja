const express = require('express');

const app = express();

const Port = process.env.port || 3000;

const path = require("path");

const public = path.join(__dirname, 'public');



app.get("/", (req, res) => {
    res.sendFile(path.join(public, 'login.html'));
}) 

app.get("/login", (req, res) => {
    res.sendFile(path.join(public, 'login.html'));
});

app.get("/register", (req, res) => {
    res.sendFile(path.join(public, 'register.html'));
})



app.use('/', express.static(public))

app.listen(Port, console.log(`Listening on http://localhost:${Port}`));