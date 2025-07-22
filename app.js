require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const agentRouter = require('./routes/agent');
const authRouter = require('./routes/auth');

const app = express();

app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/personality', require('./routes/personality'));
app.use('/match', require('./routes/match'));
app.use('/auth', authRouter);
app.use('/chat', require('./routes/agent'));
app.use('/ai', require('./routes/users'));
app.use('/chatroom', require('./routes/chat'));
app.use('/verify', require('./routes/verify'));

module.exports = app;