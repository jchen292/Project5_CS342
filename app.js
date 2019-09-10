//var mongojs = require("mongojs");
var db = null;
//mongojs('localhost:27017/myGame', ['account','progress']);


require('./Entity');
require('./client/Inventory');

var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/',function(req, res) {
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

var portNum = 2000;
serv.listen(process.env.PORT || portNum);
console.log("Server started.");
console.log("Running on port number: " + portNum)

var SOCKET_LIST = {};
var DEBUG = false;
var PLAYER_LIST = [];
var send = false; 

var scores = {};
score = [];
var name = [];
var start = false;

var gameOver = true;
var winner = '';

function isUsernameTaken(name) {
    if(PLAYER_LIST.includes(name)) {
        console.log("true");
        return true;
	}
    console.log("false");
    return false;
}

var io = require('socket.io')(serv,{});

io.sockets.on('connection', function(socket){
	socket.id = Math.random();
	SOCKET_LIST[socket.id] = socket;
	socket.name = '';

	
    socket.on('signIn',function(data){
		if(!isUsernameTaken(data.username)){
			Player.onConnect(socket,data.username);
			PLAYER_LIST.push(data.username);
			socket.name = data.username;
			socket.emit('signInResponse',{success:true});
			send = true;
			console.log("player count is: " + PLAYER_LIST.length);
			if(PLAYER_LIST.length == 4) {
				start = true;
			}

		} 
		else {
			socket.emit('signInResponse',{success:false});
		}
    });
	
	socket.on('disconnect',function(){
		delete SOCKET_LIST[socket.id];
		delete PLAYER_LIST[PLAYER_LIST.indexOf(socket.name)];
		PLAYER_LIST = PLAYER_LIST.filter(Boolean);
		send = true;

		console.log(scores);
		Player.onDisconnect(socket);
	});
	
	socket.on('evalServer',function(data){
		if(!DEBUG)
			return;
		var res = eval(data);
		socket.emit('evalAnswer',res);		
	});
});

var initPack = {player:[],bullet:[],landmine:[]};
var removePack = {player:[],bullet:[],landmine:[]};

Entity = function(param){
	var self = {
		x:500,
		y:500,
		spdX:0,
		spdY:0,
		id:"",
		
	}
	if(param){
		if(param.x)
			self.x = param.x;
		if(param.y)
			self.y = param.y;
		if(param.id)
			self.id = param.id;		
	}
	
	self.update = function(){
		self.updatePosition();
	}
	self.updatePosition = function(){
		self.x += self.spdX;
		self.y += self.spdY;
	}
	self.getDistance = function(pt){
		return Math.sqrt(Math.pow(self.x-pt.x,2) + Math.pow(self.y-pt.y,2));
	}
	return self;
}

Entity.getFrameUpdateData = function(){
	var pack = {
		initPack:{
			player:initPack.player,
			bullet:initPack.bullet,
			landmine:initPack.landmine,
		},
		removePack:{
			player:removePack.player,
			bullet:removePack.bullet,
			landmine:removePack.landmine,
		},
		updatePack:{
			player:Player.update(),
			bullet:Bullet.update(),
			landmine:LandMine.update(),
		}
	};
	initPack.player = [];
	initPack.bullet = [];
	initPack.landmine = [];
	removePack.player = [];
	removePack.bullet = [];
	removePack.landmine = [];
	return pack;
}

