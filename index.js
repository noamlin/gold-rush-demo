"use strict"

const path = require('path');
const baseDir = __dirname;
const http = require('http');
const express = require('express');
const app = express();
const OH = require('object-hub');

const PORT = process.env.PORT || 1337;
const server = http.createServer(app);
server.listen(PORT, () => {
	console.log(`server is listening on port ${PORT}`);
});

app.get('/', (req, res) => { res.sendFile(`${baseDir}/index.html`); });
app.get('/start-new-game', (req, res) => { newGame(); res.end(); });
app.get('/reset-game', (req, res) => { newGame(true); res.end(); });

app.get('/oh.js', (req, res) => { res.sendFile(`${baseDir}/node_modules/object-hub/client-side/oh.js`); });
app.get('/proxserve.js', (req, res) => { res.sendFile(`${baseDir}/node_modules/proxserve/index.js`); });
app.use('/public-files', express.static(`${baseDir}/public-files`));

var TILES = {
	coin: 'coin',
	empty: 'empty'
};
var goldRush = new OH('gold_rush', server, {
	players: {},
	map: [[TILES.coin]],
	log: []
});
var goldRushInstance = OH.getInstance(goldRush);

goldRushInstance.setPermissions('players', 0, 'no_one'); //will be overwritten later when players log in

function gameLog(str) {
	goldRush.log.push(str);
	trimGameLog(100);
}
function trimGameLog(trimTo) {
	let oldestMessage = goldRush.log.length - trimTo;
	if(oldestMessage >= 0) {
		delete goldRush.log[oldestMessage];
	}
}

goldRushInstance.on('connection', function(client, clientData, init) {
	client.name = clientData.name;
	console.log(`Client ${client.name} connected`);
	gameLog(`Client ${client.name} connected.`);

	if(this.clients.size > 4) {
		return; //don't connect more than 8 players
	}

	goldRushInstance.setPermissions(`players.${client.id}`, 0, client.id);
	goldRush.players[client.id] = {
		name: client.name,
		score: 0,
		position: { x: -1, y: -1 }
	};

	init();
});
goldRushInstance.on('disconnection', function(client, reason) {
	console.log(`Client ${client.name} disconnected`);
	gameLog(`Client ${client.name} disconnected.`);

	delete goldRush.players[client.id];

	let rows = goldRush.map.length;
	let cols = goldRush.map[0].length;
	for(let y=0; y < rows; y++) {
		for(let x=0; x < cols; x++) {
			if(goldRush.map[y][x] === client.id) {
				goldRush.map[y][x] = TILES.empty;
			}
		}
	}

	if(this.clients.size === 0) {
		goldRush.map = [[TILES.empty]];
	}
});

function newGame(reset=false) {
	let minRows = 10, maxRows = 16,
		minCols = 8, maxCols = 14;
	let rows = minRows + Math.round(Math.random() * (maxRows - minRows));
	let cols = minCols + Math.floor(Math.random() * (maxCols - minCols));
	let map = [];

	let remainingCoins = Math.ceil((rows * cols - 4) * 0.6);

	for(let y=0; y < rows; y++) {
		map[y] = [];
		for(let x=0; x < cols; x++) {
			if(remainingCoins > 0) {
				let isCoin = Math.random();
				if(isCoin > 0.5) {
					map[y][x] = TILES.coin;
					remainingCoins--;
				} else {
					map[y][x] = TILES.empty;
				}
			} else {
				map[y][x] = TILES.empty;
			}
		}
	}

	//will place up to 4 players at the edges of the map
	let playerKeys = Object.keys(goldRush.players);
	for(let playerID of playerKeys) {
		let player = goldRush.players[playerID];

		if(map[0][0] in TILES) {
			map[0][0] = playerID;
			player.position = { y: 0, x: 0 };
		}
		else if(map[rows - 1][cols - 1] in TILES) {
			map[rows - 1][cols - 1] = playerID;
			player.position = { y: rows - 1, x: cols - 1 };
		}
		else if(map[0][cols - 1] in TILES) {
			map[0][cols - 1] = playerID;
			player.position = { y: 0, x: cols - 1 };
		}
		else if(map[rows - 1][0] in TILES) {
			map[rows - 1][0] = playerID;
			player.position = { y: rows - 1, x: 0 };
		}
	}

	goldRush.map = map; //set the new matrix

	if(reset) {
		for(let playerID of playerKeys) {
			goldRush.players[playerID].score = 0;
		}
		gameLog('Game has been reset.');
	}
	else {
		let topPlayer = null;
		for(let playerID of playerKeys) {
			if(topPlayer === null || topPlayer.score < goldRush.players[playerID].score) {
				topPlayer = goldRush.players[playerID];
			}
		}
		if(topPlayer.score > 0) {
			gameLog(`${topPlayer.name} is on the lead with ${topPlayer.score} points!`);
		}
		gameLog('A new game begins.');
	}
}