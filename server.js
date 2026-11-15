// server.js
require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const connectDB = require('./src/config/db');
const configureSocket = require('./src/config/socket');
const indexRouter = require('./src/routes/index.routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));
app.use('/', indexRouter);

configureSocket(io);

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});