var playerLandMines = 9;
Player = function(param){
	var self = Entity(param);
	self.number = "" + Math.floor(10 * Math.random());
	self.username = param.username;
	self.pressingRight = false;
	self.pressingLeft = false;
	self.pressingUp = false;
	self.pressingDown = false;
	self.pressingAttack = false;
	self.pressingQ = false;
	self.mouseAngle = 0;
	self.angle = 0;	
	self.maxSpd = 10;
	self.hp = 10;
	self.hpMax = 10;
	self.score = 0;
	self.inventory = new Inventory(param.socket,true);
	self.landmines = playerLandMines;
	
	var super_update = self.update;
	self.update = function(){
		self.updateSpd();
		
		super_update();
		
		if(self.pressingAttack){
			self.shootBullet(self.mouseAngle);
		}
		else if(self.pressingQ){
			if(self.landmines > 0){
				self.launchMine(self.mouseAngle);
				self.landmines--;
			}
		}
	}
	
	self.shootBullet = function(angle){
		Bullet({
			parent:self.id,
			angle:angle,
			x:self.x,
			y:self.y,
		});
	}
	self.launchMine = function(angle){
		LandMine({
			parent:self.id,
			angle:angle,
			x:self.x,
			y:self.y,
			landmines:self.landmines,
		});
	}
	
	self.updateSpd = function(){
		if(self.pressingRight){
			self.spdX = self.maxSpd;
		}
		else if(self.pressingLeft)
			self.spdX = -self.maxSpd;
		else
			self.spdX = 0;
		
		if(self.pressingUp)
			self.spdY = -self.maxSpd;
		else if(self.pressingDown)
			self.spdY = self.maxSpd;
		else
			self.spdY = 0;		
	}
	
	self.getInitPack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,	
			number:self.number,	
			hp:self.hp,
			hpMax:self.hpMax,
			score:self.score,
		};		
	}
	self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
			hp:self.hp,
			score:self.score,
		}	
	}
	
	Player.list[self.id] = self;
	
	initPack.player.push(self.getInitPack());
	return self;
}
Player.list = {};
Player.onConnect = function(socket,username){

	var player = Player({
		username:username,
		id:socket.id,
		socket:socket,
	});

	socket.on('keyPress',function(data){
		if(data.inputId === 'left')
			player.pressingLeft = data.state;
		else if(data.inputId === 'right')
			player.pressingRight = data.state;
		else if(data.inputId === 'up')
			player.pressingUp = data.state;
		else if(data.inputId === 'down')
			player.pressingDown = data.state;
		else if(data.inputId === 'attack')
			player.pressingAttack = data.state;
		else if(data.inputId === 'mouseAngle')
			player.mouseAngle = data.state;
		else if(data.inputId === 'LandMine')
			player.pressingQ = data.state;
	});

	socket.on('loseHP',function(data){
		if(data.inputId === 'loseHP'){
			player.hp = player.hp - 0.5;
			if(player.hp <= 0){
				player.hp = player.hpMax;
				player.x = Math.random() * 800;
				player.y = Math.random() * 500;
				player.landmines = playerLandMines;					
			}
		}	
	});
	
	
	socket.on('sendMsgToServer',function(data){
		for(var i in SOCKET_LIST){
			SOCKET_LIST[i].emit('addToChat',player.username + ': ' + data);
		}
	});
	socket.on('sendPmToServer',function(data){ //data:{username,message}
		var recipientSocket = null;
		for(var i in Player.list)
			if(Player.list[i].username === data.username)
				recipientSocket = SOCKET_LIST[i];
		if(recipientSocket === null){
			socket.emit('addToChat','The player ' + data.username + ' is not online.');
		} else {
			recipientSocket.emit('addToChat','From ' + player.username + ':' + data.message);
			socket.emit('addToChat','To ' + data.username + ':' + data.message);
		}
	});
	
	socket.emit('init',{
		selfId:socket.id,
		player:Player.getAllInitPack(),
		bullet:Bullet.getAllInitPack(),
		landmine:LandMine.getAllInitPack(),

	});
	
}

Player.getAllInitPack = function(){
	var players = [];
	for(var i in Player.list)
		players.push(Player.list[i].getInitPack());
	return players;
}

Player.onDisconnect = function(socket){
	delete Player.list[socket.id];
	removePack.player.push(socket.id);

}
Player.update = function(){
	var pack = [];
	for(var i in Player.list){
		var player = Player.list[i];
		player.update();
		pack.push(player.getUpdatePack());		
	}
	return pack;
}


