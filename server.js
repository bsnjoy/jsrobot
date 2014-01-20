var http = require('http');
var fs = require('fs');
var SerialPort = require("serialport").SerialPort;

var app = require('http').createServer(handler)
  , qs = require('querystring')
   ,url = require('url')
   app.listen(8081);
var clients = []; 

// Время в нужном нам формате для логов
function getDateTime() {

    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    var year = date.getFullYear();

    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;

    return year + ":" + month + ":" + day + " " + hour + ":" + min + ":" + sec;

}

function log( txt, req ) {
    var time = getDateTime();
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var browser = req.headers['user-agent'];
    console.log(time + ' ' + ip +' ' + txt + ' ' + browser);
}

function serialSend( cmd ) {
    serialPort.write(cmd, function(err, results) {
        console.log('err ' + err);
        console.log('results ' + results);
    });

}

function cmdSend(cmd, value) {
    value = parseInt( value );
    if( value > 0xFFFF ) {
        value = 0xFFFF;
    }
    if (value < 0)  {
        value = 0xFFFF + value + 1;
    }
    var hex = Math.round(value).toString(16);
    var cmdsize = 4;
    while(hex.length < cmdsize) {
        hex = "0" + hex;
    }
    console.log( "Waw! Sending to robot:" + cmd + hex );
    serialSend( cmd + hex );
}

var lastTimer = 0;

function robotStopMove() {
    cmdSend( "G", 0 );
}

function robotMove(left, right) {
    clearTimeout( lastTimer );
    if ( left == right) {
        cmdSend( "G", left );
        lastTimer = setTimeout( robotStopMove, 300);
    } else {
        cmdSend( "L", left );
        cmdSend( "R", right );
        lastTimer = setTimeout( robotStopMove, 200);
    }
}

function handler (req, res)
{
 
        var parsedURL = url.parse(req.url, true);
        var path = parsedURL.pathname;
        var query = parsedURL.query;
        switch (path)
        {
        case '/':
        case '/index.html':
            log('asked for index.html', req);
//             console.log(time + ' ' + ip +' asked for index.html. ' + browser);
            fs.readFile(__dirname + '/index.html',
            function (err, data) {
                if (err) {
                    res.writeHead(500);
                    return res.end('Error loading index.html');
                }
 
                res.writeHead(200);
                res.end(data);
            });
            break;
        // Client subscribes to receive commands from robot
        case '/serialreceive':
            // console.log('Ask for serialreceive');
            // log('Ask for serialreceive', req);
    	    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            clients.push(res);
            res.on('close', function() {
                clients.splice(clients.indexOf(res), 1);
            });
            break;
        // Client send a command to robot
        case '/serialsend':
            var cmd = '';
            log('Ask for serialsend', req);
            req
                .on('readable', function() {
                    cmd += req.read();
                    if (cmd.length > 1000) {
                        res.statusCode = 413;
                        res.end("Message is too big");
                    }
                })
                .on('end', function() {
                    log('Command to serial:'+cmd, req);
                    serialPort.write(cmd, function(err, results) {
                      console.log('err ' + err);
                      console.log('results ' + results);
                    });  

                    res.end('');
                    //console.log('Datad='+body.cmd+' data='+body.data);
                });
            break;
        case '/robotMove':
            var cmd = '';
            log('Ask for move', req);
            req
                .on('readable', function() {
                    cmd += req.read();
                    if (cmd.length > 1000) {
                        res.statusCode = 413;
                        res.end("Message is too big");
                    }
                })
                .on('end', function() {
                    log('Command to move:'+cmd, req);
                    try {
                        cmd = JSON.parse(cmd);
                        robotMove( cmd.left, cmd.right );
                        console.log('moving left:'+cmd.left+' right'+cmd.right);
                    } catch(e) {
                        console.log('Error parsing JSON for move');
                    }
                    res.end('');
                    //console.log('Datad='+body.cmd+' data='+body.data);
                });
            break;
        case '/mjpeg_stream':
            log('Ask for mjpeg_stream', req);
            //res.writeHead(200, {'Content-Type': 'text/plain'});


            var boundary = "BoundaryString";

            var options = {
                // host to forward to
                host:   '127.0.0.1',
                // port to forward to
                port:   8080,
                // path to forward to
                path:   '/?action=stream',
                // request method
                method: 'GET',
                // headers to send
                headers: req.headers
            };

            var creq = http.request(options, function(cres) {
                // wait for data
                for(var item in cres.headers) {
                    log(item + ": " + cres.headers[item], req);
                    res.setHeader(item, cres.headers[item]);
                }

                cres.on('data', function(chunk){
                    res.write(chunk);
                    //console.log(cres.headers);
//                    console.log(chunk);
                });

                cres.on('close', function(){
                    // closed, let's end client request as well 
                    res.writeHead(cres.statusCode);
                    res.end();
                });
            }).on('error', function(e) {
                // we got an error, return 500 error to client and log error
                console.log(e.message);
                res.writeHead(500);
                res.end();
            });

            creq.end();

            break;
        default:
            log('return 404, ask for ' + path, req);
            res.writeHead(404, {'Content-Type': 'text/plain'});
            res.end('404 ERROR\n');
            break;
        }
}

//cmdSend('G', '-15');
//process.exit(1);
console.log('Server running on port 8081');

var serialPort = new SerialPort("/dev/ttyS1", {
    baudrate: 9600
});


serialPort.on("open", function () {
  console.log('open serial');
  serialPort.on('data', function(data) {
    console.log(getDateTime()+' data received: ' + data);
    clients.forEach(function(res) {
        res.end(data);
    });
    clients=[];
  });  
});

setInterval(function() {
    console.log(clients.length);
}, 5000);

//                    try {
//                         body = JSON.parse('{"name":"alan","age":"12"}');
//                     } catch(e) {
//                        console.log('fuck');
//                     }
//                    console.log('ok'+body.name);
