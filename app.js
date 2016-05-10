var express = require('express'),
    bodyParser = require('body-parser'),
    twilio = require('twilio'),
    redis = require('redis'),
    Promise = require('bluebird'),
    http = require('http'),
    config = require('./config.js');

var app = express();
var server = http.createServer(app);
var io = require('socket.io')(server);

Promise.promisifyAll(redis.RedisClient.prototype);

var client = redis.createClient();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));

function smsResponse(res, resp) {
  var tResp = new twilio.TwimlResponse();
  if(resp !== null && resp !== undefined) {
    tResp.sms(resp);
  }
  res.type('text/xml');
  res.send(tResp.toString());
}

function updateClients() {
  Promise.all([client.getAsync('open'), client.hgetallAsync('votes')]).then(function(r) {
    var open = r[0];
    var results = r[1];
    if (open === "1") open = true;
    else open = false;
    io.emit('message', {'results': results, 'open': open});
  });
}


app.post('/_api', function(req, res){
  var action = req.body.action;
  if(action === 'toggle') {
    client.get('open', function(_, reply) {
      if(reply === "1") {
        client.set('open', "0", function() {
          updateClients();
        });
      } else {
        client.set('open', "1", function() {
          updateClients();
        });
      }
    });
  } else if (action === 'reset') {
    client.del('votes', function() {
      client.del('voters', function() {
        updateClients();
      });
    });
  }
  res.end();
});

app.post('/_sms', function(req, res) {
  if (twilio.validateExpressRequest(req, config.authToken)) {
    client.get('open', function(_, pollOpen) {
      if(pollOpen !== "1") {
        smsResponse(res, null);
        return;
      }

      var f = req.body.From;
      var b = req.body.Body;

      client.sismember('voters', f, function(_, voted){
        if(voted === 1) {
          var team = b.toLowerCase().trim();
          client.sismember('teams', team, function(_, validTeam){
            if(validTeam === 1) {
              client.sadd('voters', f);
              client.hincrby('votes', team, 1, function(_, __) {
                smsResponse(res, "Your vote has been recorded!");
                updateClients();
              });
            } else {
              smsResponse(res, "Not a valid team.");
            }
          });
        } else {
          smsResponse(res, null);
        }
      });
    });
  }
  else {
      res.status(501).end();
  }
});

io.on('connection', function(socket) {
  Promise.all([client.getAsync('open'), client.hgetallAsync('votes')]).then(function(r) {
    var open = r[0];
    var results = r[1];
    if (open === "1") open = true;
    else open = false;
    socket.send({'results': results, 'open': open});
  });
});

server.listen(3000);