Bullet = function(param){
	var self = Entity(param);
	self.id = Math.random();
	self.angle = param.angle;
	self.spdX = Math.cos(param.angle/180*Math.PI) * 10;
	self.spdY = Math.sin(param.angle/180*Math.PI) * 10;
	self.parent = param.parent;
	
	self.timer = 0;
	self.toRemove = false;
	var super_update = self.update;
	self.update = function(){
		if(self.timer++ > 100)
			self.toRemove = true;
		super_update();
		
		for(var i in Player.list){
            var p = Player.list[i];
            if(self.getDistance(p) < 32 && self.parent !== p.id){
                p.hp -= 1;

                if(p.hp <= 0){
                    var shooter = Player.list[self.parent];
                    if(shooter)
                        shooter.score += 1;
                        send = true;
                        if(shooter.score == 10) {
                            gameOver = true;

                            winner = Player.list[self.parent].username;
                            // socket.emit('winner', {name: Player.list[self.parent].username});
                        }
                    p.hp = p.hpMax;
                    p.x = Math.random() * 800;
                    p.y = Math.random() * 500;
                }
                self.toRemove = true;
            }
		}
	}
	self.getInitPack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
		};
	}
	self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,		
		};
	}
	
	Bullet.list[self.id] = self;
	initPack.bullet.push(self.getInitPack());
	return self;
}
Bullet.list = {};

LandMine = function(param){
	var self = Entity(param);
	self.id = Math.random();
	self.angle = param.angle;
	self.spdX = 0;
	self.spdY = 0;
	self.parent = param.parent;
	self.timer = 0;
	self.toRemove = false;
	var super_update = self.update;
	self.update = function(){
		super_update();
		
		for(var i in Player.list){
			var p = Player.list[i];
			if(self.getDistance(p) < 32 && self.parent !== p.id){
				p.hp -= 1;
								
				if(p.hp <= 0){
					var shooter = Player.list[self.parent];
					if(shooter)
						shooter.score += 1;
						send = true;
					p.hp = p.hpMax;
					p.x = Math.random() * 800;
					p.y = Math.random() * 500;			
					p.landmines = playerLandMines;		
				}
				self.toRemove = true;
			}
		}
	}
	self.getInitPack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
		};
	}
	self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,		
		};
	}
	
	LandMine.list[self.id] = self;
	initPack.landmine.push(self.getInitPack());
	return self;
}
LandMine.list = {};

Bullet.update = function(){
	var pack = [];
	for(var i in Bullet.list){
		var bullet = Bullet.list[i];
		bullet.update();
		if(bullet.toRemove){
			delete Bullet.list[i];
			removePack.bullet.push(bullet.id);
		} else
			pack.push(bullet.getUpdatePack());		
	}
	return pack;
}

LandMine.update = function(){
	var pack = [];
	for(var i in LandMine.list){
		var landmine = LandMine.list[i];
		landmine.update();
		if(landmine.toRemove){
			delete LandMine.list[i];
			removePack.landmine.push(landmine.id);
		} else
			pack.push(landmine.getUpdatePack());		
	}
	return pack;
}

Bullet.getAllInitPack = function(){
	var bullets = [];
	for(var i in Bullet.list)
		bullets.push(Bullet.list[i].getInitPack());
	return bullets;
}

LandMine.getAllInitPack = function(){
	var landmines = [];
	for(var i in LandMine.list)
		landmines.push(LandMine.list[i].getInitPack());
	return landmines;
}

setInterval(function(){
	var packs = Entity.getFrameUpdateData();
	for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		if(gameOver) {
            console.log("Game is over");
            console.log("The winner is: " + winner);
            socket.emit('winner', {name: winner});
            for(var i in Player.list) {
                Player.list[i].score = 0;
            }
		}
		
		if(send == true) {

			for(var i in Player.list) {
				var score2 = Player.list[i].score;
				var name2 = Player.list[i].username;
				score.push(score2);
				name.push(name2);
				
			}


			socket.emit('userNameArray', {scr: score, nms: name});
			score = [];
			name = [];
		}

		if(start == true) {
			socket.emit('gameStart', {success:true});
		}

		socket.emit('init',packs.initPack);
		socket.emit('update',packs.updatePack);
		socket.emit('remove',packs.removePack);
	}

	send = false;
	start = false;
	gameOver = false;
	
},1000/25);





