"use strict";

var TILES = {
	coin: 'coin',
	empty: 'empty'
};

function clearElementContent(elm) {
	while(elm.firstChild) elm.removeChild(elm.firstChild);
}

class Touches {
	constructor() {
		this.list = {};
	}

	//create update
	cu(touch) {
		if(!this.list[touch.identifier]) {
			this.list[touch.identifier] = {
				identifier: touch.identifier,
				history: []
			};
		}

		this.list[touch.identifier].history.push({
			clientX: touch.clientX, clientY: touch.clientY,
			pageX: touch.pageX, pageY: touch.pageY,
			screenX: touch.screenX, screenY: touch.screenY
		});

		//there is probably no need to save all touches history. only first touch, final touch and two previous touches
		if(this.list[touch.identifier].history.length > 4) {
			this.list[touch.identifier].history.splice(1, 1);
		}

		return this.list[touch.identifier];
	}

	read(touch) {
		return this.list[touch.identifier];
	}

	//delete
	remove(touch) {
		if(typeof touch === 'object') delete this.list[ touch.identifier ];
		else delete this.list[ touch ]; //probably gotten an ID instead of a touch object
	}
}
var touches = new Touches();

window.addEventListener('DOMContentLoaded', (event) => {
	let loginBox = document.querySelector('#loginBox');
	let mainElm = document.querySelector('#game');

	loginBox.querySelector('button').addEventListener('click', (event) => {
		let name = loginBox.querySelector('input').value.trim();
		if(name.length < 2) {
			alert(`Your name must be at least 2 characters long`);
			return;
		}
		let goldRushInstance = new OH('gold_rush', (obj) => {
			loginBox.style.display = 'none';
			mainElm.style.display = 'block';

			new GoldRush(obj, goldRushInstance.id, {
				main: mainElm,
				matrix: mainElm.querySelector('div.matrix'),
				players: mainElm.querySelector('div.players-info'),
				console: mainElm.querySelector('div.console')
			});
		}, {name: name}, { emitReference: false });
	});

	mainElm.querySelector(':scope > button.new-game').addEventListener('click', (event) => {
		fetch('/start-new-game');
	});
	mainElm.querySelector(':scope > button.reset-game').addEventListener('click', (event) => {
		fetch('/reset-game');
	});
});

class GoldRush {
	constructor(oh, myID, elements) {
		this.oh = oh;
		this.myID = myID;
		this.me = oh.players[myID];
		this.elements = elements;
		this.touches = [];

		paintMap(this.oh.map, this.elements.matrix, this.myID);
		this.printPlayers();
		this.bindEvents();
	}

	bindEvents() {
		this.oh.map.on('change', changes => {
			let isNewMap = false;
			for(let change of changes) {
				if(change.path === '') {
					isNewMap = true;
					break;
				}
			}
			
			if(isNewMap) paintMap(this.oh.map, this.elements.matrix, this.myID);
			else updateMap(this.oh.map, this.elements.matrix, this.myID, changes);
		});
		this.oh.log.on('change', changes => { this.updateLog(changes); });
		this.oh.players.on('change', changes => { this.printPlayers(); });
		this.me.position.on('update', change => { this.updateMyPosition(change); });

		document.addEventListener('keyup', event => {
			if(event.key === 'ArrowUp') this.movePlayer('up');
			else if(event.key === 'ArrowDown') this.movePlayer('down');
			else if(event.key === 'ArrowLeft') this.movePlayer('left');
			else if(event.key === 'ArrowRight') this.movePlayer('right');
		});

		this.elements.matrix.addEventListener('touchstart', event => this.onTouchStart(event));
		this.elements.matrix.addEventListener('touchmove', event => this.onTouchMove(event));
		this.elements.matrix.addEventListener('touchcancel', event => this.onTouchCancel(event));
		this.elements.matrix.addEventListener('touchend', event => this.onTouchEnd(event));
	}

	printPlayers() {
		clearElementContent(this.elements.players);
		let playerKeys = Object.keys(this.oh.players);
		for(let key of playerKeys) {
			let player = this.oh.players[key];
			let pre = document.createElement('pre');
			pre.textContent = `Player: ${player.name}\nScore: ${player.score}\nPosition (x,y): [${player.position.x}, ${player.position.y}]`;
			this.elements.players.append(pre);
		}
	}

	updateLog(changes) {
		for(let change of changes) {
			let index = Proxserve.splitPath(change.path);
			if(change.type === 'create') {
				this.addLogEntry(index, change.value);
			} else if(change.type === 'delete') {
				this.removeLogEntry(index);
			} else {
				console.warn('Unexpected log message', change);
			}
		}
	}
	addLogEntry(index, msg) {
		let wasScrolledToBottom = (this.elements.console.offsetHeight + this.elements.console.scrollTop >= this.elements.console.scrollHeight -5);
		let span = document.createElement('span');
		span.classList.add('log-'+index);
		span.textContent = msg;
		span.appendChild(document.createElement('br'));
		this.elements.console.appendChild(span);
		//keep scrolling the console to the bottom if it was at the bottom before
		if(wasScrolledToBottom) {
			setTimeout(() => { this.elements.console.scrollTo(0, this.elements.console.scrollHeight - this.elements.console.offsetHeight); }, 1);
		}
	}
	removeLogEntry(index) {
		let span = this.elements.console.querySelector('span.log-'+index);
		if(span) { //server might be trying to delete logs that existed before we logged in
			this.elements.console.removeChild(span);
		}
	}

