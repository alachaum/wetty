var express = require('express');
var http = require('http');
var path = require('path');
var server = require('socket.io');
var pty = require('pty.js');
var fs = require('fs');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var passportSocketIo = require("passport.socketio");

// Load app configuration
var config = require('./config');

//===============================================
// Server Configuration
//===============================================
var opts = require('optimist').options({
  port: {
    demand: true,
    alias: 'p',
    description: 'wetty listen port'
  },
}).boolean('allow_discovery').argv;

process.on('uncaughtException', function(e) {
  console.error('Error: ' + e);
});

//===============================================
// Passport Configuration
//===============================================
passport.use(new LocalStrategy({
    passReqToCallback: true
  },
  config.authFn
));

// Configure Passport authenticated session persistence.
passport.serializeUser(function(user, cb) {
  cb(null, JSON.stringify(user));
});

passport.deserializeUser(function(str, cb) {
  cb(null, JSON.parse(str));
});

//===============================================
// Express Configuration
//===============================================
var app = express();

// Configure view engine to render EJS templates.
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// Define session and session store
var session = require('express-session');
var FileStore = require('session-file-store')(session);
var sessionStore = new FileStore();

// Configure session middleware
sessionConfig = {
  key: config.session.key,
  secret: config.session.secret,
  resave: false,
  saveUninitialized: true,
  store: sessionStore
};
var sessionMiddleware = session(sessionConfig);

// Configure cookie
var cookieParser = require('cookie-parser');

// CSRF middleware
var csrf = require('csurf');
var csrfProtection = csrf({ cookie: true });

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require('morgan')('combined'));
app.use(cookieParser());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());

//===============================================
// Express Routes
//===============================================
app.use('/wetty', express.static(path.join(__dirname, 'public','wetty')));

app.get('/login',
  csrfProtection,
  function(req, res){
    console.log("Rendering login");
    res.render('login',{ csrfToken: req.csrfToken() });
  });

app.post('/login',
  csrfProtection,
  passport.authenticate('local', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/logout',
  function(req, res){
    req.logout();
    res.redirect('/login');
  });

app.get('/',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    res.render('index', { user: req.user });
  });

//===============================================
// Initiate http server
//===============================================
var httpserv;
httpserv = http.createServer(app).listen(opts.port, function() {
    console.log('http on port ' + opts.port);
});

//===============================================
// Socket server
//===============================================
var io = server(httpserv,{path: '/wetty/socket.io'});

io.use(passportSocketIo.authorize({
  cookieParser: cookieParser,
  key:          sessionConfig.key,
  secret:       sessionConfig.secret,
  store:        sessionStore,
  fail: function(data, message, error, accept) {
    if (error) accept(new Error(message));
  },
  success: function(data, accept) {
    console.log("success socket.io auth");
    accept();
  }
}));

io.on('connection', function(socket){
    var request = socket.request;
    console.log((new Date()) + ' Connection accepted.');

    // Initiate session
    var term;
    var entrypoint = config.shellEntrypoint(request);
    term = pty.spawn(entrypoint.script, entrypoint.args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 30
    });

    // Loop
    term.on('data', function(data) {
        socket.emit('output', data);
    });
    term.on('exit', function(code) {
        console.log((new Date()) + " PID=" + term.pid + " ENDED");
        socket.emit('exit','/logout');
    });
    socket.on('resize', function(data) {
        term.resize(data.col, data.row);
    });
    socket.on('input', function(data) {
        term.write(data);
    });
    socket.on('disconnect', function() {
        term.end();
    });
})
