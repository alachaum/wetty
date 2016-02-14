var config = {};

// Authentication function
config.authFn = function(req, username, password, cb) {
  console.log(req.get('host'));
  if (username == "foo" && password == "bar") {
    return cb(null, { id: username, res_id: 'xyz' });
  } else {
    return cb(null, false, { message: 'Invalid credentials' });
  }
}

// Session Configuration
config.session = {
  key: 'webconsole',
  secret: '2asd7f4d6s15s74d',
};

// Shell Entrypoint
// request: socket.io request object
config.shellEntrypoint = function(request) {
  return {
    script: __dirname + '/bin/entrypoint',
    args: [request.user.res_id],
  };
}

module.exports = config;
