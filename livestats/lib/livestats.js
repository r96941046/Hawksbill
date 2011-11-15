var http = require('http'),
    util = require('util'),
    url = require('url'),

    // sub-directories without .js, it is assumed
    // node-static to serve static files
    nodeStatic = require('node-static/lib/node-static'),
    faye = require('faye/faye-node');

function LiveStats(options){
  
  // ensure the function is always called with 'new'
  // this refers to the function, which is also a object
  if (!(this instanceof arguments.callee)) {
    return new arguments.callee(arguments);
  }

  var self = this;

  self.settings = {
    port: options.port,
    geoipServer:{
      hostname: options.geoipServer.hostname,
      port: options.geoipServer.port || 80
    }
  };
  self.init();
}

LiveStats.prototype.init = function(){
  var self = this;
  self.bayeux = self.createBayeuxServer();
  self.httpServer = self.createHTTPServer();
  self.bayeux.attach(self.httpServer);
  self.httpServer.listen(self.settings.port);
  util.log('Server started on PORT ' + self.settings.port);
}

LiveStats.prototype.createHTTPServer = function(){
  var self = this;
  var server = http.createServer(function(request, response){
      // serve files under ./public folders
      // without cache, i.e. allow clients to see up-to-date files
      var file = new nodeStatic.Server('./public', { cache: false });
      request.on('end', function(){
        // url.parse returns parsed object, set true for parsing query strings
        var location = url.parse(request.url, true),
            params = (location.query || request.headers);
        if (location.pathname == '/config.json' && request.method == 'GET'){
          response.writeHead(200, {'Context-Type':'application/x-javascript'});
          var jsonString = JSON.stringify({
              port: self.settings.port
            });
          response.write(jsonString);
          response.end();
        } else if (location.pathname == '/stat' && request.method == 'GET'){
          self.ipToPosition(params.ip, function(latitude, longitude, city){
              self.bayeux.getClient().publish('/stat',{
                  title: params.title,
                  latitude: latitude,
                  longitude: longitude,
                  city: city,
                  ip: params.ip
                });
            });
          response.writeHead(200, {'Context-Type':'text/plain'});
          response.write('OK');
          response.end();
        } else {
          file.serve(request, response);
          }
      });
    });
    return server;
}

LiveStats.prototype.ipToPosition = function (ip, callback) {
  var self = this;

  var client = http.createClient(self.settings.geoipServer.port, self.settings.geoipServer.hostname);
  var request = client.request('GET', '/geoip/api/locate.json?ip=' + ip, {
                'host': self.settings.geoipServer.hostname
                  });
  request.end();

  request.on('response', function (response) { 
          response.setEncoding('utf8');

          var body = '';
          response.on('data', function (chunk) {
                  body += chunk;
                  });
          response.on('end', function () {
                  var json = JSON.parse(body);
                  if (json.latitude && json.longitude) {
                      callback(json.latitude, json.longitude, json.city);
                      }
                      });
          });
};

LiveStats.prototype.createBayeuxServer = function(){
  var self = this;
  var bayeux = new faye.NodeAdapter({
        mount: '/faye',
        timeout: 45
      });
  return bayeux;
}

// enable to be called as module
module.exports = LiveStats;
