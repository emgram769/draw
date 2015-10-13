var http = require('http');
var https = require('https');
var express = require('express');
var fs = require('fs');
var path = require('path');
var sys = require('sys');
var crypto = require("crypto");
var exec = require('child_process').exec;
var Canvas = require('canvas')
  , canvas = new Canvas(3000,2000)
  , ctx = canvas.getContext('2d');

var root = path.join(__dirname, '..');
var port = process.env.PORT || 5000;
// My setup has python serving up the file,
// not node.js.  You may want to change that.
var binary_file = "/srv/python-srv/app/draw.jpg";

try {
	var old_image = new Canvas.Image;
	old_image.src = binary_file;
	ctx.drawImage(old_image, 0, 0);
} catch (e) {
	console.log(e);
}

var app = express();

var http_server;
    http_server = http.createServer(app).listen(port, function() {
        console.log('Express http_server listening on port %d',
                    http_server.address().port);
    });

var io = require('socket.io').listen(http_server);

var max_length = 5000;
var curr_image = "";
var image_size = 200.0;
var user_dict = {};
var max_quota = 8000;
var quota_interval = 100;
var clear_vote = 0;
var max_clear_vote = 20;
var curr_users = [];
var voted = [];
var chat = [];
try {
	chat = require("./chat.json");
} catch (e) {
	console.log(e);
}
var special_names = ["RPG", "furguy", "shitstorm", "emgram"];

function check_password(password, callback) {
    if (password == "bernardo") {
        callback(false,true);
    } else {
        callback(false,false);
    }
}

function add_to_chat(data) {
    chat.push(data);
    chat = chat.slice(chat.length-50);
    fs.writeFile( "chat.json", JSON.stringify( chat ), "utf8", function(){} );
}

function draw_pt(p) {
    var stroke_type = p.stroke_type ? p.stroke_type : "normal";
    var r = p.r ? p.r : '0';
	var g = p.g ? p.g : '0';
    var b = p.b ? p.b : '0';
    ctx.strokeStyle = "rgba("+r+", "+g+", "+b+", 1.0)";
	ctx.lineJoin = ctx.lineCap = 'round';
	
	switch (stroke_type) {
		case "3dim":
			ctx.lineWidth = 2;
			for (var i = 0; i < 8; i++){
				ctx.beginPath();
				ctx.strokeStyle = "rgba("+r+", "+g+", "+b+", "+(1.0-0.1*i)+")";
			    ctx.moveTo(p.prevX+i, p.prevY+i);
			    ctx.lineTo(p.currX+i, p.currY+i);
			    ctx.stroke();
			}
		case "normal":
		default:
		    ctx.lineWidth = 4;
		    ctx.beginPath();
			ctx.moveTo(p.prevX, p.prevY);
			ctx.lineTo(p.currX, p.currY);
			ctx.stroke();
   			break;
	}


    ctx.closePath();
    /*
	ctx.strokeStyle = "rgba("+r+", "+g+", "+b+", 1.0)";
    //ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.closePath();*/
}

function draw_char(c, color) {
	var text_width = c.c.length * 14.45;
	ctx.fillStyle = "#FFFFFF";
	ctx.fillRect(c.currTextX, c.currTextY+5, text_width, -23);
    ctx.font = 'bold 12pt Courier';
    ctx.fillStyle = color ? color : 'black';
    if (c.c[0] == ">")
    	ctx.fillStyle = 'green';
    ctx.fillText(c.c, c.currTextX, c.currTextY);
}

function draw_image(image_data) {
	var load_image = new Canvas.Image();
    load_image.src = image_data.src;
	var scale_factor = load_image.height > load_image.width ? image_size/load_image.height : image_size/load_image.width;
	ctx.drawImage(load_image, image_data.x, image_data.y,
  				scale_factor*load_image.width,
  				scale_factor*load_image.height);  
}

var flag = false
function check_quota(cost, id) {
	var gain = (Date.now() - user_dict[id][0]) * 20 / quota_interval + user_dict[id][1];
	var user_quota = gain > max_quota ? max_quota - cost : gain - cost;
	user_dict[id][0] = Date.now();
	user_dict[id][1] = user_quota;
	if (user_dict[id][1] <= 0) {
		console.log("over quota", id);
		user_dict[id][1] -= 4000;
		return false;
	} else {
		return true;
	}
}

function puts(error, stdout, stderr) { sys.puts(stdout) }

