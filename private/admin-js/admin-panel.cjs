//in this file we are going to use an express app to host admin

// we will decide later if the port should be the same as the other half, consider architcture and CORS and latency

const express = require('express');
const path = require('path');
const app = express();
const DEFAULT_ADMIN_PORT = 4000
const admin_port = process.env.ICEBREAKER_ADMIN_PORT != undefined ? process.env.ICEBREAKER_ADMIN_PORT : DEFAULT_ADMIN_PORT; // you can change this to any port you prefer

app.use(express.static(path.join(__dirname, '..',))); // serves all of private
app.use('/admin-panel', express.static(path.join(__dirname, '..', '/admin-panel'))); // fixes relative paths

app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin-panel', 'admin.html'));
});

app.get('/', (req, res) => {
    res.redirect('/admin-panel');
});


app.use((req, res) => {
    res.status(404).send('Not found');
});


app.listen(admin_port, () => {
    console.log(`Admin panel is running at http://localhost:${admin_port}`);
    console.log(' ') //newline
});