	onTouchStart(event) {
		event.preventDefault();

		for(let i=0; i < event.changedTouches.length; i++) {
			touches.cu(event.changedTouches[i]);
		}
	}
	onTouchMove(event) {
		this.onTouchStart(event); //both do the same
	}
	onTouchCancel(event) {
		for(let i=0; i < event.changedTouches.length; i++) {
			touches.remove(event.changedTouches[i]);
		}
	}
	onTouchEnd(event) {
		for(let i=0; i < event.changedTouches.length; i++) {
			if(i === 0) { //we handle only a single touch
				let touch = touches.read(event.changedTouches[i]);
				let startingPoint = touch.history[0];
				let endingPoint = touch.history[ touch.history.length - 1 ];
				let xDelta = endingPoint.pageX - startingPoint.pageX;
				let yDelta = endingPoint.pageY - startingPoint.pageY;

				if(xDelta > 50) this.movePlayer('right');
				else if(xDelta < -50) this.movePlayer('left');

				if(yDelta > 50) this.movePlayer('down');
				else if(yDelta < -50) this.movePlayer('up');
			}

			touches.remove(event.changedTouches[i]);
		}
	}

	movePlayer(direction) {
		//player out of bounds means player is not currently playing
		if(this.me.position.y < 0 || this.me.position.x < 0) {
			return;
		}

		let rows = this.oh.map.length;
		let cols = this.oh.map[0].length;
		let newX = this.me.position.x;
		let newY = this.me.position.y;

		if(direction === 'up' && this.me.position.y > 0) newY -= 1;
		else if(direction === 'down' && this.me.position.y < rows - 1) newY += 1;
		else if(direction === 'left' && this.me.position.x > 0) newX -= 1;
		else if(direction === 'right' && this.me.position.x < cols - 1) newX += 1;

		if(this.oh.map[newY][newX] in TILES) { //meaning we are not going to eat another player
			//this.me.position.y = newY;
			//this.me.position.x = newX;
			this.me.position = { y: newY, x: newX };
		}
	}
	
	updateMyPosition(change) {
		//player out of bounds means player is not currently playing
		if(this.me.position.y < 0 || this.me.position.x < 0) {
			return;
		}

		let newY = this.me.position.y;
		let newX = this.me.position.x;
		if(newX >= 0 && newY >= 0) { //player is in boundaries
			try {
				if(this.oh.map[ newY ][ newX ] === TILES.coin) {
					this.me.score += 1;
				}
				this.oh.map[ newY ][ newX ] = this.myID;
			}
			catch(err) {
				console.warn(`failed updating new position. probably a race condition between old and new map`);
				console.error(err);
			}
		}

		let oldY = change.oldValue.y;
		let oldX = change.oldValue.x;
		if(oldX >= 0 && oldY >= 0) { //player is in boundaries
			try {
				this.oh.map[ oldY ][ oldX ] = TILES.empty;
			}
			catch(err) {
				console.warn(`failed updating old position. probably a race condition between old and new map`);
				//console.error(err);
			}
		}
	}
}

//UI functions
function paintMap(map, matrixElm, myID) {
	clearElementContent(matrixElm);
	
	let rows = map.length;
	let cols = map[0].length;
	matrixElm.style.width = `${cols * 40}px`;
	matrixElm.style.height = `${rows * 40}px`;

	for(let y=0; y < rows; y++) {
		for(let x=0; x < cols; x++) {
			let span = document.createElement('span');
			span.classList.add(`y${y}`, `x${x}`);
			matrixElm.append(span);

			paintTile(map, matrixElm, y, x, myID);
		}
	}
}
function updateMap(map, matrixElm, myID, changes) {
	for(let change of changes) {
		let [y, x] = Proxserve.splitPath(change.path);
		y = parseInt(y, 10);
		x = parseInt(x, 10);
		paintTile(map, matrixElm, y, x, myID);
	}
}
function paintTile(map, matrixElm, y, x, myID) {
	let span = matrixElm.querySelector(`span.y${y}.x${x}`);
	if(span === null) {
		//matrix map wasn't created yet. this happens when a
		//new games begins and then both, map and player position, gets updated (race condition)
		return;
	}
	clearElementContent(span);

	if(map[y][x] === TILES.coin) {
		let i = document.createElement('i');
		i.classList.add('coin');
		span.append(i);
	}
	else if(!(map[y][x] in TILES)) { //is a player
		let i = document.createElement('i');
		i.classList.add('player');

		if(map[y][x] === myID) { //it's the players character
			i.classList.add('me');
		}
		span.append(i);
	}
}