function draw_canvas(data, socket){
	var can_send = true;
	var data_out = [];
	for (i in data) {
		if (data && data[i] && data[i].type){
		try {
		switch (data[i].type) {
			case "word":
				if (can_send = can_send && check_quota(100*data[i].c.length, socket.handshake.address.address)) {
					draw_char(data[i]);
					data_out.push(data[i]);
				}
				break;
			case "stroke":
				var size = 1*(Math.abs(data[i].prevX-data[i].currX)+Math.abs(data[i].prevY-data[i].currY));
				if (can_send = can_send && check_quota(size, socket.handshake.address.address)) {
					draw_pt(data[i]);
					data_out.push(data[i]);
				}
				break;
			case "image":
				if (can_send = can_send && check_quota(4000, socket.handshake.address.address)) {
					draw_image(data[i]);
					data_out.push(data[i]);
				}
				/*if (user_dict[socket.id][0] + 10000 < Date.now()){
					user_dict[socket.id][0] = Date.now();
				} else {
					console.log("too soon!");
					return;
				}*/
					
				break;
			case "vote":
				if (voted.indexOf(socket.handshake.address.address)>-1) {
					console.log("already voted", socket.id, socket.handshake.address.address);
					break;
				}
				voted.push(socket.handshake.address.address);
				clear_vote+=-1+2*(data[i].clear > 0);
				if (clear_vote > max_clear_vote){
					clear_screen();
				} else {
					data_out.push(data[i]);
				}
				break;
			case "chat":
				if (can_send = can_send && check_quota(1000, socket.handshake.address.address)) {
		            if (data[i].name == "admin") {
                        if (!(data[i].password == "bernard")) {
                            data[i].name = "not admin";
                        }
                    }
                    if (special_names.indexOf(data[i].name) > -1) {
                        if (!(data[i].password == "woo!")) {
                            data[i].name = "imposter";
                        }
                    }
                    if (data[i].body.length > 300) {
                        data[i].body = data[i].body.slice(0, 300) + "...";
                    }
                    data[i].password = "";
                    data[i].time = new Date();
                    var hash = crypto.createHash("md5").update(socket.handshake.address.address).digest("hex");

                    data[i].hash = hash;
                    add_to_chat(data[i]);
                    data_out.push(data[i]);
                }
				break;
   			case "notification":
				check_password(data[i].password, function(err, matches) {
					if (err) return console.log(err);
					if (!matches) return console.log('wrong password');
					console.log(data[i].message);
					io.sockets.emit('server', [data[i]]);
				});
				break;
			case "force_clear":
				check_password(data[i].password, function(err, matches) {
					if (err) return console.log(err);
					if (!matches) return console.log('wrong password');
					clear_screen();
				});
				break;
			case "set_quota":
				check_password(data[i].password, function(err, matches) {
					console.log("recieved set quota", data[i]);
					if (err) return console.log(err);
					if (!matches) return console.log('wrong password');
					for (j in user_dict) {
						if (user_dict[j].length > 2 
							&& user_dict[j][2] == data[i].hash) {
							user_dict[j][1] = data[i].quota;
							console.log("FOUND A MATCH!");
						}
					}
				});
				break;
		}} catch(e) {
			console.log("error", e);
		}
		}
	}
	if (data_out.length > 0) {
		socket.broadcast.emit('server', data_out);
	}
	if (!can_send) {
		console.log("limit was reached on id: ", socket.id, socket.handshake.address);
	}
	flag = true;
}

function clear_screen() {
	clear_vote = 0;
	ctx.fillStyle="#FFFFFF";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	io.sockets.emit('server', [{type:"clear_screen"}]);
	io.sockets.emit('server', [{type:"init_vote", clear:clear_vote}]);
	draw_to_binary();
	delete voted;
	voted = [];
}

function draw_to_binary(){
        if (!flag) {
            setTimeout(draw_to_binary, 5000);
            return;
        }   

        var tmp_binary = "tmp.jpg";
        var out = fs.createWriteStream(tmp_binary);
    
        var stream = canvas.jpegStream({
            bufsize: 4096 // output buffer size in bytes, default: 4096
          , quality: 75 // JPEG quality (0-100) default: 75
          , progressive: false // true for progressive compression, default: false
        }); 
    
        stream.on('data', function(chunk){
          out.write(chunk);
        }); 
    
        stream.on('end', function(){
          console.log('saved png');
          var command = "mv "+tmp_binary+" "+binary_file;
          exec(command, puts);

          setTimeout(draw_to_binary, 15000);
        }); 

        flag = false;
}

draw_to_binary();

var clearX = 0;
var clearY = 10;

function clearbot(){
	if (clear_vote < (2.0*max_clear_vote/3))
		return;
	clearX+=28;
	if (clearX >= canvas.width) {
		clearY+=14;
		if (clearY >= canvas.height)
			clearY = 0;
		clearX = 0;
	}
	var clearBlock = {
		type:"word",
		currTextX:clearX,
		currTextY:clearY,
		c:"   >"
	}
	draw_char(clearBlock);
	io.sockets.emit('server', [clearBlock]);
}

//setInterval(clearbot, 500);


io.set('log level', 1);
io.sockets.on('connection', function (socket) {
  //socket.emit('init_draw', {image: curr_image});
  if (!(socket.handshake.address.address in user_dict)) {
  	var hash = crypto.createHash("md5").update(socket.handshake.address.address).digest("hex");
    user_dict[socket.handshake.address.address] = [Date.now(), max_quota, hash];
  }
  socket.emit('server', [{type:"init_vote", clear:clear_vote}]);
  socket.emit('server', [{type:"init_chat", chat:chat}]);
  var user_count = curr_users.length + (curr_users.indexOf(socket.handshake.address.address) < 0);
  max_clear_vote = Math.floor(0.50*user_count);
  io.sockets.emit('server', [{type:"user_count", count:user_count}]);
  socket.on('client', function (data) {
    try {
    	draw_canvas(data, socket);
    } catch (e) {
	    console.log(e);
    }
  });
  socket.on('disconnect', function(){
    var addr = socket.handshake.address.address;
    delete curr_users;
    curr_users = [];
    io.sockets.clients().forEach(function(s) {
        var temp_index = curr_users.indexOf(s.handshake.address.address);
        if (temp_index < 0)
            curr_users.push(s.handshake.address.address);
    });
	var user_count = curr_users.length;
    max_clear_vote = Math.floor(0.50*user_count);
	io.sockets.emit('server', [{type:"user_count", count:user_count}]);
  })
});

